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
    useRef: (initial: any) => {
      const index = cursor++;
      ensureSlot(index, { current: initial });
      return slots[index];
    },
    useCallback: (fn: any) => fn,
    beginRender: () => {
      cursor = 0;
    },
    resetAll: () => {
      slots.length = 0;
      cursor = 0;
    },
    setSlot: (index: number, value: any) => {
      slots[index] = value;
    },
  };
});

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  reportClientTrace: vi.fn(),
  buildAnalyzePayload: vi.fn(),
  isMessengerSuccess: vi.fn(),
  resolveSaveResultFeedback: vi.fn(),
  resolveAnalyzeQuestionsFromResponse: vi.fn(),
  shouldIgnoreAnalyzeResponse: vi.fn(),
}));

vi.mock("react", () => ({
  useState: reactMock.useState,
  useRef: reactMock.useRef,
  useCallback: reactMock.useCallback,
}));

vi.mock("../messenger", () => ({
  request: mocks.request,
  reportClientTrace: mocks.reportClientTrace,
}));

vi.mock("./useAnalysisFlow.contract", () => ({
  it_buildAnalyzePayload: mocks.buildAnalyzePayload,
  it_isMessengerSuccess: mocks.isMessengerSuccess,
  it_resolveSaveResultFeedback: mocks.resolveSaveResultFeedback,
  it_resolveAnalyzeQuestionsFromResponse: mocks.resolveAnalyzeQuestionsFromResponse,
  it_shouldIgnoreAnalyzeResponse: mocks.shouldIgnoreAnalyzeResponse,
}));

import { useAnalysisFlow } from "./useAnalysisFlow";

function createOptions(overrides: Record<string, unknown> = {}) {
  let parentState: any = {
    statusMessage: "idle",
    draftNotes: [{ source: "draft.md", text: "note" }],
    draftAcoustic: { durationSec: 3 },
    lastError: undefined,
  };

  const setItState = vi.fn((value: any) => {
    parentState = typeof value === "function" ? value(parentState) : value;
  });
  const setQuestionText = vi.fn();
  const setQuestionList = vi.fn();
  const setQuestionParsed = vi.fn();
  const setQuestionError = vi.fn();
  const setActiveTab = vi.fn();
  const setActivePage = vi.fn();
  const setShowNoteHits = vi.fn();
  const resetStreams = vi.fn();
  const resetEvaluationStream = vi.fn();

  const options = {
    audioPayload: {
      format: "wav",
      sampleRate: 16000,
      byteLength: 4,
      durationSec: 1,
      base64: "AQID",
    },
    hasQuestion: true,
    questionText: "question-text",
    parsedQuestionList: ["q1"],
    perQuestionSystemPrompts: [],
    perQuestionDemoPrompts: [],
    customPrompt: "system-prompt",
    demoPrompt: "demo-prompt",
    itState: parentState,
    setItState,
    setQuestionText,
    setQuestionList,
    setQuestionParsed,
    setQuestionError,
    setActiveTab,
    setActivePage,
    setShowNoteHits,
    resetStreams,
    resetEvaluationStream,
    ...overrides,
  } as any;

  return {
    options,
    spies: {
      setItState,
      setQuestionText,
      setQuestionList,
      setQuestionParsed,
      setQuestionError,
      setActiveTab,
      setActivePage,
      setShowNoteHits,
      resetStreams,
      resetEvaluationStream,
    },
    getParentState: () => parentState,
  };
}

function renderHook(options: any) {
  reactMock.beginRender();
  return useAnalysisFlow(options);
}

