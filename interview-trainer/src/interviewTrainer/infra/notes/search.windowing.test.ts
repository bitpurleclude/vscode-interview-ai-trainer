import { describe, expect, it } from "vitest";
import { it_retrieveNotesMulti } from "./search";

function buildQueries(total: number): string[] {
  return new Array(total).fill(0).map((_, idx) => `q${String(idx + 1).padStart(2, "0")}`);
}

describe("it_retrieveNotesMulti windowing", () => {
  it("processes every query across windows instead of truncating to first window", async () => {
    const queries = buildQueries(12);
    const corpus = queries.map((query, idx) => ({
      kind: "notes",
      source: `source-${idx + 1}`,
      text: `doc ${query}`,
    }));

    const hits = await it_retrieveNotesMulti(queries, corpus, {
      mode: "keyword",
      topK: 12,
      minScore: 0,
      maxConcurrency: 3,
      queryWindowSize: 3,
      queryCacheSize: 0,
    });

    expect(hits).toHaveLength(12);
    expect(hits.some((hit) => hit.source === "source-12")).toBe(true);
  });
});
