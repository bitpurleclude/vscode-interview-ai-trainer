import fs from "fs";
import path from "path";
import {
  IT_CORPUS_CACHE_VERSION,
  it_getCachedCorpus,
  it_getCorpusCachePath,
  it_setCachedCorpus,
} from "./cache";
import {
  it_isWithinRoot,
  it_normalizePath,
  it_readText,
  it_readTextAsync,
  it_splitText,
} from "./utils";
import type { ItCorpusItem } from "./types";

const IT_ALLOWED_EXTS = [".md", ".mdx", ".markdown", ".txt"];
const IT_MAX_FILE_SIZE = 1 * 1024 * 1024; // 1MB
const IT_MAX_CHUNK_LEN = 1200;
const IT_MAX_CORPUS_CACHE_BYTES = 25 * 1024 * 1024;

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

  const removedKeys = new Set<string>();
  dirtyMap.forEach((kind, filePath) => {
    if (!kind || !filePath) {
      return;
    }
    removedKeys.add(`${kind}|${it_normalizePath(filePath)}`);
  });

  const corpus = base.corpus.filter((item) => {
    const key = `${item.kind}|${it_normalizePath(item.source)}`;
    return !removedKeys.has(key);
  });
  const removedChunks = Math.max(0, base.corpus.length - corpus.length);
  const additions: ItCorpusItem[] = [];
  const dirMtimes: Record<string, number> = { ...base.dirMtimes };
  let appliedFiles = 0;
  let ignoredFiles = 0;

  for (const [filePath, kind] of dirtyMap.entries()) {
    let stat: fs.Stats | undefined;
    try {
      stat = await fs.promises.stat(filePath);
    } catch {
      ignoredFiles += 1;
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
  const cached = it_getCachedCorpus();
  if (cached && cached.key === key) {
    const unchanged = entries.every(
      ([kind]) => cached?.dirMtimes[kind] === dirMtimes[kind],
    );
    if (unchanged) {
      return cached.corpus;
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
  it_setCachedCorpus({ key, dirMtimes, corpus });
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
    const cached = it_getCachedCorpus();
    if (cached && cached.key === key) {
      return {
        dirMtimes: cached.dirMtimes,
        corpus: cached.corpus,
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
        it_setCachedCorpus({
          key,
          dirMtimes: updated.dirMtimes,
          corpus: updated.corpus,
        });
        logTrace("语料增量更新完成", {
          ...updated.stats,
          totalChunks: updated.corpus.length,
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        });
        if (cachePath && updated.corpus.length) {
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
        return updated.corpus;
      }
      logTrace("语料增量更新失败，改为全量扫描");
    }
  }

  if (options.skipMtimeCheck && !hasDirtyFiles) {
    const cached = it_getCachedCorpus();
    if (cached && cached.key === key) {
      logTrace("语料缓存命中（内存）", { items: cached.corpus.length });
      return cached.corpus;
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
          it_setCachedCorpus({
            key,
            dirMtimes: parsed.dirMtimes || {},
            corpus: parsed.corpus as ItCorpusItem[],
          });
          logTrace("语料缓存命中（磁盘）", { items: parsed.corpus.length });
          return parsed.corpus as ItCorpusItem[];
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
  const cached = it_getCachedCorpus();
  if (!hasDirtyFiles && cached && cached.key === key) {
    const unchanged = entries.every(
      ([kind]) => cached?.dirMtimes[kind] === dirMtimes[kind],
    );
    if (unchanged) {
      logTrace("语料缓存命中（目录未变）", { items: cached.corpus.length });
      return cached.corpus;
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
          it_setCachedCorpus({
            key,
            dirMtimes,
            corpus: parsed.corpus as ItCorpusItem[],
          });
          logTrace("语料缓存命中（磁盘校验）", {
            items: parsed.corpus.length,
          });
          return parsed.corpus as ItCorpusItem[];
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
  it_setCachedCorpus({ key, dirMtimes, corpus });
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
