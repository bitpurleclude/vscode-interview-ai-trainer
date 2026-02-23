import { describe, expect, it } from "vitest";
import { it_buildUnavailableEvaluation } from "./it_evaluationFallback";

describe("it_evaluationFallback", () => {
  it("builds unavailable evaluation with empty notes and fallback topic title", () => {
    const result = it_buildUnavailableEvaluation({
      question: "",
      reason: "llm unavailable",
      dimensions: ["clarity", "logic"],
      notes: [],
      promptText: "prompt",
      raw: "raw-error",
    });

    expect(result.topicTitle).toBe("未命名");
    expect(result.topicSummary).toBe("llm unavailable");
    expect(result.overallScore).toBe(0);
    expect(result.issues).toEqual(["llm unavailable"]);
    expect(result.noteUsage).toEqual([]);
    expect(result.noteSuggestions).toEqual([]);
    expect(result.mode).toBe("heuristic");
    expect(result.prompt).toBe("prompt");
    expect(result.raw).toBe("raw-error");
  });

  it("maps top 3 notes into note usage and suggestions", () => {
    const notes = [
      { source: "a.md", snippet: "a-snippet" },
      { source: "b.md", snippet: "b-snippet" },
      { source: "c.md", snippet: "c-snippet" },
      { source: "d.md", snippet: "d-snippet" },
    ] as any;

    const result = it_buildUnavailableEvaluation({
      question: "q1",
      reason: "parse failed",
      dimensions: ["clarity"],
      notes,
    });

    expect(result.topicTitle).toBe("q1");
    expect(result.noteUsage).toEqual([
      "a.md :: a-snippet",
      "b.md :: b-snippet",
      "c.md :: c-snippet",
    ]);
    expect(result.noteSuggestions).toHaveLength(3);
    expect(result.noteSuggestions?.[0]).toContain("a-snippet");
    expect(result.noteSuggestions?.[1]).toContain("b-snippet");
    expect(result.noteSuggestions?.[2]).toContain("c-snippet");
  });
});
