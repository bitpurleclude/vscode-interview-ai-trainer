import type { ItNoteHit } from "./types";

export function it_mergeQueryHits(
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
