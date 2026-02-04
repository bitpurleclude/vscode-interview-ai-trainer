import fs from "fs";
import path from "path";
import { it_callEmbedding } from "../../api/it_embedding";
import { it_hashText } from "../../utils/it_text";
import type {
  ItCorpusItem,
  ItEmbeddingWarmupOptions,
  ItEmbeddingWarmupResult,
  ItNoteHit,
  ItRetrievalOptions,
  ItVectorSearchConfig,
} from "./types";
import { it_getItemKey, it_normalizeEmbeddingBaseUrl } from "./utils";

export const IT_CORPUS_CACHE_VERSION = 1;
const IT_EMBEDDING_CACHE_VERSION = 1;
const IT_DEFAULT_BATCH_SIZE = 16;

const cachedEmbeddings: Map<string, Map<string, number[]>> = new Map();
const cachedQueries: Map<string, ItNoteHit[]> = new Map();
const cachedQueryEmbeddings: Map<string, number[]> = new Map();
const cachedQueryEmbeddingPromises: Map<string, Promise<number[]>> = new Map();
const cachedEmbeddingEnsurePromises: Map<string, Promise<ItEmbeddingEnsureResult>> =
  new Map();
const loggedEmbeddingCacheLoads: Set<string> = new Set();
const loggedEmbeddingCacheWrites: Set<string> = new Set();

let cachedCorpus:
  | {
      key: string;
      dirMtimes: Record<string, number>;
      corpus: ItCorpusItem[];
    }
  | undefined;

interface ItEmbeddingEnsureResult {
  created: number;
  totalMissing: number;
}

export function it_getCachedCorpus():
  | { key: string; dirMtimes: Record<string, number>; corpus: ItCorpusItem[] }
  | undefined {
  return cachedCorpus;
}

export function it_setCachedCorpus(
  value?: { key: string; dirMtimes: Record<string, number>; corpus: ItCorpusItem[] },
): void {
  cachedCorpus = value;
}

export function it_clearEmbeddingMemoryCache(cacheKey?: string): void {
  if (cacheKey) {
    cachedEmbeddings.delete(cacheKey);
    return;
  }
  cachedEmbeddings.clear();
  cachedQueries.clear();
  cachedQueryEmbeddings.clear();
  cachedQueryEmbeddingPromises.clear();
  cachedEmbeddingEnsurePromises.clear();
  cachedCorpus = undefined;
}

export function it_getCorpusCachePath(cacheDir: string, key: string): string {
  const safe = it_hashText(`${IT_CORPUS_CACHE_VERSION}:${key}`);
  return path.join(cacheDir, "corpus_cache", `${safe}.json`);
}

export function it_getQueryCacheKey(
  query: string,
  options: ItRetrievalOptions,
): string {
  const mode = options.mode || "vector";
  const topK = Number.isFinite(options.topK) ? Math.max(1, options.topK) : 5;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 0;
  const vectorKey =
    mode === "vector" && options.vector
      ? it_buildEmbeddingCacheKey(options.vector)
      : "keyword";
  const queryKey = query.trim().slice(0, 300);
  const raw = `${mode}|${topK}|${minScore}|${vectorKey}|${options.cacheKey || ""}|${queryKey}`;
  return it_hashText(raw);
}

export function it_getCachedQuery(key: string): ItNoteHit[] | undefined {
  const cached = cachedQueries.get(key);
  if (!cached) {
    return undefined;
  }
  cachedQueries.delete(key);
  cachedQueries.set(key, cached);
  return cached;
}

export function it_setCachedQuery(
  key: string,
  value: ItNoteHit[],
  maxSize: number,
): void {
  cachedQueries.set(key, value);
  if (cachedQueries.size <= maxSize) {
    return;
  }
  const firstKey = cachedQueries.keys().next().value;
  if (firstKey) {
    cachedQueries.delete(firstKey);
  }
}

export function it_getCachedQueryEmbedding(key: string): number[] | undefined {
  const cached = cachedQueryEmbeddings.get(key);
  if (!cached) {
    return undefined;
  }
  cachedQueryEmbeddings.delete(key);
  cachedQueryEmbeddings.set(key, cached);
  return cached;
}

export function it_setCachedQueryEmbedding(
  key: string,
  value: number[],
  maxSize: number,
): void {
  cachedQueryEmbeddings.set(key, value);
  if (cachedQueryEmbeddings.size <= maxSize) {
    return;
  }
  const firstKey = cachedQueryEmbeddings.keys().next().value;
  if (firstKey) {
    cachedQueryEmbeddings.delete(firstKey);
  }
}

export async function it_getOrCreateQueryEmbedding(
  key: string,
  create: () => Promise<number[]>,
): Promise<number[]> {
  let pending = cachedQueryEmbeddingPromises.get(key);
  if (!pending) {
    pending = create();
    cachedQueryEmbeddingPromises.set(key, pending);
  }
  try {
    return await pending;
  } finally {
    if (cachedQueryEmbeddingPromises.get(key) === pending) {
      cachedQueryEmbeddingPromises.delete(key);
    }
  }
}

export function it_buildEmbeddingCacheKey(cfg: ItVectorSearchConfig): string {
  if (cfg.template) {
    const url = cfg.template.request?.url || "";
    const stamp = cfg.template.updatedAt || "";
    return `template:${cfg.template.id}|${url}|${stamp}`;
  }
  return `${cfg.provider}|${it_normalizeEmbeddingBaseUrl(cfg.baseUrl)}|${cfg.model}`;
}

