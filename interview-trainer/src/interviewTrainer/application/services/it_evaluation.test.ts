import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLlmChatStreaming: vi.fn(),
  createTraceLogger: vi.fn(),
  canUseLlm: vi.fn(),
  splitTranscriptByQuestions: vi.fn(),
  extractJsonPayload: vi.fn(),
  pickRevisedAnswers: vi.fn(),
  normalizeDimensions: vi.fn(),
  buildUnavailableEvaluation: vi.fn(),
  buildDynamicPromptParts: vi.fn(),
  buildPromptText: vi.fn(),
  buildStaticPromptParts: vi.fn(),
  buildSystemPrompt: vi.fn(),
  buildEvaluationFromParsed: vi.fn(),
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

vi.mock("./it_evaluationLlm", () => ({
  it_canUseLlm: mocks.canUseLlm,
}));

vi.mock("../../domain/evaluation/prompt", () => ({
  it_splitTranscriptByQuestions: mocks.splitTranscriptByQuestions,
}));

vi.mock("../../domain/evaluation/parser", () => ({
  it_extractJsonPayload: mocks.extractJsonPayload,
  it_pickRevisedAnswers: mocks.pickRevisedAnswers,
}));

vi.mock("../../domain/evaluation/scoring", () => ({
  it_normalizeDimensions: mocks.normalizeDimensions,
}));

vi.mock("./it_evaluationFallback", () => ({
  it_buildUnavailableEvaluation: mocks.buildUnavailableEvaluation,
}));

vi.mock("./it_evaluationPrompt", () => ({
  it_buildDynamicPromptParts: mocks.buildDynamicPromptParts,
  it_buildPromptText: mocks.buildPromptText,
  it_buildStaticPromptParts: mocks.buildStaticPromptParts,
  it_buildSystemPrompt: mocks.buildSystemPrompt,
}));

vi.mock("./it_evaluationResult", () => ({
  it_buildEvaluationFromParsed: mocks.buildEvaluationFromParsed,
}));

import { it_evaluateAnswer } from "./it_evaluation";

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-4o-mini",
    temperature: 0.4,
    topP: 0.8,
    timeoutSec: 30,
    maxRetries: 1,
    stream: true,
    language: "zh-CN",
    dimensions: ["clarity", "logic"],
    ...overrides,
  } as any;
}

function createAcoustic(overrides: Record<string, unknown> = {}) {
  return {
    durationSec: 12,
    speechDurationSec: 10,
    speechRateWpm: 130,
    pauseCount: 2,
    pauseAvgSec: 0.3,
    pauseMaxSec: 0.5,
    rmsDbMean: -18,
    rmsDbStd: 2,
    snrDb: 15,
    ...overrides,
  } as any;
}

function createUnavailableResult() {
  return {
    topicTitle: "unavailable",
    topicSummary: "unavailable",
    scores: {},
    overallScore: 0,
    strengths: [],
    issues: [],
    improvements: [],
    nextFocus: [],
    revisedAnswers: [],
    mode: "unavailable",
  };
}

function createLlmResult() {
  return {
    topicTitle: "topic",
    topicSummary: "summary",
    scores: { clarity: 88 },
    overallScore: 88,
    strengths: ["strength"],
    issues: [],
    improvements: [],
    nextFocus: [],
    revisedAnswers: [
      {
        question: "q1",
        original: "a1",
        revised: "r1",
        estimatedTimeMin: 3,
      },
    ],
    mode: "llm",
  };
}

