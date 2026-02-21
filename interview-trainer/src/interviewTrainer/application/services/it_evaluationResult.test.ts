import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  canUseLlm: vi.fn(),
  generateOutlines: vi.fn(),
  generateRevisedByOutline: vi.fn(),
  extractScoreData: vi.fn(),
  computeOverallScore: vi.fn(),
  isOutlineKeywordLike: vi.fn(),
  outlineHasIndent: vi.fn(),
  pickRevisedAnswers: vi.fn(),
  toOutlineArray: vi.fn(),
  toStringArray: vi.fn(),
}));

vi.mock("./it_evaluationLlm", () => ({
  it_canUseLlm: mocks.canUseLlm,
  it_generateOutlines: mocks.generateOutlines,
  it_generateRevisedByOutline: mocks.generateRevisedByOutline,
}));

vi.mock("../../domain/evaluation/scoring", () => ({
  it_extractScoreData: mocks.extractScoreData,
  it_computeOverallScore: mocks.computeOverallScore,
}));

vi.mock("../../domain/evaluation/parser", () => ({
  it_isOutlineKeywordLike: mocks.isOutlineKeywordLike,
  it_outlineHasIndent: mocks.outlineHasIndent,
  it_pickRevisedAnswers: mocks.pickRevisedAnswers,
  it_toOutlineArray: mocks.toOutlineArray,
  it_toStringArray: mocks.toStringArray,
}));

import { it_buildEvaluationFromParsed } from "./it_evaluationResult";

function createParams(overrides: Record<string, unknown> = {}) {
  return {
    parsed: {
      topicTitle: "topic-a",
      topicSummary: "summary-a",
      strengths: ["s1"],
      issues: ["i1"],
      improvements: ["imp1"],
      nextFocus: ["next1"],
      revisedAnswers: [
        {
          question: "q1",
          original: "o1",
          revised: "r1",
          estimatedTimeMin: 2,
          outlineOriginal: ["orig-a"],
          outlineRevised: ["rev-a"],
        },
      ],
    },
    parsedRevised: [
      {
        question: "q1",
        original: "o1",
        revised: "r1",
        estimatedTimeMin: 2,
        outlineOriginal: ["orig-a"],
        outlineRevised: ["rev-a"],
      },
    ],
    question: "q1",
    questions: ["q1"],
    resolvedAnswers: [{ question: "q1", answer: "answer-1" }],
    notes: [
      { source: "n1.md", snippet: "note-1" },
      { source: "n2.md", snippet: "note-2" },
    ],
    dimensions: ["clarity", "logic"],
    config: {
      provider: "openai",
      answerMode: "two-step",
    },
    timePlan: [3, 3, 3],
    demoPrompt: "demo",
    material: "material",
    backgroundQuestions: ["bq1"],
    content: "raw-content",
    finalPromptText: "prompt-text",
    ...overrides,
  } as any;
}

describe("it_evaluationResult", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.canUseLlm.mockReturnValue(true);
    mocks.generateOutlines.mockResolvedValue([]);
    mocks.generateRevisedByOutline.mockResolvedValue([]);
    mocks.extractScoreData.mockReturnValue({
      scores: { clarity: 8, logic: 7 },
      overall: Number.NaN,
    });
    mocks.computeOverallScore.mockReturnValue(78);
    mocks.isOutlineKeywordLike.mockReturnValue(true);
    mocks.outlineHasIndent.mockReturnValue(true);
    mocks.pickRevisedAnswers.mockReturnValue([]);
    mocks.toOutlineArray.mockImplementation((value: any) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean);
      }
      if (typeof value === "string" && value.trim()) {
        return [value.trim()];
      }
      return [];
    });
    mocks.toStringArray.mockImplementation((value: any) => {
      if (Array.isArray(value)) {
        return value.map((item) => String(item));
      }
      if (typeof value === "string" && value.trim()) {
        return [value.trim()];
      }
      return [];
    });
  });

  it("builds evaluation payload with computed overall score and note fallback", async () => {
    const result = await it_buildEvaluationFromParsed(
      createParams({
        parsed: {
          topicTitle: "topic-a",
          topicSummary: "summary-a",
          strengths: ["s1"],
          issues: ["i1"],
          improvements: [],
          nextFocus: [],
          noteUsage: [],
          noteSuggestions: [],
        },
        parsedRevised: [
          {
            question: "q1",
            revised: "r1",
            outlineOriginal: ["orig-a"],
            outlineRevised: ["rev-a"],
          },
        ],
      }),
    );

    expect(mocks.computeOverallScore).toHaveBeenCalledWith(
      { clarity: 8, logic: 7 },
      ["clarity", "logic"],
    );
    expect(result.overallScore).toBe(78);
    expect(result.noteUsage).toEqual(["n1.md :: note-1", "n2.md :: note-2"]);
    expect(result.noteSuggestions).toHaveLength(2);
    expect(result.noteSuggestions[0]).toContain("note-1");
    expect(result.noteSuggestions[1]).toContain("note-2");
    expect(result.revisedAnswers[0]).toMatchObject({
      question: "q1",
      revised: "r1",
      estimatedTimeMin: 3,
    });
    expect(result.prompt).toBe("prompt-text");
    expect(result.raw).toBe("raw-content");
  });

  it("regenerates outlines when outlines are not keyword-like or missing indentation", async () => {
    mocks.isOutlineKeywordLike.mockImplementation((value: string[]) =>
      Array.isArray(value) && value[0] === "valid-outline",
    );
    mocks.outlineHasIndent.mockReturnValue(false);
    mocks.generateOutlines.mockResolvedValueOnce([
      {
        outlineOriginal: ["valid-outline"],
        outlineRevised: ["valid-outline"],
      },
    ]);

    const result = await it_buildEvaluationFromParsed(
      createParams({
        parsedRevised: [
          {
            question: "q1",
            original: "o1",
            revised: "r1",
            outlineOriginal: ["bad-outline"],
            outlineRevised: ["bad-outline"],
          },
        ],
      }),
    );

    expect(mocks.generateOutlines).toHaveBeenCalledTimes(1);
    expect(result.revisedAnswers[0].outlineOriginal).toEqual(["valid-outline"]);
    expect(result.revisedAnswers[0].outlineRevised).toEqual(["valid-outline"]);
  });

  it("regenerates revised text by outline in two-step mode when llm is available", async () => {
    mocks.generateRevisedByOutline.mockResolvedValueOnce(["rewritten answer"]);

    const result = await it_buildEvaluationFromParsed(
      createParams({
        parsedRevised: [
          {
            question: "q1",
            original: "o1",
            revised: "r1",
            outlineOriginal: ["orig-a"],
            outlineRevised: ["rev-a"],
          },
        ],
      }),
    );

    expect(mocks.generateRevisedByOutline).toHaveBeenCalledTimes(1);
    expect(result.revisedAnswers[0].revised).toBe("rewritten answer");
  });

  it("skips llm regeneration when llm unavailable or answer mode is single", async () => {
    mocks.canUseLlm.mockReturnValue(false);

    const result = await it_buildEvaluationFromParsed(
      createParams({
        config: { provider: "openai", answerMode: "single" },
      }),
    );

    expect(mocks.generateOutlines).not.toHaveBeenCalled();
    expect(mocks.generateRevisedByOutline).not.toHaveBeenCalled();
    expect(result.revisedAnswers[0].revised).toBe("r1");
  });
});
