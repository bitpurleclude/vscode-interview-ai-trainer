import fs from "fs";
import path from "path";
import { it_splitText } from "../../domain/notes/utils";
import type { ItCorpusItem } from "../../domain/notes/types";
import { it_readTextAsync } from "./utils";
import { IT_ALLOWED_EXTS, IT_MAX_CHUNK_LEN, IT_MAX_FILE_SIZE } from "./indexer_constants";

export function it_getDirMtime(dirPath: string): number {
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

export async function it_getDirMtimeAsync(dirPath: string): Promise<number> {
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

export async function it_collectCorpusAsync(
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
