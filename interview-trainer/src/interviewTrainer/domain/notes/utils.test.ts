import { describe, expect, it } from "vitest";
import {
  it_buildSnippet,
  it_cosineSimilarity,
  it_scoreTokens,
  it_splitText,
  it_tokenize,
} from "./utils";

describe("it_splitText", () => {
  it("splits by headings and paragraphs", () => {
    const text = "# Title\n\npara1\n\n## Sub\n\npara2";
    const chunks = it_splitText(text, 10);
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks.some((chunk) => chunk.includes("# Title"))).toBe(true);
  });

  it("returns single block when no headings", () => {
    const text = "line1\n\nline2";
    const chunks = it_splitText(text, 1000);
    expect(chunks).toEqual(["line1\n\nline2"]);
  });

  it("splits long paragraphs by length", () => {
    const text = "aaaaaa\n\nbbbbbb";
    const chunks = it_splitText(text, 6);
    expect(chunks).toEqual(["aaaaaa", "bbbbbb"]);
  });
});

describe("it_tokenize", () => {
  it("tokenizes latin text", () => {
    expect(it_tokenize("Hello, World!")).toEqual(["hello", "world"]);
  });

  it("tokenizes chinese text into bigrams", () => {
    expect(it_tokenize("中文测试")).toEqual(["中文", "文测", "测试"]);
  });
});

describe("it_buildSnippet", () => {
  it("truncates long text", () => {
    const text = "a".repeat(1201);
    const snippet = it_buildSnippet(text);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("keeps short text", () => {
    expect(it_buildSnippet("short")).toBe("short");
  });
});

describe("it_scoreTokens", () => {
  it("scores token overlap", () => {
    expect(it_scoreTokens(["a", "b"], ["b", "c"])).toBe(0.5);
  });

  it("returns 0 for empty lists", () => {
    expect(it_scoreTokens([], ["a"])).toBe(0);
  });
});

describe("it_cosineSimilarity", () => {
  it("computes cosine similarity", () => {
    expect(it_cosineSimilarity([1, 0], [1, 0])).toBe(1);
    expect(it_cosineSimilarity([1, 0], [0, 1])).toBe(0);
  });

  it("skips non-finite values", () => {
    expect(it_cosineSimilarity([1, NaN], [1, 2])).toBeGreaterThan(0);
  });

  it("handles empty vectors", () => {
    expect(it_cosineSimilarity([], [])).toBe(0);
  });

  it("returns 0 when norms are zero", () => {
    expect(it_cosineSimilarity([0, 0], [0, 0])).toBe(0);
  });
});
