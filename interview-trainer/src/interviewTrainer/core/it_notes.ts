export type {
  ItCorpusItem,
  ItNoteHit,
  ItVectorSearchConfig,
  ItRetrievalOptions,
  ItRetrievalMetrics,
  ItEmbeddingWarmupResult,
  ItEmbeddingWarmupOptions,
} from "../domain/notes/types";

export { it_buildCorpus, it_buildCorpusAsync } from "../domain/notes/indexer";
export {
  it_clearEmbeddingMemoryCache,
  it_prepareEmbeddingCache,
} from "../domain/notes/cache";
export {
  it_createRetrievalMetrics,
  it_retrieveNotes,
  it_retrieveNotesMulti,
} from "../domain/notes/search";
