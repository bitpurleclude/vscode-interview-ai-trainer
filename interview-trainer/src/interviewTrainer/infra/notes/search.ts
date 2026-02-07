import { it_hashText } from "../utils/it_text";
import type {
  ItCorpusItem,
  ItNoteHit,
} from "../../domain/notes/types";
import type { ItRetrievalMetrics, ItRetrievalOptions } from "./types";
import {
  it_buildSnippet,
  it_cosineSimilarity,
  it_scoreTokens,
  it_tokenize,
} from "../../domain/notes/utils";
import { it_getItemKey } from "./utils";
import {
  it_buildEmbeddingCacheKey,
  it_embedTexts,
  it_ensureEmbeddingCacheOnce,
  it_getCachedQuery,
  it_getCachedQueryEmbedding,
  it_getEmbeddingCache,
  it_getEmbeddingCachePath,
  it_getOrCreateQueryEmbedding,
  it_getQueryCacheKey,
  it_setCachedQuery,
  it_setCachedQueryEmbedding,
} from "./cache";
import { it_mergeQueryHits } from "../../domain/notes/ranking";

const IT_DEFAULT_QUERY_MAX_CHARS = 1500;
const IT_DEFAULT_QUERY_CACHE_SIZE = 200;

export function it_createRetrievalMetrics(): ItRetrievalMetrics {
  return {
    queryCount: 0,
    queryEmbeddingHit: 0,
    queryEmbeddingMiss: 0,
    embeddingMissing: 0,
    embeddingCreated: 0,
    ensureKeys: new Set(),
    phaseKeys: new Set(),
  };
}

function it_reportPhaseOnce(options: ItRetrievalOptions, phase: string): void {
  if (!options.onPhase) {
    return;
  }
  const metrics = options.metrics;
  if (metrics) {
    if (metrics.phaseKeys.has(phase)) {
      return;
    }
    metrics.phaseKeys.add(phase);
  }
  options.onPhase(phase);
}

