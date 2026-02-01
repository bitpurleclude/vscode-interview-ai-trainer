import fs from "fs";
import path from "path";
import { it_hashText, it_normalizeText } from "../utils/it_text";

export interface ItQuestionParseCacheEntry {
  material: string;
  questions: string[];
  source?: string;
  updatedAt: string;
}

function it_buildQuestionCacheKey(text: string): string {
  const normalized = it_normalizeText(text || "");
  const base = normalized || String(text || "").trim();
  return it_hashText(base);
}

function it_getQuestionCachePath(cacheRoot: string, key: string): string {
  return path.join(cacheRoot, "question_cache", `${key}.json`);
}

export async function it_readQuestionParseCache(
  cacheRoot: string,
  text: string,
): Promise<ItQuestionParseCacheEntry | null> {
  const key = it_buildQuestionCacheKey(text);
  if (!cacheRoot || !key) {
    return null;
  }
  const cachePath = it_getQuestionCachePath(cacheRoot, key);
  try {
    const raw = await fs.promises.readFile(cachePath, "utf-8");
    const parsed = JSON.parse(raw);
    const material = String(parsed?.material || "").trim();
    const questions = Array.isArray(parsed?.questions)
      ? parsed.questions.map((item: any) => String(item)).filter(Boolean)
      : [];
    if (!material && !questions.length) {
      return null;
    }
    return {
      material,
      questions,
      source: parsed?.source ? String(parsed.source) : undefined,
      updatedAt: String(parsed?.updatedAt || ""),
    };
  } catch {
    return null;
  }
}

export async function it_writeQuestionParseCache(
  cacheRoot: string,
  text: string,
  entry: Omit<ItQuestionParseCacheEntry, "updatedAt"> & { updatedAt?: string },
): Promise<void> {
  const key = it_buildQuestionCacheKey(text);
  if (!cacheRoot || !key) {
    return;
  }
  const cachePath = it_getQuestionCachePath(cacheRoot, key);
  await fs.promises.mkdir(path.dirname(cachePath), { recursive: true });
  const payload: ItQuestionParseCacheEntry = {
    material: String(entry.material || ""),
    questions: Array.isArray(entry.questions)
      ? entry.questions.map((item) => String(item)).filter(Boolean)
      : [],
    source: entry.source,
    updatedAt: entry.updatedAt || new Date().toISOString(),
  };
  await fs.promises.writeFile(cachePath, JSON.stringify(payload, null, 2), "utf-8");
}
