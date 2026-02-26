import { beforeEach, describe, expect, it, vi } from "vitest";

const reactMock = vi.hoisted(() => ({
  useMemo: (factory: () => unknown) => factory(),
}));

vi.mock("react", () => ({
  useMemo: reactMock.useMemo,
}));

import { useDerivedViews } from "./useDerivedViews";

function createBaseState(overrides: Record<string, unknown> = {}) {
  return {
    statusMessage: "idle",
    overallProgress: 0,
    recordingState: "idle",
    steps: [],
    ...overrides,
  } as any;
}

describe("useDerivedViews", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prefers draft question timings for evaluation stream titles before final result", () => {
    const view = useDerivedViews({
      config: null,
      itState: createBaseState({
        draftQuestionTimings: [
          { question: "parsed-q1", startSec: 0, endSec: 10, durationSec: 10 },
          { question: "parsed-q2", startSec: 10, endSec: 20, durationSec: 10 },
        ],
      }),
      templateCategory: "llm",
      selectedTemplateId: "",
      questionText: "raw material that should not be used as title",
      parsedQuestionList: [],
      streamingPreviewChars: 200,
      analysisResult: null,
    });

    expect(view.evaluationStreamQuestions).toEqual(["parsed-q1", "parsed-q2"]);
  });
});
