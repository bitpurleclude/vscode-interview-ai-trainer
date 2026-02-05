import { it_hashText } from "../utils/it_text";
import type { ItNoteHit } from "../../domain/notes/types";
import type { ItRetrievalOptions } from "./types";
import { it_buildEmbeddingCacheKey } from "./cache_embedding";

const cachedQueries: Map<string, ItNoteHit[]> = new Map();
const cachedQueryEmbeddings: Map<string, number[]> = new Map();
const cachedQueryEmbeddingPromises: Map<string, Promise<number[]>> = new Map();

export function it_clearQueryCaches(): void {
  cachedQueries.clear();
  cachedQueryEmbeddings.clear();
  cachedQueryEmbeddingPromises.clear();
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
