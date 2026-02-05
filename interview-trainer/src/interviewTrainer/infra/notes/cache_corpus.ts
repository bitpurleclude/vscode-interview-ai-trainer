import path from "path";
import { it_hashText } from "../utils/it_text";
import type { ItCorpusItem } from "../../domain/notes/types";
import { IT_CORPUS_CACHE_VERSION } from "./cache_constants";

let cachedCorpus:
  | {
      key: string;
      dirMtimes: Record<string, number>;
      corpus: ItCorpusItem[];
    }
  | undefined;

export function it_getCachedCorpus():
  | { key: string; dirMtimes: Record<string, number>; corpus: ItCorpusItem[] }
  | undefined {
  return cachedCorpus;
}

export function it_setCachedCorpus(
  value?: { key: string; dirMtimes: Record<string, number>; corpus: ItCorpusItem[] },
): void {
  cachedCorpus = value;
}

export function it_clearCachedCorpus(): void {
  cachedCorpus = undefined;
}

export function it_getCorpusCachePath(cacheDir: string, key: string): string {
  const safe = it_hashText(`${IT_CORPUS_CACHE_VERSION}:${key}`);
  return path.join(cacheDir, "corpus_cache", `${safe}.json`);
}
