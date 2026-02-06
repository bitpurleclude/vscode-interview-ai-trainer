import { describe, expect, it } from "vitest";
import { it_mergeQueryHits } from "./ranking";
import type { ItNoteHit } from "./types";

describe("it_mergeQueryHits", () => {
  it("merges by source and snippet and keeps topK", () => {
    const listA: ItNoteHit[] = [
      { source: "a", snippet: "s1", score: 0.9 },
      { source: "a", snippet: "s2", score: 0.5 },
    ];
    const listB: ItNoteHit[] = [
      { source: "a", snippet: "s1", score: 0.7 },
      { source: "b", snippet: "s3", score: 0.4 },
    ];

    const merged = it_mergeQueryHits([listA, listB], 2);
    expect(merged.length).toBe(2);
    expect(merged[0].source).toBe("a");
    expect(merged[0].snippet).toBe("s1");
  });

  it("rounds scores to 3 decimals", () => {
    const list: ItNoteHit[] = [{ source: "a", snippet: "s", score: 0.12345 }];
    const merged = it_mergeQueryHits([list], 1);
    expect(merged[0].score).toBe(0.123);
  });

  it("returns empty for empty lists", () => {
    expect(it_mergeQueryHits([], 3)).toEqual([]);
  });
});
