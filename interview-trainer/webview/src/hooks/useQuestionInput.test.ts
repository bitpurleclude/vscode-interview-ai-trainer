import { beforeEach, describe, expect, it, vi } from "vitest";

const reactMock = vi.hoisted(() => {
  const slots: any[] = [];
  let cursor = 0;

  const ensureSlot = (index: number, initial: any) => {
    if (!(index in slots)) {
      slots[index] = typeof initial === "function" ? initial() : initial;
    }
  };

  return {
    useState: (initial: any) => {
      const index = cursor++;
      ensureSlot(index, initial);
      const setState = (value: any) => {
        slots[index] = typeof value === "function" ? value(slots[index]) : value;
      };
      return [slots[index], setState];
    },
    useMemo: (factory: () => any) => factory(),
    useCallback: (fn: any) => fn,
    useEffect: (effect: () => void | (() => void)) => {
      effect();
    },
    beginRender: () => {
      cursor = 0;
    },
    resetAll: () => {
      slots.length = 0;
      cursor = 0;
    },
  };
});

const mocks = vi.hoisted(() => ({
  parseQuestionsRemote: vi.fn(),
}));

vi.mock("react", () => ({
  useState: reactMock.useState,
  useMemo: reactMock.useMemo,
  useCallback: reactMock.useCallback,
  useEffect: reactMock.useEffect,
}));

vi.mock("../utils/questions", () => ({
  parseQuestionsRemote: mocks.parseQuestionsRemote,
}));

import { useQuestionInput } from "./useQuestionInput";

function renderHook(options: any) {
  reactMock.beginRender();
  return useQuestionInput(options);
}

function textEvent(value: string) {
  return { target: { value } } as any;
}

describe("useQuestionInput", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactMock.resetAll();
  });

  it("keeps parsed question list when source text is unchanged", async () => {
    const setItState = vi.fn();
    mocks.parseQuestionsRemote.mockResolvedValueOnce({
      prompt: "old material",
      questions: ["old-q1", "old-q2"],
      source: "llm",
    });

    const first = renderHook({ setItState });
    first.handleQuestionTextChange(textEvent("old material"));
    let rerendered = renderHook({ setItState });
    await rerendered.handleParseQuestions();
    rerendered = renderHook({ setItState });

    expect(rerendered.questionParsed).toBe(true);
    expect(rerendered.parsedQuestionList).toEqual(["old-q1", "old-q2"]);
  });

  it("drops stale parsed list when question text changes after parse", async () => {
    const setItState = vi.fn();
    mocks.parseQuestionsRemote.mockResolvedValueOnce({
      prompt: "old material",
      questions: ["old-q1", "old-q2"],
      source: "llm",
    });

    const first = renderHook({ setItState });
    first.handleQuestionTextChange(textEvent("old material"));
    let rerendered = renderHook({ setItState });
    await rerendered.handleParseQuestions();
    rerendered = renderHook({ setItState });

    expect(rerendered.questionParsed).toBe(true);
    expect(rerendered.parsedQuestionList).toEqual(["old-q1", "old-q2"]);

    rerendered.handleQuestionTextChange(textEvent("new material"));
    rerendered = renderHook({ setItState });

    expect(rerendered.questionParsed).toBe(false);
    expect(rerendered.questionList).toBe("");
    expect(rerendered.parsedQuestionList).toEqual([]);
  });
});
