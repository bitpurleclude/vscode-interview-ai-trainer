import type { ItEmbeddingConfig } from "../../infra/api/it_embedding";

export interface ItCorpusItem {
  kind: string;
  source: string;
  text: string;
}

export interface ItNoteHit {
  score: number;
  source: string;
  snippet: string;
}

export interface ItVectorSearchConfig extends ItEmbeddingConfig {
  batchSize: number;
  queryMaxChars: number;
}

export interface ItRetrievalOptions {
  mode?: "vector" | "keyword";
  topK: number;
  minScore: number;
  vector?: ItVectorSearchConfig;
  cacheDir?: string;
  cacheKey?: string;
  maxConcurrency?: number;
  queryCacheSize?: number;
  metrics?: ItRetrievalMetrics;
  onPhase?: (phase: string) => void;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface ItRetrievalMetrics {
  queryCount: number;
  queryEmbeddingHit: number;
  queryEmbeddingMiss: number;
  embeddingMissing: number;
  embeddingCreated: number;
  ensureKeys: Set<string>;
  phaseKeys: Set<string>;
}

export interface ItEmbeddingWarmupResult {
  total: number;
  created: number;
  cached: number;
  aborted?: boolean;
  cachePath?: string;
}

export interface ItEmbeddingWarmupOptions {
  cacheDir?: string;
  onProgress?: (done: number, total: number) => void;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
  signal?: { aborted: boolean };
  maxConcurrency?: number;
}
