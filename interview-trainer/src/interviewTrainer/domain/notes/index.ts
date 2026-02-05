export type {
  ItCorpusItem,
  ItNoteHit,
  ItVectorSearchConfig,
  ItRetrievalOptions,
  ItRetrievalMetrics,
  ItEmbeddingWarmupResult,
  ItEmbeddingWarmupOptions,
} from "./types";

export { it_buildCorpus, it_buildCorpusAsync } from "./indexer";
export {
  it_clearEmbeddingMemoryCache,
  it_prepareEmbeddingCache,
} from "./cache";
export {
  it_createRetrievalMetrics,
  it_retrieveNotes,
  it_retrieveNotesMulti,
} from "./search";
