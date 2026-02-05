import type {
  ItCorpusItem,
  ItEmbeddingWarmupOptions,
  ItEmbeddingWarmupResult,
  ItVectorSearchConfig,
} from "./types";
import { IT_DEFAULT_BATCH_SIZE } from "./cache_constants";
import {
  it_buildEmbeddingCacheKey,
  it_embedTexts,
  it_getEmbeddingCache,
  it_getEmbeddingCachePath,
  it_logEmbeddingCacheWrite,
  it_saveEmbeddingCache,
} from "./cache_embedding";
import { it_getItemKey } from "./utils";

export async function it_prepareEmbeddingCache(
  corpus: ItCorpusItem[],
  vectorCfg: ItVectorSearchConfig,
  options: ItEmbeddingWarmupOptions = {},
): Promise<ItEmbeddingWarmupResult> {
  if (
    !vectorCfg ||
    (!vectorCfg.template &&
      (!vectorCfg.provider ||
        !vectorCfg.apiKey ||
        !vectorCfg.baseUrl ||
        !vectorCfg.model))
  ) {
    throw new Error("vector retrieval config incomplete");
  }
  const cacheKey = it_buildEmbeddingCacheKey(vectorCfg);
  const cachePath = options.cacheDir
    ? it_getEmbeddingCachePath(options.cacheDir, cacheKey)
    : undefined;
  const cache = it_getEmbeddingCache(cacheKey, cachePath, options.onTrace);
  const missing: Array<{ key: string; text: string }> = [];
  for (const item of corpus) {
    const key = it_getItemKey(item);
    if (cache.has(key)) {
      continue;
    }
    const text = item.text.trim();
    if (!text) {
      continue;
    }
    missing.push({ key, text });
  }
  const total = missing.length;
  const cached = Math.max(0, corpus.length - total);
  const batchSize = Math.max(1, vectorCfg.batchSize || IT_DEFAULT_BATCH_SIZE);
  const maxConcurrency = Number.isFinite(options.maxConcurrency)
    ? Math.max(1, Math.floor(Number(options.maxConcurrency)))
    : 1;
  options.onProgress?.(0, total);
  options.onTrace?.("向量预计算任务", {
    total,
    cached,
    batchSize,
    maxConcurrency,
  });
  const batches: Array<Array<{ key: string; text: string }>> = [];
  for (let i = 0; i < missing.length; i += batchSize) {
    batches.push(missing.slice(i, i + batchSize));
  }
  const runWithLimit = async <T>(
    list: T[],
    limit: number,
    task: (item: T) => Promise<void>,
  ): Promise<void> => {
    if (!list.length) {
      return;
    }
    let cursor = 0;
    const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
      while (cursor < list.length) {
        if (options.signal?.aborted) {
          aborted = true;
          return;
        }
        const index = cursor;
        cursor += 1;
        await task(list[index]);
      }
    });
    await Promise.all(workers);
  };
  let created = 0;
  let done = 0;
  let aborted = false;
  await runWithLimit(batches, maxConcurrency, async (batch) => {
    if (options.signal?.aborted) {
      aborted = true;
      return;
    }
    const embeddings = await it_embedTexts(
      vectorCfg,
      batch.map((entry) => entry.text),
    );
    embeddings.forEach((vector, idx) => {
      const entry = batch[idx];
      if (!entry || !Array.isArray(vector) || !vector.length) {
        return;
      }
      cache.set(entry.key, vector);
      created += 1;
    });
    done += batch.length;
    options.onProgress?.(done, total);
  });
  if (aborted) {
    options.onTrace?.("向量预计算已中止", { done, total, created });
  } else {
    options.onTrace?.("向量预计算完成", { done, total, created, cached });
  }

  const validKeys = new Set(corpus.map((item) => it_getItemKey(item)));
  let hasStale = false;
  for (const key of cache.keys()) {
    if (!validKeys.has(key)) {
      cache.delete(key);
      hasStale = true;
    }
  }
  if (cachePath && (created > 0 || hasStale)) {
    try {
      it_saveEmbeddingCache(cachePath, cacheKey, cache);
      it_logEmbeddingCacheWrite(cachePath, cache.size, options.onTrace);
    } catch {
      // ignore cache write failure
    }
  }
  return { total, created, cached, aborted, cachePath };
}