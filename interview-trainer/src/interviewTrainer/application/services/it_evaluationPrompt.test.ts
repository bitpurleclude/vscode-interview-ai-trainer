import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buildSummary: vi.fn(),
}));

vi.mock("../../domain/evaluation/prompt", () => ({
  it_buildSummary: mocks.buildSummary,
}));

import {
  it_buildDynamicPromptParts,
  it_buildPromptText,
  it_buildStaticPromptParts,
  it_buildSystemPrompt,
} from "./it_evaluationPrompt";

describe("it_evaluationPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildSummary.mockReturnValue("acoustic summary");
  });

  it("returns custom system prompt when provided", () => {
    expect(it_buildSystemPrompt("  custom-system  ")).toBe("custom-system");
  });

  it("returns non-empty default system prompt when custom prompt is missing", () => {
    const prompt = it_buildSystemPrompt("   ");
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(20);
  });

  it("builds static prompt sections with provided context", () => {
    const parts = it_buildStaticPromptParts({
      demoPrompt: "demo",
      material: "material text",
      backgroundQuestions: ["bq1", "bq2"],
      questions: ["q1", "q2"],
      question: "q1",
      dimensions: ["clarity", "logic"],
      notes: [
        { source: "note-1.md", snippet: "snippet-1" },
        { source: "note-2.md", snippet: "snippet-2" },
      ] as any,
    });

    expect(parts.length).toBeGreaterThan(5);
    expect(parts.join("\n")).toContain("demo");
    expect(parts.join("\n")).toContain("material text");
    expect(parts.join("\n")).toContain("q1");
    expect(parts.join("\n")).toContain("note-1.md");
  });

  it("builds dynamic prompt sections using transcript answers and acoustic summary", () => {
    const parts = it_buildDynamicPromptParts({
      transcript: "full transcript",
      resolvedAnswers: [
        { question: "q1", answer: "a1" },
        { question: "q2", answer: "a2" },
      ],
      questions: ["q1", "q2"],
      acoustic: { durationSec: 12 } as any,
    });

    expect(mocks.buildSummary).toHaveBeenCalledTimes(1);
    expect(parts).toHaveLength(3);
    expect(parts[0]).toContain("full transcript");
    expect(parts[1]).toContain("a1");
    expect(parts[1]).toContain("a2");
    expect(parts[2]).toContain("acoustic summary");
  });

  it("composes prompt text in System/User format", () => {
    const text = it_buildPromptText("sys", "static", "dynamic");
    expect(text).toBe("System:\nsys\n\nUser:\nstatic\n\ndynamic");
  });
});