export async function it_retrieveNotes(
  query: string,
  corpus: ItCorpusItem[],
  options: ItRetrievalOptions,
): Promise<ItNoteHit[]> {
  if (!query || !corpus.length) {
    return [];
  }
  const maxCacheSize = Number.isFinite(options.queryCacheSize)
    ? Math.max(0, Number(options.queryCacheSize))
    : IT_DEFAULT_QUERY_CACHE_SIZE;
  if (maxCacheSize > 0) {
    const cacheKey = it_getQueryCacheKey(query, options);
    const cached = it_getCachedQuery(cacheKey);
    if (cached) {
      return cached;
    }
  }
  const topK = Number.isFinite(options.topK) ? Math.max(1, options.topK) : 5;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 0;
  const mode = options.mode || "vector";
  if (mode === "keyword") {
    it_reportPhaseOnce(options, "关键词匹配");
    const queryTokens = it_tokenize(query);
    const scored = corpus
      .map((item) => {
        const score = it_scoreTokens(queryTokens, it_tokenize(item.text));
        return { score, item };
      })
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    const hits = scored.map(({ score, item }) => ({
      score: Number(score.toFixed(3)),
      source: item.source,
      snippet: it_buildSnippet(item.text),
    }));
    if (maxCacheSize > 0) {
      const cacheKey = it_getQueryCacheKey(query, options);
      it_setCachedQuery(cacheKey, hits, maxCacheSize);
    }
    return hits;
  }
  if (mode !== "vector") {
    return [];
  }

  const vectorCfg = options.vector;
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
  const queryMaxChars =
    vectorCfg.queryMaxChars || IT_DEFAULT_QUERY_MAX_CHARS;
  const trimmedQuery =
    queryMaxChars > 0 ? query.trim().slice(0, queryMaxChars) : query.trim();
  if (!trimmedQuery) {
    return [];
  }

  it_reportPhaseOnce(options, "生成查询向量");
  const embeddingCacheKey = it_hashText(
    `${it_buildEmbeddingCacheKey(vectorCfg)}|${trimmedQuery}`,
  );
  let queryEmbedding = it_getCachedQueryEmbedding(embeddingCacheKey);
  const metrics = options.metrics;
  if (metrics) {
    if (queryEmbedding) {
      metrics.queryEmbeddingHit += 1;
    } else {
      metrics.queryEmbeddingMiss += 1;
    }
  }
  if (!queryEmbedding) {
    queryEmbedding = await it_getOrCreateQueryEmbedding(
      embeddingCacheKey,
      async () => {
        const vectors = await it_embedTexts(vectorCfg, [trimmedQuery]);
        return vectors[0] || [];
      },
    );
    if (queryEmbedding && queryEmbedding.length && maxCacheSize > 0) {
      it_setCachedQueryEmbedding(embeddingCacheKey, queryEmbedding, maxCacheSize);
    }
  }
  if (!queryEmbedding || !queryEmbedding.length) {
    return [];
  }

  const cacheKey = it_buildEmbeddingCacheKey(vectorCfg);
  const cachePath = options.cacheDir
    ? it_getEmbeddingCachePath(options.cacheDir, cacheKey)
    : undefined;
  const cache = it_getEmbeddingCache(cacheKey, cachePath, options.onTrace);
  const ensureKey = it_hashText(
    `${cacheKey}|${options.cacheKey || ""}|${corpus.length}`,
  );
  it_reportPhaseOnce(options, "语料向量补算");
  const ensureResult = await it_ensureEmbeddingCacheOnce(
    ensureKey,
    vectorCfg,
    corpus,
    cache,
    cachePath,
    {
      onTrace: options.onTrace,
      pruneStale: false,
    },
  );
  if (metrics && !metrics.ensureKeys.has(ensureKey)) {
    metrics.ensureKeys.add(ensureKey);
    metrics.embeddingMissing += ensureResult.totalMissing;
    metrics.embeddingCreated += ensureResult.created;
  }

  it_reportPhaseOnce(options, "相似度计算");
  const scored = corpus
    .map((item) => {
      const embedding = cache.get(it_getItemKey(item));
      if (!embedding) {
        return null;
      }
      const score = it_cosineSimilarity(queryEmbedding, embedding);
      return { score, item };
    })
    .filter((entry): entry is { score: number; item: ItCorpusItem } => {
      return Boolean(entry && Number.isFinite(entry.score));
    })
    .filter((entry) => entry.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  const hits = scored.map(({ score, item }) => ({
    score: Number(score.toFixed(3)),
    source: item.source,
    snippet: it_buildSnippet(item.text),
  }));
  if (maxCacheSize > 0) {
    const cacheKey = it_getQueryCacheKey(query, options);
    it_setCachedQuery(cacheKey, hits, maxCacheSize);
  }
  return hits;
}

export async function it_retrieveNotesMulti(
  queries: string[],
  corpus: ItCorpusItem[],
  options: ItRetrievalOptions,
): Promise<ItNoteHit[]> {
  const normalized = Array.from(
    new Set(
      queries.map((q) => q.trim()).filter((q) => q.length > 0),
    ),
  );
  if (!normalized.length || !corpus.length) {
    return [];
  }
  const windowSize = Number.isFinite(options.queryWindowSize)
    ? Math.max(1, Math.floor(Number(options.queryWindowSize)))
    : 8;
  const windows: string[][] = [];
  for (let i = 0; i < normalized.length; i += windowSize) {
    windows.push(normalized.slice(i, i + windowSize));
  }

  const topK = Number.isFinite(options.topK) ? Math.max(1, options.topK) : 5;
  const baseMinScore = Number.isFinite(options.minScore) ? options.minScore : 0;
  const perQueryTopK = Math.max(topK, Math.min(topK * 2, 20));
  const maxConcurrency = Number.isFinite(options.maxConcurrency)
    ? Math.max(1, Number(options.maxConcurrency))
    : 3;
  const metrics = options.metrics ?? it_createRetrievalMetrics();
  options.metrics = metrics;
  metrics.queryCount = normalized.length;

  const runWithLimit = async <T, R>(
    list: T[],
    limit: number,
    task: (item: T) => Promise<R>,
  ): Promise<R[]> => {
    const results: R[] = new Array(list.length);
    let cursor = 0;
    const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(list[index]);
      }
    });
    await Promise.all(workers);
    return results;
  };

  const runOnce = async (minScore: number): Promise<ItNoteHit[]> => {
    const collectedLists: ItNoteHit[][] = [];
    for (const windowQueries of windows) {
      const lists = await runWithLimit(windowQueries, maxConcurrency, (query) =>
        it_retrieveNotes(query, corpus, {
          ...options,
          topK: perQueryTopK,
          minScore,
        }),
      );
      collectedLists.push(...lists);
    }
    return it_mergeQueryHits(collectedLists, topK);
  };

  const minHits = Math.min(topK, 3);
  let hits = await runOnce(baseMinScore);
  if (hits.length < minHits && baseMinScore > 0) {
    const relaxed = baseMinScore >= 0.2 ? 0.12 : Math.max(0.05, baseMinScore * 0.6);
    hits = await runOnce(relaxed);
  }
  if (hits.length < minHits) {
    hits = await runOnce(-1);
  }
  return hits;
}
