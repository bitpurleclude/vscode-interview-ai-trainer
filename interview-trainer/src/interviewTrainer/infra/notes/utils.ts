import fs from "fs";
import path from "path";
import { it_hashText } from "../utils/it_text";
import type { ItCorpusItem } from "../../domain/notes/types";

export function it_readText(filePath: string): string {
  try {
    return fs.readFileSync(filePath, "utf-8");
  } catch {
    return "";
  }
}

export async function it_readTextAsync(filePath: string): Promise<string> {
  try {
    return await fs.promises.readFile(filePath, "utf-8");
  } catch {
    return "";
  }
}

export function it_normalizePath(filePath: string): string {
  const resolved = path.resolve(String(filePath || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function it_isWithinRoot(filePath: string, root: string): boolean {
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

export function it_normalizeEmbeddingBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function it_getItemKey(item: ItCorpusItem): string {
  const normalizedSource = it_normalizePath(item.source || "");
  return `${normalizedSource}|${it_hashText(item.text)}`;
}
