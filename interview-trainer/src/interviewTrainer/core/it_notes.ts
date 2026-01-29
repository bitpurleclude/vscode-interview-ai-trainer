import fs from "fs";
import path from "path";
import { it_callEmbedding, ItEmbeddingConfig } from "../api/it_embedding";
import { it_hashText } from "../utils/it_text";

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
}

let cachedCorpus:
  | {
      key: string;
      dirMtimes: Record<string, number>;
      corpus: ItCorpusItem[];
    }
  | undefined;

const IT_ALLOWED_EXTS = [".md", ".mdx", ".markdown", ".txt"];
const IT_MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const IT_MAX_CHUNK_LEN = 1200;
const IT_DEFAULT_QUERY_MAX_CHARS = 1500;
const IT_DEFAULT_BATCH_SIZE = 16;
const IT_EMBEDDING_CACHE_VERSION = 1;

const cachedEmbeddings: Map<string, Map<string, number[]>> = new Map();

function it_readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return fs.readFileSync(filePath, "utf-8");
  }
}

function it_splitText(text: string, maxLen: number): string[] {
  const parts = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let length = 0;
  for (const part of parts) {
    if (length + part.length > maxLen && current.length) {
      chunks.push(current.join("\n\n"));
      current = [part];
      length = part.length;
    } else {
      current.push(part);
      length += part.length;
    }
  }
  if (current.length) {
    chunks.push(current.join("\n\n"));
  }
  return chunks;
}

function it_tokenize(text: string): string[] {
  const normalized = text.replace(/\s+/g, "");
  const hasChinese = /[\u4e00-\u9fff]/.test(normalized);
  if (!hasChinese) {
    return normalized.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }
  const tokens: string[] = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    tokens.push(normalized.slice(i, i + 2));
  }
  return tokens;
}

function it_scoreTokens(queryTokens: string[], textTokens: string[]): number {
  if (!queryTokens.length || !textTokens.length) {
    return 0;
  }
  const textSet = new Set(textTokens);
  let hits = 0;
  for (const token of queryTokens) {
    if (textSet.has(token)) {
      hits += 1;
    }
  }
  return hits / Math.max(1, queryTokens.length);
}

function it_buildEmbeddingCacheKey(cfg: ItVectorSearchConfig): string {
  return `${cfg.provider}|${cfg.baseUrl}|${cfg.model}`;
}

function it_getEmbeddingCachePath(cacheDir: string, cacheKey: string): string {
  return path.join(cacheDir, `embeddings-${it_hashText(cacheKey)}.json`);
}

function it_loadEmbeddingCache(
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

function it_saveEmbeddingCache(
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

function it_getItemKey(item: ItCorpusItem): string {
  return `${item.source}|${it_hashText(item.text)}`;
}

function it_cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || !b.length) {
    return 0;
  }
  const length = Math.min(a.length, b.length);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < length; i += 1) {
    const av = Number(a[i]);
    const bv = Number(b[i]);
    if (!Number.isFinite(av) || !Number.isFinite(bv)) {
      continue;
    }
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  if (!normA || !normB) {
    return 0;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function it_embedTexts(
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
): Promise<number> {
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
  return created;
}

function it_getDirMtime(dirPath: string): number {
  if (!dirPath || !fs.existsSync(dirPath)) {
    return 0;
  }
  try {
    return fs.statSync(dirPath).mtimeMs || 0;
  } catch {
    return 0;
  }
}

export function it_buildCorpus(inputs: Record<string, string>): ItCorpusItem[] {
  const entries = Object.entries(inputs).sort((a, b) => a[0].localeCompare(b[0]));
  const key = entries.map(([kind, dirPath]) => `${kind}:${dirPath}`).join("|");
  const dirMtimes: Record<string, number> = {};
  entries.forEach(([kind, dirPath]) => {
    dirMtimes[kind] = it_getDirMtime(dirPath);
  });
  if (cachedCorpus && cachedCorpus.key === key) {
    const unchanged = entries.every(
      ([kind]) => cachedCorpus?.dirMtimes[kind] === dirMtimes[kind],
    );
    if (unchanged) {
      return cachedCorpus.corpus;
    }
  }

  const corpus: ItCorpusItem[] = [];
  for (const [kind, dirPath] of entries) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of files) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      if (entry.isDirectory()) {
        const child = path.join(dirPath, entry.name);
        corpus.push(...it_buildCorpus({ [kind]: child }));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (!IT_ALLOWED_EXTS.includes(ext)) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.size > IT_MAX_FILE_SIZE) {
          continue;
        }
      } catch {
        continue;
      }
      const text = it_readText(fullPath);
      for (const chunk of it_splitText(text, IT_MAX_CHUNK_LEN)) {
        corpus.push({ kind, source: fullPath, text: chunk });
      }
    }
  }
  cachedCorpus = { key, dirMtimes, corpus };
  return corpus;
}

export async function it_retrieveNotes(
  query: string,
  corpus: ItCorpusItem[],
  options: ItRetrievalOptions,
): Promise<ItNoteHit[]> {
  if (!query || !corpus.length) {
    return [];
  }
  const topK = Number.isFinite(options.topK) ? Math.max(1, options.topK) : 5;
  const minScore = Number.isFinite(options.minScore) ? options.minScore : 0;
  const mode = options.mode || "vector";
  if (mode === "keyword") {
    const queryTokens = it_tokenize(query);
    const scored = corpus
      .map((item) => {
        const score = it_scoreTokens(queryTokens, it_tokenize(item.text));
        return { score, item };
      })
      .filter((entry) => entry.score >= minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);

    return scored.map(({ score, item }) => ({
      score: Number(score.toFixed(3)),
      source: item.source,
      snippet: item.text.replace(/\s+/g, " ").slice(0, 160),
    }));
  }
  if (mode !== "vector") {
    return [];
  }

  const vectorCfg = options.vector;
  if (
    !vectorCfg ||
    !vectorCfg.provider ||
    !vectorCfg.apiKey ||
    !vectorCfg.baseUrl ||
    !vectorCfg.model
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

  const queryEmbedding = (await it_embedTexts(vectorCfg, [trimmedQuery]))[0];
  if (!queryEmbedding || !queryEmbedding.length) {
    return [];
  }

  const cacheKey = it_buildEmbeddingCacheKey(vectorCfg);
  const cachePath = options.cacheDir
    ? it_getEmbeddingCachePath(options.cacheDir, cacheKey)
    : undefined;
  let cache = cachedEmbeddings.get(cacheKey);
  if (!cache) {
    cache = cachePath ? it_loadEmbeddingCache(cachePath, cacheKey) : new Map();
    cachedEmbeddings.set(cacheKey, cache);
  }

  const validKeys = new Set(corpus.map((item) => it_getItemKey(item)));
  const created = await it_ensureEmbeddings(vectorCfg, corpus, cache);
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
    } catch {
      // ignore cache write failure
    }
  }

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

  return scored.map(({ score, item }) => ({
    score: Number(score.toFixed(3)),
    source: item.source,
    snippet: item.text.replace(/\s+/g, " ").slice(0, 160),
  }));
}
