import fs from "fs";
import path from "path";
import { it_requestEmbeddings } from "../clients/embeddingClient";
import { it_hashText } from "../utils/it_text";
import type { ItCorpusItem } from "../../domain/notes/types";
import type { ItVectorSearchConfig } from "./types";
import { it_getItemKey, it_normalizeEmbeddingBaseUrl } from "./utils";
import { IT_DEFAULT_BATCH_SIZE, IT_EMBEDDING_CACHE_VERSION } from "./cache_constants";

export interface ItEmbeddingEnsureResult {
  created: number;
  totalMissing: number;
}

const cachedEmbeddings: Map<string, Map<string, number[]>> = new Map();
const cachedEmbeddingEnsurePromises: Map<string, Promise<ItEmbeddingEnsureResult>> =
  new Map();
const loggedEmbeddingCacheLoads: Set<string> = new Set();
const loggedEmbeddingCacheWrites: Set<string> = new Set();

export function it_clearEmbeddingCaches(cacheKey?: string): void {
  if (cacheKey) {
    cachedEmbeddings.delete(cacheKey);
    return;
  }
  cachedEmbeddings.clear();
  cachedEmbeddingEnsurePromises.clear();
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
  return it_requestEmbeddings(cfg, texts);
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

function it_logEmbeddingCacheWriteOnce(
  cachePath: string,
  items: number,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): void {
  if (loggedEmbeddingCacheWrites.has(cachePath)) {
    return;
  }
  loggedEmbeddingCacheWrites.add(cachePath);
  onTrace?.("向量缓存写入", {
    cachePath,
    items,
  });
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
          it_logEmbeddingCacheWriteOnce(cachePath, cache.size, options?.onTrace);
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

export function it_logEmbeddingCacheWrite(
  cachePath: string,
  items: number,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): void {
  it_logEmbeddingCacheWriteOnce(cachePath, items, onTrace);
}
