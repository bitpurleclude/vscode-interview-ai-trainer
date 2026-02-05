import fs from "fs";
import path from "path";
import { it_isWithinRoot, it_normalizePath, it_readTextAsync, it_splitText } from "./utils";
import type { ItCorpusItem } from "./types";
import { IT_ALLOWED_EXTS, IT_MAX_CHUNK_LEN, IT_MAX_FILE_SIZE } from "./indexer_constants";

export async function it_applyDirtyFilesToCorpus(
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
