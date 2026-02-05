import fs from "fs";
import path from "path";
import {
  IT_CORPUS_CACHE_VERSION,
  it_getCachedCorpus,
  it_getCorpusCachePath,
  it_setCachedCorpus,
} from "./cache";
import {
  IT_ALLOWED_EXTS,
  IT_MAX_CHUNK_LEN,
  IT_MAX_CORPUS_CACHE_BYTES,
  IT_MAX_FILE_SIZE,
} from "./indexer_constants";
import { it_applyDirtyFilesToCorpus } from "./indexer_dirty";
import { it_collectCorpusAsync, it_getDirMtime, it_getDirMtimeAsync } from "./indexer_fs";
import { it_isSameDirMtimes } from "./indexer_utils";
import { it_splitText } from "../../domain/notes/utils";
import type { ItCorpusItem } from "../../domain/notes/types";
import { it_normalizePath, it_readText } from "./utils";

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