describe("useAnalysisFlow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reactMock.resetAll();

    mocks.buildAnalyzePayload.mockImplementation((payload: any) => payload);
    mocks.shouldIgnoreAnalyzeResponse.mockReturnValue(false);
    mocks.resolveAnalyzeQuestionsFromResponse.mockImplementation((content: any) => ({
      questionText: String(content?.questionText || "").trim(),
      questionList: Array.isArray(content?.questionList) ? content.questionList : [],
    }));
    mocks.isMessengerSuccess.mockImplementation((resp: any) => resp?.status === "success");
    mocks.resolveSaveResultFeedback.mockImplementation((resp: any) => ({
      ok: resp?.status === "success",
      message: resp?.status === "success" ? "saved" : "save failed",
      reportPath: "/tmp/report.md",
    }));
  });

  it("handles analyze success flow and updates question/evaluation view state", async () => {
    const { options, spies } = createOptions();
    mocks.request.mockResolvedValueOnce({
      status: "success",
      content: {
        questionText: "resolved question",
        questionList: ["resolved-q1"],
        evaluation: {
          topicTitle: "topic",
          revisedAnswers: [],
        },
        notes: [],
        acoustic: { durationSec: 2 },
      },
    });

    const hook = renderHook(options);
    await hook.handleAnalyze();
    const rerendered = renderHook(options);

    expect(mocks.request).toHaveBeenCalledWith(
      "it/analyzeAudio",
      expect.any(Object),
      expect.objectContaining({ timeoutMs: 300000 }),
    );
    expect(spies.setQuestionText).toHaveBeenCalledWith("resolved question");
    expect(spies.setQuestionList).toHaveBeenCalledWith("resolved-q1");
    expect(spies.setQuestionParsed).toHaveBeenCalledWith(true);
    expect(spies.setQuestionError).toHaveBeenCalledWith(false);
    expect(spies.setActiveTab).toHaveBeenCalledWith("evaluation");
    expect(rerendered.analysisResult?.questionText).toBe("resolved question");
  });

  it("rejects analyze when question is missing and sets question error state", async () => {
    const { options, spies, getParentState } = createOptions({
      hasQuestion: false,
    });

    const hook = renderHook(options);
    await hook.handleAnalyze();

    expect(mocks.request).not.toHaveBeenCalled();
    expect(spies.setQuestionError).toHaveBeenCalledWith(true);
    expect(getParentState().lastError).toBeTruthy();
  });

  it("ignores stale or cancelled analyze responses when contract marks them ignorable", async () => {
    const { options, spies } = createOptions();
    mocks.shouldIgnoreAnalyzeResponse.mockReturnValueOnce(true);
    mocks.request.mockResolvedValueOnce({
      status: "success",
      content: {
        questionText: "ignored question",
        questionList: ["ignored"],
      },
    });

    const hook = renderHook(options);
    await hook.handleAnalyze();
    const rerendered = renderHook(options);

    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(spies.setActiveTab).not.toHaveBeenCalledWith("evaluation");
    expect(rerendered.analysisResult).toBeNull();
  });

  it("clears previous result before a new run even when response is ignored", async () => {
    const { options } = createOptions();
    reactMock.setSlot(0, {
      questionText: "previous question",
      questionList: ["previous-q1"],
      evaluation: {
        topicTitle: "previous-topic",
        revisedAnswers: [],
      },
    });
    mocks.shouldIgnoreAnalyzeResponse.mockReturnValueOnce(true);
    mocks.request.mockResolvedValueOnce({
      status: "success",
      content: {
        questionText: "next question",
        questionList: ["next-q1"],
      },
    });

    const hook = renderHook(options);
    await hook.handleAnalyze();
    const rerendered = renderHook(options);

    expect(rerendered.analysisResult).toBeNull();
  });

  it("handles analyze cancel acknowledgement response path", async () => {
    const { options, getParentState } = createOptions();
    mocks.request.mockResolvedValueOnce({
      status: "error",
      error: "鍒嗘瀽宸插仠姝?",
    });

    const hook = renderHook(options);
    await hook.handleAnalyze();

    expect(getParentState().lastError).toBeUndefined();
  });

  it("cancels analysis when processing and calls cancel endpoint", async () => {
    const { options, getParentState } = createOptions();
    reactMock.setSlot(1, true);
    mocks.request.mockResolvedValueOnce({ status: "success" });

    const hook = renderHook(options);
    await hook.handleCancelAnalyze();

    expect(mocks.request).toHaveBeenCalledWith("it/cancelAnalyze");
    expect(getParentState().lastError).toBeUndefined();
  });

  it("saves current result and stores feedback message", async () => {
    const { options } = createOptions();
    reactMock.setSlot(0, {
      questionText: "resolved question",
      questionList: ["resolved-q1"],
      notes: [],
      acoustic: { durationSec: 1 },
      evaluation: {
        topicTitle: "topic",
        revisedAnswers: [],
      },
    });
    mocks.request.mockResolvedValueOnce({ status: "success", content: { reportPath: "/tmp/report.md" } });

    const hook = renderHook(options);
    await hook.handleSaveResult();
    const rerendered = renderHook(options);

    expect(mocks.request).toHaveBeenCalledWith(
      "it/saveCurrentResult",
      expect.objectContaining({
        response: expect.any(Object),
        questionText: "question-text",
        questionList: ["q1"],
      }),
    );
    expect(rerendered.saveResultMessage).toBe("结果已写入");
  });

  it("handles save-result guard and failure feedback branches", async () => {
    const missingResult = createOptions();
    const firstHook = renderHook(missingResult.options);
    await firstHook.handleSaveResult();
    const firstRerender = renderHook(missingResult.options);
    expect(firstRerender.saveResultMessage).toBeTruthy();

    const failed = createOptions();
    reactMock.setSlot(0, {
      questionText: "resolved question",
      questionList: ["resolved-q1"],
      notes: [],
      acoustic: { durationSec: 1 },
      evaluation: {
        topicTitle: "topic",
        revisedAnswers: [],
      },
    });
    mocks.request.mockResolvedValueOnce({ status: "error", error: "disk full" });
    const secondHook = renderHook(failed.options);
    await secondHook.handleSaveResult();
    const secondRerender = renderHook(failed.options);
    expect(secondRerender.saveResultMessage).toContain("保存失败");
    expect(secondRerender.saveResultMessage).toContain("disk full");
  });

  it("loads history list and switches to history tab", async () => {
    const { options, spies } = createOptions();
    mocks.request.mockResolvedValueOnce({
      status: "success",
      content: [{ topicTitle: "item-1" }],
    });

    const hook = renderHook(options);
    await hook.handleLoadHistory();
    const rerendered = renderHook(options);

    expect(rerendered.historyItems).toHaveLength(1);
    expect(spies.setActiveTab).toHaveBeenCalledWith("history");
    expect(spies.setActivePage).toHaveBeenCalledWith("practice");
  });

  it("handles load-history error responses without mutating tab/page", async () => {
    const { options, spies } = createOptions();
    mocks.request.mockResolvedValueOnce({
      status: "error",
      error: "history-failed",
    });

    const hook = renderHook(options);
    await hook.handleLoadHistory();

    expect(spies.setActiveTab).not.toHaveBeenCalledWith("history");
    expect(spies.setActivePage).not.toHaveBeenCalledWith("practice");
  });

  it("regenerates demo answer and updates revised answer in analysis result", async () => {
    const { options, spies } = createOptions({
      parsedQuestionList: ["q1", "q2"],
    });
    reactMock.setSlot(0, {
      questionText: "resolved question",
      questionList: ["q1", "q2"],
      notes: [{ source: "note.md", text: "note" }],
      acoustic: { durationSec: 2 },
      evaluation: {
        revisedAnswers: [
          {
            question: "q1",
            original: "old-answer",
            revised: "old-revised",
          },
        ],
      },
    });
    mocks.request.mockResolvedValueOnce({
      status: "success",
      content: {
        revised: "new-revised",
        demoAnswer: "demo",
      },
    });

    const hook = renderHook(options);
    await hook.handleRegenerateDemoAnswer(0);
    const rerendered = renderHook(options);

    expect(spies.resetEvaluationStream).toHaveBeenCalledWith(0);
    expect(mocks.request).toHaveBeenCalledWith(
      "it/regenerateDemoAnswer",
      expect.objectContaining({
        question: "q1",
        questionIndex: 0,
      }),
      expect.objectContaining({ timeoutMs: 120000 }),
    );
    expect(rerendered.analysisResult?.evaluation?.revisedAnswers?.[0]?.revised).toBe(
      "new-revised",
    );
  });

  it("skips regenerate when target answer is missing", async () => {
    const { options, spies } = createOptions();

    const hook = renderHook(options);
    await hook.handleRegenerateDemoAnswer(0);

    expect(mocks.request).not.toHaveBeenCalled();
    expect(spies.resetEvaluationStream).not.toHaveBeenCalled();
  });

  it("handles regenerate error response and updates status message", async () => {
    const { options, getParentState } = createOptions();
    reactMock.setSlot(0, {
      questionText: "resolved question",
      questionList: ["q1"],
      notes: [],
      acoustic: { durationSec: 2 },
      evaluation: {
        revisedAnswers: [
          {
            question: "q1",
            original: "old-answer",
            revised: "old-revised",
          },
        ],
      },
    });
    mocks.request.mockResolvedValueOnce({
      status: "error",
      error: "regenerate-failed",
    });

    const hook = renderHook(options);
    await hook.handleRegenerateDemoAnswer(0);

    expect(getParentState().statusMessage).toContain("regenerate-failed");
  });
});
