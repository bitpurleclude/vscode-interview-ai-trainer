import fs from "fs";
import path from "path";
import { it_hashText } from "../../utils/it_text";
import type { ItCorpusItem } from "./types";

const IT_MAX_CHUNK_LEN = 1200;
const IT_SNIPPET_MAX_LEN = IT_MAX_CHUNK_LEN;

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

export function it_splitText(text: string, maxLen: number): string[] {
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

export function it_tokenize(text: string): string[] {
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

export function it_buildSnippet(text: string): string {
  const normalized = (text || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= IT_SNIPPET_MAX_LEN) {
    return normalized;
  }
  return `${normalized.slice(0, IT_SNIPPET_MAX_LEN)}...`;
}

export function it_scoreTokens(queryTokens: string[], textTokens: string[]): number {
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

export function it_normalizeEmbeddingBaseUrl(url: string): string {
  return String(url || "").trim().replace(/\/+$/, "");
}

export function it_getItemKey(item: ItCorpusItem): string {
  const normalizedSource = it_normalizePath(item.source || "");
  return `${normalizedSource}|${it_hashText(item.text)}`;
}

export function it_cosineSimilarity(a: number[], b: number[]): number {
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
