export type {
  ItCorpusItem,
  ItNoteHit,
  ItVectorSearchConfig,
  ItRetrievalOptions,
  ItRetrievalMetrics,
  ItEmbeddingWarmupResult,
  ItEmbeddingWarmupOptions,
} from "./notes/types";

export { it_buildCorpus, it_buildCorpusAsync } from "./notes/indexer";
export {
  it_clearEmbeddingMemoryCache,
  it_prepareEmbeddingCache,
} from "./notes/cache";
export {
  it_createRetrievalMetrics,
  it_retrieveNotes,
  it_retrieveNotesMulti,
} from "./notes/search";
