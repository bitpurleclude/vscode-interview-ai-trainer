import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLlmChatStreaming: vi.fn(),
  createTraceLogger: vi.fn(),
  logLlmTemplateRequest: vi.fn(),
  logLlmTemplateResponse: vi.fn(),
  logLlmTemplateError: vi.fn(),
}));

vi.mock("./it_llmGateway", () => ({
  it_callLlmChatStreaming: mocks.callLlmChatStreaming,
}));

vi.mock("./it_traceGateway", () => ({
  it_createTraceLogger: mocks.createTraceLogger,
}));

import { it_parseQuestions } from "./it_questionParser";

function createLlmConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.6,
    topP: 0.8,
    timeoutSec: 45,
    maxRetries: 1,
    stream: true,
    ...overrides,
  } as any;
}

describe("it_questionParser", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.logLlmTemplateRequest.mockResolvedValue(undefined);
    mocks.logLlmTemplateResponse.mockReturnValue(undefined);
    mocks.logLlmTemplateError.mockReturnValue(undefined);
    mocks.createTraceLogger.mockReturnValue({
      logLlmTemplateRequest: mocks.logLlmTemplateRequest,
      logLlmTemplateResponse: mocks.logLlmTemplateResponse,
      logLlmTemplateError: mocks.logLlmTemplateError,
    });
  });

  it("falls back to heuristic and reports config error when llm is missing", async () => {
    const traceEvents: Array<{ message: string; detail?: Record<string, unknown> }> = [];
    const result = await it_parseQuestions(
      "这是一段材料文本",
      null,
      undefined,
      (message, detail) => {
        traceEvents.push({ message, detail });
      },
    );

    expect(result.source).toBe("heuristic");
    expect(result.error).toBe("LLM not configured");
    expect(result.questions).toEqual([]);
    expect(result.material).toContain("材料");
    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
    expect(traceEvents.length).toBeGreaterThan(0);
  });

  it("returns empty heuristic result for blank text without llm calls", async () => {
    const result = await it_parseQuestions("   \n\t  ", createLlmConfig());

    expect(result.source).toBe("heuristic");
    expect(result.material).toBe("");
    expect(result.questions).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
  });

  it("parses llm json output and streams progress updates", async () => {
    mocks.callLlmChatStreaming.mockResolvedValueOnce(
      'prefix {"material":"背景材料","questions":["1. 第一题是什么？","第二题怎么做？"]} suffix',
    );

    const streamUpdates: Array<{ text: string; done?: boolean; reset?: boolean }> = [];
    const result = await it_parseQuestions("原始题目文本", createLlmConfig(), (update) => {
      streamUpdates.push(update);
    });

    expect(result.source).toBe("llm");
    expect(result.material).toBe("背景材料");
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0]).toBe("第一题是什么？");
    expect(result.questions[1]).toContain("怎么做");
    expect(result.raw).toContain('"questions"');
    expect(result.debug?.request).toMatchObject({
      provider: "openai",
      model: "gpt-4o-mini",
    });
    expect(result.debug?.response).toMatchObject({
      text: expect.stringContaining('"material"'),
    });
    expect(streamUpdates[0]).toMatchObject({ reset: true });
    expect(streamUpdates.at(-1)).toMatchObject({ done: true });
    expect(mocks.logLlmTemplateRequest).toHaveBeenCalledTimes(1);
    expect(mocks.logLlmTemplateResponse).toHaveBeenCalledTimes(1);
  });

  it("falls back to heuristic when llm output is not parseable json", async () => {
    mocks.callLlmChatStreaming.mockResolvedValueOnce("this output has no json object");

    const result = await it_parseQuestions("单段文本", createLlmConfig());

    expect(result.source).toBe("heuristic");
    expect(result.material).toBe("单段文本");
    expect(result.questions).toEqual([]);
    expect(result.error).toBeUndefined();
    expect(result.raw).toBe("this output has no json object");
    expect(result.debug?.response).toMatchObject({
      text: "this output has no json object",
    });
  });

  it("captures llm error details including response status/data", async () => {
    const error = new Error("rate limited");
    (error as any).response = {
      status: 429,
      data: { code: "rate_limit", message: "too many requests" },
    };
    mocks.callLlmChatStreaming.mockRejectedValueOnce(error);

    const result = await it_parseQuestions("这是带题目的文本", createLlmConfig());

    expect(result.source).toBe("heuristic");
    expect(result.error).toContain("rate limited");
    expect(result.error).toContain("status=429");
    expect(result.error).toContain('"code":"rate_limit"');
    expect(mocks.logLlmTemplateError).toHaveBeenCalledTimes(1);
  });
});
