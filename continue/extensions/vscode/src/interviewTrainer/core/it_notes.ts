import fs from "fs";
import path from "path";

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

export function it_buildCorpus(inputs: Record<string, string>): ItCorpusItem[] {
  const corpus: ItCorpusItem[] = [];
  for (const [kind, dirPath] of Object.entries(inputs)) {
    if (!fs.existsSync(dirPath)) {
      continue;
    }
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of files) {
      if (entry.isDirectory()) {
        const child = path.join(dirPath, entry.name);
        corpus.push(...it_buildCorpus({ [kind]: child }));
        continue;
      }
      const ext = path.extname(entry.name).toLowerCase();
      if (![".md", ".txt"].includes(ext)) {
        continue;
      }
      const fullPath = path.join(dirPath, entry.name);
      const text = it_readText(fullPath);
      for (const chunk of it_splitText(text, 1200)) {
        corpus.push({ kind, source: fullPath, text: chunk });
      }
    }
  }
  return corpus;
}

export function it_retrieveNotes(
  query: string,
  corpus: ItCorpusItem[],
  topK: number,
  minScore: number,
): ItNoteHit[] {
  if (!query || !corpus.length) {
    return [];
  }
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