export function it_getEmbeddingCachePath(cacheDir: string, cacheKey: string): string {
  return path.join(cacheDir, `embeddings-${it_hashText(cacheKey)}.json`);
}

export function it_loadEmbeddingCache(
  cachePath: string,
  cacheKey: string,
): Map<string, number[]> {
  try {
    const raw = fs.readFileSync(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (
      parsed?.version !== IT_EMBEDDING_CACHE_VERSION ||
      parsed?.modelKey !== cacheKey ||
      typeof parsed?.items !== "object"
    ) {
      return new Map();
    }
    const map = new Map<string, number[]>();
    Object.entries(parsed.items).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        map.set(key, value as number[]);
      }
    });
    return map;
  } catch {
    return new Map();
  }
}

export function it_saveEmbeddingCache(
  cachePath: string,
  cacheKey: string,
  cache: Map<string, number[]>,
): void {
  const items: Record<string, number[]> = {};
  cache.forEach((value, key) => {
    items[key] = value;
  });
  const payload = {
    version: IT_EMBEDDING_CACHE_VERSION,
    modelKey: cacheKey,
    items,
  };
  fs.mkdirSync(path.dirname(cachePath), { recursive: true });
  fs.writeFileSync(cachePath, JSON.stringify(payload), "utf8");
}

export function it_getEmbeddingCache(
  cacheKey: string,
  cachePath?: string,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): Map<string, number[]> {
  let cache = cachedEmbeddings.get(cacheKey);
  if (!cache) {
    cache = cachePath ? it_loadEmbeddingCache(cachePath, cacheKey) : new Map();
    cachedEmbeddings.set(cacheKey, cache);
    if (cachePath && !loggedEmbeddingCacheLoads.has(cachePath)) {
      loggedEmbeddingCacheLoads.add(cachePath);
      onTrace?.("向量缓存读取", {
        cachePath,
        items: cache.size,
      });
    }
  }
  return cache;
}

export async function it_embedTexts(
  cfg: ItVectorSearchConfig,
  texts: string[],
): Promise<number[][]> {
  if (!texts.length) {
    return [];
  }
  return it_callEmbedding(cfg, texts);
}

async function it_ensureEmbeddings(
  cfg: ItVectorSearchConfig,
  corpus: ItCorpusItem[],
  cache: Map<string, number[]>,
): Promise<ItEmbeddingEnsureResult> {
  const batchSize = Math.max(1, cfg.batchSize || IT_DEFAULT_BATCH_SIZE);
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
  let created = 0;
  for (let i = 0; i < missing.length; i += batchSize) {
    const batch = missing.slice(i, i + batchSize);
    const embeddings = await it_embedTexts(
      cfg,
      batch.map((entry) => entry.text),
    );
    if (!embeddings.length) {
      continue;
    }
    embeddings.forEach((vector, idx) => {
      const entry = batch[idx];
      if (!entry || !Array.isArray(vector) || !vector.length) {
        return;
      }
      cache.set(entry.key, vector);
      created += 1;
    });
  }
  return { created, totalMissing: missing.length };
}

export async function it_ensureEmbeddingCacheOnce(
  ensureKey: string,
  vectorCfg: ItVectorSearchConfig,
  corpus: ItCorpusItem[],
  cache: Map<string, number[]>,
  cachePath?: string,
  options?: {
    onTrace?: (message: string, detail?: Record<string, unknown>) => void;
    pruneStale?: boolean;
  },
): Promise<ItEmbeddingEnsureResult> {
  let pending = cachedEmbeddingEnsurePromises.get(ensureKey);
  if (!pending) {
    pending = (async () => {
      const validKeys = new Set(corpus.map((item) => it_getItemKey(item)));
      const result = await it_ensureEmbeddings(vectorCfg, corpus, cache);
      const pruneStale = options?.pruneStale !== false;
      let hasStale = false;
      if (pruneStale) {
        for (const key of cache.keys()) {
          if (!validKeys.has(key)) {
            cache.delete(key);
            hasStale = true;
          }
        }
      }
      if (cachePath && (result.created > 0 || hasStale)) {
        try {
          it_saveEmbeddingCache(cachePath, it_buildEmbeddingCacheKey(vectorCfg), cache);
          if (!loggedEmbeddingCacheWrites.has(cachePath)) {
            loggedEmbeddingCacheWrites.add(cachePath);
            options?.onTrace?.("向量缓存写入", {
              cachePath,
              items: cache.size,
            });
          }
        } catch {
          // ignore cache write failure
        }
      }
      return result;
    })();
    cachedEmbeddingEnsurePromises.set(ensureKey, pending);
  }
  try {
    return await pending;
  } finally {
    if (cachedEmbeddingEnsurePromises.get(ensureKey) === pending) {
      cachedEmbeddingEnsurePromises.delete(ensureKey);
    }
  }
}

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
      if (!loggedEmbeddingCacheWrites.has(cachePath)) {
        loggedEmbeddingCacheWrites.add(cachePath);
        options.onTrace?.("向量缓存写入", {
          cachePath,
          items: cache.size,
        });
      }
    } catch {
      // ignore cache write failure
    }
  }
  return { total, created, cached, aborted, cachePath };
}
