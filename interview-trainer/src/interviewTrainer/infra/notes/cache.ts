export {
  IT_CORPUS_CACHE_VERSION,
  IT_DEFAULT_BATCH_SIZE,
  IT_EMBEDDING_CACHE_VERSION,
} from "./cache_constants";
export {
  it_getCachedCorpus,
  it_getCorpusCachePath,
  it_setCachedCorpus,
  it_clearCachedCorpus,
} from "./cache_corpus";
export {
  it_getCachedQuery,
  it_getCachedQueryEmbedding,
  it_getOrCreateQueryEmbedding,
  it_getQueryCacheKey,
  it_setCachedQuery,
  it_setCachedQueryEmbedding,
  it_clearQueryCaches,
} from "./cache_query";
export {
  it_buildEmbeddingCacheKey,
  it_embedTexts,
  it_ensureEmbeddingCacheOnce,
  it_getEmbeddingCache,
  it_getEmbeddingCachePath,
  it_loadEmbeddingCache,
  it_saveEmbeddingCache,
  it_clearEmbeddingCaches,
} from "./cache_embedding";
export { it_prepareEmbeddingCache } from "./cache_warmup";

import { it_clearCachedCorpus } from "./cache_corpus";
import { it_clearEmbeddingCaches } from "./cache_embedding";
import { it_clearQueryCaches } from "./cache_query";

export function it_clearEmbeddingMemoryCache(cacheKey?: string): void {
  if (cacheKey) {
    it_clearEmbeddingCaches(cacheKey);
    return;
  }
  it_clearEmbeddingCaches();
  it_clearQueryCaches();
  it_clearCachedCorpus();
}