describe("it_evaluation", () => {
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

    mocks.normalizeDimensions.mockReturnValue(["clarity", "logic"]);
    mocks.splitTranscriptByQuestions.mockReturnValue([
      { question: "q1", answer: "answer-1" },
    ]);
    mocks.canUseLlm.mockReturnValue(true);
    mocks.buildSystemPrompt.mockImplementation((custom?: string) =>
      custom?.trim() ? custom.trim() : "system-default",
    );
    mocks.buildStaticPromptParts.mockReturnValue(["static-part"]);
    mocks.buildDynamicPromptParts.mockReturnValue(["dynamic-part"]);
    mocks.buildPromptText.mockImplementation(
      (system: string, staticPrompt: string, dynamicPrompt: string) =>
        [system, staticPrompt, dynamicPrompt].filter(Boolean).join("\n---\n"),
    );

    mocks.callLlmChatStreaming.mockResolvedValue('{"ok":true}');
    mocks.extractJsonPayload.mockReturnValue({ revisedAnswers: [{ question: "q1" }] });
    mocks.pickRevisedAnswers.mockReturnValue([
      {
        question: "q1",
        original: "a1",
        revised: "r1",
        estimatedTimeMin: 3,
      },
    ]);

    mocks.buildUnavailableEvaluation.mockImplementation((args: any) => ({
      ...createUnavailableResult(),
      topicSummary: String(args.reason || "unavailable"),
      raw: args.raw,
      promptText: args.promptText,
    }));
    mocks.buildEvaluationFromParsed.mockResolvedValue(createLlmResult());
  });

  it("returns unavailable evaluation immediately when speech is too short", async () => {
    const result = await it_evaluateAnswer(
      "q1",
      "short",
      createAcoustic({ speechDurationSec: 1 }),
      [],
      createConfig(),
      ["q1"],
    );

    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
    expect(mocks.buildUnavailableEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "q1",
        raw: "no_speech_detected",
      }),
    );
    expect(result.mode).toBe("unavailable");
  });

  it("returns unavailable evaluation when llm is disabled", async () => {
    mocks.canUseLlm.mockReturnValue(false);

    const result = await it_evaluateAnswer(
      "q1",
      "this transcript is long enough for evaluation",
      createAcoustic(),
      [{ source: "note.md", text: "note" }] as any,
      createConfig(),
      ["q1"],
    );

    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
    expect(mocks.buildUnavailableEvaluation).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "q1",
        promptText: expect.any(String),
      }),
    );
    expect(result.mode).toBe("unavailable");
  });

  it("retries once when first parsed payload misses revised answers", async () => {
    mocks.callLlmChatStreaming
      .mockResolvedValueOnce("first-response")
      .mockResolvedValueOnce("second-response");
    mocks.extractJsonPayload.mockImplementation((content: string) =>
      content === "first-response" ? { first: true } : { second: true },
    );
    mocks.pickRevisedAnswers.mockImplementation((parsed: any) =>
      parsed.first
        ? []
        : [
            {
              question: "q1",
              original: "a1",
              revised: "r1",
              estimatedTimeMin: 3,
            },
          ],
    );

    const streamUpdates: Array<{ text: string; done?: boolean; reset?: boolean }> = [];
    const result = await it_evaluateAnswer(
      "q1",
      "this transcript is long enough for evaluation",
      createAcoustic(),
      [],
      createConfig(),
      ["q1"],
      [{ question: "q1", answer: "answer-1" }],
      "material text",
      ["q1"],
      undefined,
      undefined,
      undefined,
      (update) => streamUpdates.push(update),
    );

    expect(mocks.callLlmChatStreaming).toHaveBeenCalledTimes(2);
    const firstPrompt = mocks.callLlmChatStreaming.mock.calls[0]?.[1]?.[1]?.content as string;
    const secondPrompt = mocks.callLlmChatStreaming.mock.calls[1]?.[1]?.[1]?.content as string;
    expect(secondPrompt.length).toBeGreaterThan(firstPrompt.length);
    expect(secondPrompt).toContain("JSON");
    expect(mocks.buildEvaluationFromParsed).toHaveBeenCalledTimes(1);
    expect(streamUpdates.some((item) => item.reset)).toBe(true);
    expect(result.mode).toBe("llm");
  });

  it("falls back when llm output cannot be parsed after retries", async () => {
    mocks.callLlmChatStreaming.mockResolvedValue("not-json");
    mocks.extractJsonPayload.mockReturnValue(null);

    const result = await it_evaluateAnswer(
      "q1",
      "this transcript is long enough for evaluation",
      createAcoustic(),
      [],
      createConfig(),
      ["q1"],
    );

    expect(mocks.callLlmChatStreaming).toHaveBeenCalledTimes(2);
    expect(mocks.buildEvaluationFromParsed).not.toHaveBeenCalled();
    const fallbackArgs = mocks.buildUnavailableEvaluation.mock.calls.at(-1)?.[0];
    expect(fallbackArgs.raw).toBe("not-json");
    expect(String(fallbackArgs.reason)).toContain("LLM");
    expect(result.mode).toBe("unavailable");
  });

  it("falls back when parsed payload has no revisedAnswers", async () => {
    mocks.callLlmChatStreaming.mockResolvedValue("{}");
    mocks.extractJsonPayload.mockReturnValue({ ok: true });
    mocks.pickRevisedAnswers.mockReturnValue([]);

    const result = await it_evaluateAnswer(
      "q1",
      "this transcript is long enough for evaluation",
      createAcoustic(),
      [],
      createConfig(),
      ["q1"],
    );

    expect(mocks.buildEvaluationFromParsed).not.toHaveBeenCalled();
    const fallbackArgs = mocks.buildUnavailableEvaluation.mock.calls.at(-1)?.[0];
    expect(String(fallbackArgs.reason)).toContain("revisedAnswers");
    expect(result.mode).toBe("unavailable");
  });

  it("uses last error from llm call failures in fallback payload", async () => {
    mocks.callLlmChatStreaming.mockRejectedValue(new Error("llm-down"));

    const result = await it_evaluateAnswer(
      "q1",
      "this transcript is long enough for evaluation",
      createAcoustic(),
      [],
      createConfig(),
      ["q1"],
    );

    expect(mocks.callLlmChatStreaming).toHaveBeenCalledTimes(2);
    expect(mocks.logLlmTemplateError).toHaveBeenCalledTimes(2);
    const fallbackArgs = mocks.buildUnavailableEvaluation.mock.calls.at(-1)?.[0];
    expect(fallbackArgs.raw).toBe("llm-down");
    expect(String(fallbackArgs.reason)).toContain("LLM");
    expect(result.mode).toBe("unavailable");
  });
});
