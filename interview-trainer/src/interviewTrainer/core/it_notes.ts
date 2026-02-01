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
  cacheKey?: string;
  maxConcurrency?: number;
  queryCacheSize?: number;
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
  signal?: { aborted: boolean };
  maxConcurrency?: number;
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
const IT_SNIPPET_MAX_LEN = IT_MAX_CHUNK_LEN;
const IT_DEFAULT_BATCH_SIZE = 16;
const IT_EMBEDDING_CACHE_VERSION = 1;
const IT_CORPUS_CACHE_VERSION = 1;
const IT_MAX_CORPUS_CACHE_BYTES = 25 * 1024 * 1024;
const IT_DEFAULT_QUERY_CACHE_SIZE = 200;

const cachedEmbeddings: Map<string, Map<string, number[]>> = new Map();
const cachedQueries: Map<string, ItNoteHit[]> = new Map();
const cachedQueryEmbeddings: Map<string, number[]> = new Map();
const cachedQueryEmbeddingPromises: Map<string, Promise<number[]>> = new Map();

export function it_clearEmbeddingMemoryCache(cacheKey?: string): void {
  if (cacheKey) {
    cachedEmbeddings.delete(cacheKey);
    return;
  }
  cachedEmbeddings.clear();
  cachedQueries.clear();
  cachedQueryEmbeddings.clear();
  cachedQueryEmbeddingPromises.clear();
  cachedCorpus = undefined;
}

function it_isSameDirMtimes(
  left: Record<string, number>,
  right: Record<string, number>,
): boolean {
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) {
    return false;
  }
  return leftKeys.every((key) => left[key] === right[key]);
}

function it_getCorpusCachePath(cacheDir: string, key: string): string {
  const safe = it_hashText(`${IT_CORPUS_CACHE_VERSION}:${key}`);
  return path.join(cacheDir, "corpus_cache", `${safe}.json`);
}

