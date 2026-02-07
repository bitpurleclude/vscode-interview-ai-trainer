import { describe, expect, it } from "vitest";
import { it_retrieveNotes, it_retrieveNotesMulti } from "./search";

function buildLargeText(token: string, repeat: number): string {
  return new Array(repeat).fill(token).join(" ");
}

describe("search payload pressure", () => {
  it("handles oversized keyword query text without throwing", async () => {
    const largeQuery = `${buildLargeText("marathon", 2000)} focus`;
    const corpus = [
      {
        kind: "notes",
        source: "notes/summary.md",
        text: "marathon focus answer structure",
      },
      {
        kind: "notes",
        source: "notes/other.md",
        text: "unrelated content",
      },
    ];

    const hits = await it_retrieveNotes(largeQuery, corpus, {
      mode: "keyword",
      topK: 2,
      minScore: 0,
      maxConcurrency: 2,
      queryCacheSize: 10,
    });

    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.source).toBe("notes/summary.md");
  });

  it("keeps processing tail windows under many large queries", async () => {
    const queries = new Array(18).fill(0).map((_, index) => {
      const marker = `q-${String(index + 1).padStart(2, "0")}`;
      return `${buildLargeText("practice", 300)} ${marker}`;
    });

    const corpus = queries.map((query, index) => ({
      kind: "notes",
      source: `notes/${index + 1}.md`,
      text: query,
    }));

    const hits = await it_retrieveNotesMulti(queries, corpus, {
      mode: "keyword",
      topK: 18,
      minScore: 0,
      maxConcurrency: 4,
      queryWindowSize: 4,
      queryCacheSize: 0,
    });

    expect(hits).toHaveLength(18);
    expect(hits.some((hit) => hit.source === "notes/18.md")).toBe(true);
  });
});
