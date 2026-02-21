import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  parseQuestions: vi.fn(),
  readQuestionParseCache: vi.fn(),
  writeQuestionParseCache: vi.fn(),
}));

vi.mock("../../services/it_questionParser", () => ({
  it_parseQuestions: mocks.parseQuestions,
}));

vi.mock("../../services/it_storageGateway", () => ({
  it_readQuestionParseCache: mocks.readQuestionParseCache,
  it_writeQuestionParseCache: mocks.writeQuestionParseCache,
}));

import { it_prepareQuestionParseStage } from "./flow_questionStage";

describe("flow_questionStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("short-circuits when question list is already provided", () => {
    const progressEvents: Array<Record<string, unknown>> = [];

    const result = it_prepareQuestionParseStage({
      deps: {} as any,
      questionText: "raw-question-text",
      questionList: ["question-1", " ", "question-2"],
      questionParseRuntime: null,
      questionParseLlmConfig: null,
      cacheRoot: "/cache",
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    expect(result.parsePromise).toBeNull();
    expect(result.questionState.list).toEqual(["question-1", "question-2"]);
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "question",
          progress: 100,
          status: "success",
        }),
      ]),
    );
    expect(String(progressEvents[0]?.message || "")).toContain("题目已提供");
    expect(mocks.parseQuestions).not.toHaveBeenCalled();
  });

  it("throws when parse template runtime is missing for empty question list", () => {
    expect(() =>
      it_prepareQuestionParseStage({
        deps: {} as any,
        questionText: "only-text",
        questionList: [],
        questionParseRuntime: null,
        questionParseLlmConfig: null,
        cacheRoot: "/cache",
        reportProgress: () => undefined,
      }),
    ).toThrow("LLM 模板未绑定：请在设置中绑定题目解析模板。");
  });

  it("uses cache hit result and skips parser invocation", async () => {
    const progressEvents: Array<Record<string, unknown>> = [];
    mocks.readQuestionParseCache.mockResolvedValueOnce({
      material: "cached-material",
      questions: ["cached-q1", "cached-q2"],
      source: "llm",
    });

    const result = it_prepareQuestionParseStage({
      deps: {} as any,
      questionText: "raw-question-text",
      questionList: [],
      questionParseRuntime: { template: { id: "tpl-question" } } as any,
      questionParseLlmConfig: { provider: "template", model: "mock-llm" } as any,
      cacheRoot: "/cache",
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    await result.parsePromise;

    expect(result.questionState.text).toBe("cached-material");
    expect(result.questionState.list).toEqual(["cached-q1", "cached-q2"]);
    expect(mocks.parseQuestions).not.toHaveBeenCalled();
    expect(mocks.writeQuestionParseCache).not.toHaveBeenCalled();
    expect(String(progressEvents.at(-1)?.message || "")).toContain("缓存");
    expect(progressEvents.at(-1)?.status).toBe("success");
  });

  it("parses and writes cache when cache misses", async () => {
    const progressEvents: Array<Record<string, unknown>> = [];
    mocks.readQuestionParseCache.mockReturnValueOnce(null);
    mocks.parseQuestions.mockResolvedValueOnce({
      material: "llm-material",
      questions: ["llm-q1"],
      source: "llm",
    });

    const result = it_prepareQuestionParseStage({
      deps: {
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      questionText: "raw-question-text",
      questionList: [],
      questionParseRuntime: { template: { id: "tpl-question" } } as any,
      questionParseLlmConfig: { provider: "template", model: "mock-llm" } as any,
      cacheRoot: "/cache",
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    await result.parsePromise;

    expect(mocks.parseQuestions).toHaveBeenCalledTimes(1);
    expect(result.questionState.text).toBe("llm-material");
    expect(result.questionState.list).toEqual(["llm-q1"]);
    expect(mocks.writeQuestionParseCache).toHaveBeenCalledWith(
      "/cache",
      "raw-question-text",
      {
        material: "llm-material",
        questions: ["llm-q1"],
        source: "llm",
      },
    );
    expect(progressEvents[0]).toMatchObject({
      step: "question",
      progress: 5,
      status: "running",
    });
    expect(String(progressEvents.at(-1)?.message || "")).toContain("100%");
    expect(String(progressEvents.at(-1)?.message || "")).toContain("API");
    expect(progressEvents.at(-1)?.status).toBe("success");
  });

  it("falls back with error progress when parser fails", async () => {
    const progressEvents: Array<Record<string, unknown>> = [];
    mocks.readQuestionParseCache.mockReturnValueOnce(null);
    mocks.parseQuestions.mockRejectedValueOnce(new Error("parse-failed"));

    const result = it_prepareQuestionParseStage({
      deps: {
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      questionText: "raw-question-text",
      questionList: [],
      questionParseRuntime: { template: { id: "tpl-question" } } as any,
      questionParseLlmConfig: { provider: "template", model: "mock-llm" } as any,
      cacheRoot: "/cache",
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    await result.parsePromise;

    expect(String(progressEvents.at(-1)?.message || "")).toContain("题目解析失败，使用原题干");
    expect(progressEvents.at(-1)?.status).toBe("error");
  });
});