function it_getQueryCacheKey(
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

function it_getCachedQuery(
  key: string,
): ItNoteHit[] | undefined {
  const cached = cachedQueries.get(key);
  if (!cached) {
    return undefined;
  }
  cachedQueries.delete(key);
  cachedQueries.set(key, cached);
  return cached;
}

function it_setCachedQuery(
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

function it_getCachedQueryEmbedding(key: string): number[] | undefined {
  const cached = cachedQueryEmbeddings.get(key);
  if (!cached) {
    return undefined;
  }
  cachedQueryEmbeddings.delete(key);
  cachedQueryEmbeddings.set(key, cached);
  return cached;
}

function it_setCachedQueryEmbedding(
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

function it_readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

async function it_readTextAsync(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

function it_normalizePath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function it_isWithinRoot(filePath: string, root: string): boolean {
  if (!root) {
    return false;
  }
  if (filePath === root) {
    return true;
  }
  const rel = path.relative(root, filePath);
  if (!rel) {
    return true;
  }
  return !rel.startsWith("..") && !path.isAbsolute(rel);
}

function it_splitByParagraphs(text: string, maxLen: number): string[] {
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

function it_splitText(text: string, maxLen: number): string[] {
  const normalized = (text || "").replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const headingPattern = /^#{1,3}\s+/;
  let hasHeading = false;
  const sections: string[] = [];
  let current: string[] = [];
  let preamble: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();
    if (headingPattern.test(line.trim())) {
      hasHeading = true;
      if (current.length) {
        sections.push(current.join("\n").trim());
        current = [];
      }
      if (preamble.length) {
        current.push(...preamble);
        preamble = [];
      }
      current.push(line.trim());
      continue;
    }
    if (!hasHeading && !current.length) {
      if (line.trim()) {
        preamble.push(line.trim());
      } else if (preamble.length) {
        preamble.push("");
      }
      continue;
    }
    current.push(line);
  }

  if (current.length) {
    sections.push(current.join("\n").trim());
  }

  const blocks = hasHeading ? sections : [normalized.trim()];
  const chunks: string[] = [];
  blocks.forEach((block) => {
    const trimmed = block.trim();
    if (!trimmed) {
      return;
    }
    chunks.push(...it_splitByParagraphs(trimmed, maxLen));
  });
  return chunks;
}

function it_tokenize(text: string): string[] {
  const raw = String(text || "");
  const hasChinese = /[\u4e00-\u9fff]/.test(raw);
  if (!hasChinese) {
    return raw.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  }
  const normalized = raw.replace(/\s+/g, "");
  const tokens: string[] = [];
  for (let i = 0; i < normalized.length - 1; i += 1) {
    tokens.push(normalized.slice(i, i + 2));
  }
  return tokens;
}

function it_buildSnippet(text: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= IT_SNIPPET_MAX_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, IT_SNIPPET_MAX_LEN)}...`;
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
  let maxMtime = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      const stat = fs.statSync(current);
      maxMtime = Math.max(maxMtime, stat.mtimeMs || 0);
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else {
          const stat = fs.statSync(fullPath);
          maxMtime = Math.max(maxMtime, stat.mtimeMs || 0);
        }
      } catch {
        continue;
      }
    }
  }
  return maxMtime;
}

async function it_getDirMtimeAsync(dirPath: string): Promise<number> {
  if (!dirPath) {
    return 0;
  }
  let maxMtime = 0;
  const stack = [dirPath];
  while (stack.length) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      const stat = await fs.promises.stat(current);
      maxMtime = Math.max(maxMtime, stat.mtimeMs || 0);
      entries = await fs.promises.readdir(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      try {
        if (entry.isDirectory()) {
          stack.push(fullPath);
        } else {
          const stat = await fs.promises.stat(fullPath);
          maxMtime = Math.max(maxMtime, stat.mtimeMs || 0);
        }
      } catch {
        continue;
      }
    }
  }
  return maxMtime;
}

async function it_collectCorpusAsync(
  kind: string,
  dirPath: string,
  corpus: ItCorpusItem[],
): Promise<void> {
  let entries: fs.Dirent[] = [];
  try {
    entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.name.startsWith(".")) {
      continue;
    }
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await it_collectCorpusAsync(kind, fullPath, corpus);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!IT_ALLOWED_EXTS.includes(ext)) {
      continue;
    }
    try {
      const stat = await fs.promises.stat(fullPath);
      if (stat.size > IT_MAX_FILE_SIZE) {
        continue;
      }
    } catch {
      continue;
    }
    const text = await it_readTextAsync(fullPath);
    for (const chunk of it_splitText(text, IT_MAX_CHUNK_LEN)) {
      corpus.push({ kind, source: fullPath, text: chunk });
    }
  }
}

async function it_applyDirtyFilesToCorpus(
  base: { corpus: ItCorpusItem[]; dirMtimes: Record<string, number> },
  entries: Array<[string, string]>,
  dirtyFiles: string[],
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): Promise<
  | {
      corpus: ItCorpusItem[];
      dirMtimes: Record<string, number>;
      stats: {
        dirtyFiles: number;
        appliedFiles: number;
        ignoredFiles: number;
        removedChunks: number;
        addedChunks: number;
      };
    }
  | null
> {
  if (!dirtyFiles.length) {
    return {
      corpus: base.corpus,
      dirMtimes: base.dirMtimes,
      stats: {
        dirtyFiles: 0,
        appliedFiles: 0,
        ignoredFiles: 0,
        removedChunks: 0,
        addedChunks: 0,
      },
    };
  }
  const roots = entries
    .map(([kind, dirPath]) => {
      const raw = String(dirPath || "").trim();
      if (!raw) {
        return undefined;
      }
      return { kind, root: it_normalizePath(raw) };
    })
    .filter(Boolean) as Array<{ kind: string; root: string }>;
  roots.sort((a, b) => b.root.length - a.root.length);

  const dirtyMap = new Map<string, string>();
  dirtyFiles.forEach((value) => {
    const filePath = it_normalizePath(value);
    if (!filePath) {
      return;
    }
    const match = roots.find((entry) => it_isWithinRoot(filePath, entry.root));
    if (match) {
      dirtyMap.set(filePath, match.kind);
    }
  });

  if (!dirtyMap.size) {
    return {
      corpus: base.corpus,
      dirMtimes: base.dirMtimes,
      stats: {
        dirtyFiles: 0,
        appliedFiles: 0,
        ignoredFiles: 0,
        removedChunks: 0,
        addedChunks: 0,
      },
    };
  }

  const dirtySet = new Set(dirtyMap.keys());
  const corpus = base.corpus.filter(
    (item) => !dirtySet.has(it_normalizePath(item.source)),
  );
  const removedChunks = Math.max(0, base.corpus.length - corpus.length);
  const additions: ItCorpusItem[] = [];
  const dirMtimes = { ...(base.dirMtimes || {}) };
  let appliedFiles = 0;
  let ignoredFiles = 0;

  for (const [filePath, kind] of dirtyMap) {
    let stat: fs.Stats;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      onTrace?.("语料增量更新跳过：包含目录变更，改为全量扫描", { path: filePath });
      return null;
    }
    if (!stat.isFile()) {
      ignoredFiles += 1;
      continue;
    }
    const ext = path.extname(filePath).toLowerCase();
    if (!IT_ALLOWED_EXTS.includes(ext)) {
      ignoredFiles += 1;
      continue;
    }
    if (stat.size > IT_MAX_FILE_SIZE) {
      ignoredFiles += 1;
      continue;
    }
    const text = await it_readTextAsync(filePath);
    let addedChunks = 0;
    for (const chunk of it_splitText(text, IT_MAX_CHUNK_LEN)) {
      additions.push({ kind, source: filePath, text: chunk });
      addedChunks += 1;
    }
    if (addedChunks > 0) {
      appliedFiles += 1;
    }
    const mtime = stat.mtimeMs || 0;
    if (mtime) {
      dirMtimes[kind] = Math.max(dirMtimes[kind] || 0, mtime);
    }
  }

  if (additions.length) {
    corpus.push(...additions);
  }

  return {
    corpus,
    dirMtimes,
    stats: {
      dirtyFiles: dirtyMap.size,
      appliedFiles,
      ignoredFiles,
      removedChunks,
      addedChunks: additions.length,
    },
  };
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
    const stack = [dirPath];
    while (stack.length) {
      const current = stack.pop();
      if (!current) {
        continue;
      }
      let files: fs.Dirent[] = [];
      try {
        files = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of files) {
        if (entry.name.startsWith(".")) {
          continue;
        }
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        const ext = path.extname(entry.name).toLowerCase();
        if (!IT_ALLOWED_EXTS.includes(ext)) {
          continue;
        }
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
  }
  cachedCorpus = { key, dirMtimes, corpus };
  return corpus;
}

export async function it_buildCorpusAsync(
  inputs: Record<string, string>,
  options: {
    cacheDir?: string;
    maxCacheBytes?: number;
    skipMtimeCheck?: boolean;
    dirtyFiles?: string[];
    onTrace?: (message: string, detail?: Record<string, unknown>) => void;
  } = {},
): Promise<ItCorpusItem[]> {
  const startedAt = Date.now();
  const entries = Object.entries(inputs).sort((a, b) => a[0].localeCompare(b[0]));
  const key = entries.map(([kind, dirPath]) => `${kind}:${dirPath}`).join("|");
  const maxCacheBytes = Number.isFinite(options.maxCacheBytes)
    ? Math.max(0, Number(options.maxCacheBytes))
    : IT_MAX_CORPUS_CACHE_BYTES;
  const cachePath = options.cacheDir ? it_getCorpusCachePath(options.cacheDir, key) : "";
  const dirtyFiles = Array.isArray(options.dirtyFiles)
    ? Array.from(
        new Set(
          options.dirtyFiles
            .filter(Boolean)
            .map((value) => it_normalizePath(value)),
        ),
      )
    : [];
  const hasDirtyFiles = dirtyFiles.length > 0;
  const logTrace = (message: string, detail?: Record<string, unknown>): void => {
    options.onTrace?.(message, detail);
  };

  logTrace("语料扫描开始", {
    kinds: entries.map(([kind]) => kind),
    skipMtimeCheck: Boolean(options.skipMtimeCheck),
    dirtyFiles: dirtyFiles.length,
    cacheEnabled: Boolean(cachePath),
  });

  const loadCachedCorpus = async (): Promise<
    { dirMtimes: Record<string, number>; corpus: ItCorpusItem[]; source: string } | undefined
  > => {
    if (cachedCorpus && cachedCorpus.key === key) {
      return {
        dirMtimes: cachedCorpus.dirMtimes,
        corpus: cachedCorpus.corpus,
        source: "memory",
      };
    }
    if (!cachePath) {
      return undefined;
    }
    try {
      const stat = await fs.promises.stat(cachePath);
      if (!stat.isFile() || stat.size <= 0 || stat.size > maxCacheBytes) {
        return undefined;
      }
      const raw = await fs.promises.readFile(cachePath, "utf-8");
      const parsed = JSON.parse(raw || "{}");
      if (
        parsed &&
        parsed.version === IT_CORPUS_CACHE_VERSION &&
        parsed.key === key &&
        parsed.corpus
      ) {
        return {
          dirMtimes: parsed.dirMtimes || {},
          corpus: parsed.corpus as ItCorpusItem[],
          source: "disk",
        };
      }
    } catch {
      return undefined;
    }
    return undefined;
  };

  if (hasDirtyFiles) {
    logTrace("语料增量更新尝试", { dirtyFiles: dirtyFiles.length });
    const base = await loadCachedCorpus();
    if (base) {
      logTrace("语料缓存命中（用于增量）", {
        source: base.source,
        items: base.corpus.length,
      });
      const updated = await it_applyDirtyFilesToCorpus(
        base,
        entries,
        dirtyFiles,
        logTrace,
      );
      if (updated) {
        cachedCorpus = {
          key,
          dirMtimes: updated.dirMtimes,
          corpus: updated.corpus,
        };
        logTrace("语料增量更新完成", {
          ...updated.stats,
          totalChunks: updated.corpus.length,
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        });
        if (cachePath && cachedCorpus.corpus.length) {
          try {
            await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
            const payload = JSON.stringify({
              version: IT_CORPUS_CACHE_VERSION,
              key,
              dirMtimes: updated.dirMtimes,
              corpus: updated.corpus,
            });
            if (Buffer.byteLength(payload, "utf-8") <= maxCacheBytes) {
              await fs.promises.writeFile(cachePath, payload, "utf-8");
            }
          } catch {
            // ignore cache write errors
          }
        }
        return cachedCorpus.corpus;
      }
      logTrace("语料增量更新失败，改为全量扫描");
    }
  }

  if (options.skipMtimeCheck && !hasDirtyFiles) {
    if (cachedCorpus && cachedCorpus.key === key) {
      logTrace("语料缓存命中（内存）", { items: cachedCorpus.corpus.length });
      return cachedCorpus.corpus;
    }
    if (cachePath) {
      try {
        const raw = await fs.promises.readFile(cachePath, "utf-8");
        const parsed = JSON.parse(raw || "{}");
        if (
          parsed &&
          parsed.version === IT_CORPUS_CACHE_VERSION &&
          parsed.key === key &&
          parsed.corpus
        ) {
          cachedCorpus = {
            key,
            dirMtimes: parsed.dirMtimes || {},
            corpus: parsed.corpus as ItCorpusItem[],
          };
          logTrace("语料缓存命中（磁盘）", { items: cachedCorpus.corpus.length });
          return cachedCorpus.corpus;
        }
      } catch {
        // ignore cache read errors
      }
    }
  }

  const dirMtimes: Record<string, number> = {};
  for (const [kind, dirPath] of entries) {
    dirMtimes[kind] = await it_getDirMtimeAsync(dirPath);
  }
  if (!hasDirtyFiles && cachedCorpus && cachedCorpus.key === key) {
    const unchanged = entries.every(
      ([kind]) => cachedCorpus?.dirMtimes[kind] === dirMtimes[kind],
    );
    if (unchanged) {
      logTrace("语料缓存命中（目录未变）", { items: cachedCorpus.corpus.length });
      return cachedCorpus.corpus;
    }
  }
  if (!hasDirtyFiles && cachePath) {
    try {
      const stat = await fs.promises.stat(cachePath);
      if (stat.isFile() && stat.size > 0 && stat.size <= maxCacheBytes) {
        const raw = await fs.promises.readFile(cachePath, "utf-8");
        const parsed = JSON.parse(raw || "{}");
        if (
          parsed &&
          parsed.version === IT_CORPUS_CACHE_VERSION &&
          parsed.key === key &&
          parsed.corpus &&
          parsed.dirMtimes &&
          it_isSameDirMtimes(parsed.dirMtimes, dirMtimes)
        ) {
          cachedCorpus = {
            key,
            dirMtimes,
            corpus: parsed.corpus as ItCorpusItem[],
          };
          logTrace("语料缓存命中（磁盘校验）", {
            items: cachedCorpus.corpus.length,
          });
          return cachedCorpus.corpus;
        }
      }
    } catch {
      // ignore cache read errors
    }
  }

  logTrace("语料全量扫描开始");
  const corpus: ItCorpusItem[] = [];
  for (const [kind, dirPath] of entries) {
    await it_collectCorpusAsync(kind, dirPath, corpus);
  }
  cachedCorpus = { key, dirMtimes, corpus };
  logTrace("语料全量扫描完成", {
    chunks: corpus.length,
    sources: new Set(corpus.map((item) => item.source)).size,
    elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
  });
  if (cachePath && corpus.length) {
    try {
      await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
      const payload = JSON.stringify({
        version: IT_CORPUS_CACHE_VERSION,
        key,
        dirMtimes,
        corpus,
      });
      if (Buffer.byteLength(payload, "utf-8") <= maxCacheBytes) {
        await fs.promises.writeFile(cachePath, payload, "utf-8");
      }
    } catch {
      // ignore cache write errors
    }
  }
  return corpus;
}

export async function it_prepareEmbeddingCache(
  corpus: ItCorpusItem[],
  vectorCfg: ItVectorSearchConfig,
  options: ItEmbeddingWarmupOptions = {},
): Promise<ItEmbeddingWarmupResult> {
  if (
    !vectorCfg ||
    !vectorCfg.provider ||
    !vectorCfg.apiKey ||
    !vectorCfg.baseUrl ||
    !vectorCfg.model
  ) {
    throw new Error("vector retrieval config incomplete");
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
  options.onProgress?.(0, total);

  const batchSize = Math.max(1, vectorCfg.batchSize || IT_DEFAULT_BATCH_SIZE);
  const maxConcurrency = Number.isFinite(options.maxConcurrency)
    ? Math.max(1, Math.floor(Number(options.maxConcurrency)))
    : 1;
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
    } catch {
      // ignore cache write failure
    }
  }
  return { total, created, cached, aborted, cachePath };
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

  const embeddingCacheKey = it_hashText(
    `${it_buildEmbeddingCacheKey(vectorCfg)}|${trimmedQuery}`,
  );
  let queryEmbedding = it_getCachedQueryEmbedding(embeddingCacheKey);
  if (!queryEmbedding) {
    let pending = cachedQueryEmbeddingPromises.get(embeddingCacheKey);
    if (!pending) {
      pending = (async () => {
        const vectors = await it_embedTexts(vectorCfg, [trimmedQuery]);
        return vectors[0] || [];
      })();
      cachedQueryEmbeddingPromises.set(embeddingCacheKey, pending);
    }
    try {
      queryEmbedding = await pending;
    } finally {
      if (cachedQueryEmbeddingPromises.get(embeddingCacheKey) === pending) {
        cachedQueryEmbeddingPromises.delete(embeddingCacheKey);
      }
    }
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

function it_mergeQueryHits(
  lists: ItNoteHit[][],
  topK: number,
): ItNoteHit[] {
  if (!lists.length) {
    return [];
  }
  const rrfK = 60;
  const merged = new Map<
    string,
    { source: string; snippet: string; score: number; rankScore: number }
  >();
  lists.forEach((hits) => {
    hits.forEach((hit, idx) => {
      const key = `${hit.source}::${hit.snippet}`;
      const entry = merged.get(key);
      const rrf = 1 / (rrfK + idx + 1);
      if (!entry) {
        merged.set(key, {
          source: hit.source,
          snippet: hit.snippet,
          score: hit.score,
          rankScore: rrf,
        });
        return;
      }
      entry.rankScore += rrf;
      entry.score = Math.max(entry.score, hit.score);
    });
  });
  const mergedList = Array.from(merged.values())
    .sort((a, b) => {
      if (b.rankScore !== a.rankScore) {
        return b.rankScore - a.rankScore;
      }
      return b.score - a.score;
    })
    .slice(0, topK)
    .map((item) => ({
      score: Number(item.score.toFixed(3)),
      source: item.source,
      snippet: item.snippet,
    }));
  return mergedList;
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
  const maxQueries = 8;
  const limited = normalized.slice(0, maxQueries);
  if (!limited.length || !corpus.length) {
    return [];
  }
  const topK = Number.isFinite(options.topK) ? Math.max(1, options.topK) : 5;
  const baseMinScore = Number.isFinite(options.minScore) ? options.minScore : 0;
  const perQueryTopK = Math.max(topK, Math.min(topK * 2, 20));
  const maxConcurrency = Number.isFinite(options.maxConcurrency)
    ? Math.max(1, Number(options.maxConcurrency))
    : 3;

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
    const lists = await runWithLimit(limited, maxConcurrency, (query) =>
      it_retrieveNotes(query, corpus, {
        ...options,
        topK: perQueryTopK,
        minScore,
      }),
    );
    return it_mergeQueryHits(lists, topK);
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
