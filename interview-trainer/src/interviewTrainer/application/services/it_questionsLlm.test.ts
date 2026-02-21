import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLlmChatStreaming: vi.fn(),
  createTraceLogger: vi.fn(),
  formatSeconds: vi.fn(),
  normalizeText: vi.fn(),
  extractJson: vi.fn(),
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

vi.mock("./it_textGateway", () => ({
  it_formatSeconds: mocks.formatSeconds,
  it_normalizeText: mocks.normalizeText,
}));

vi.mock("../../domain/analyze/shared", () => ({
  it_extractJson: mocks.extractJson,
}));

import { it_assignSegmentsWithLlm, it_splitAnswersWithLlm } from "./it_questionsLlm";

function createLlmConfig() {
  return {
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-4o-mini",
    stream: true,
  } as any;
}

describe("it_questionsLlm", () => {
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

    mocks.formatSeconds.mockImplementation((sec: number) => `${sec.toFixed(1)}s`);
    mocks.normalizeText.mockImplementation((text: string) =>
      String(text || "")
        .toLowerCase()
        .replace(/\s+/g, " ")
        .trim(),
    );
  });

  it("returns null for assign when question list or speech segments are empty", async () => {
    const config = createLlmConfig();
    const questions = ["q1"];

    await expect(it_assignSegmentsWithLlm(config, [], [])).resolves.toBeNull();
    await expect(
      it_assignSegmentsWithLlm(config, questions, [{ type: "noise", startSec: 0, endSec: 1 } as any]),
    ).resolves.toBeNull();

    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
  });

  it("assigns speech segments to questions and builds timing + answer results", async () => {
    const config = createLlmConfig();
    const questions = ["q1", "q2"];
    const segments = [
      { type: "speech", startSec: 0, endSec: 2, text: "answer q1 part1" },
      { type: "speech", startSec: 2, endSec: 4, text: "answer q1 part2" },
      { type: "speech", startSec: 5, endSec: 7, text: "answer q2 part1" },
    ] as any;

    mocks.callLlmChatStreaming.mockResolvedValueOnce('{"assignments":[{"segmentIndex":0,"questionIndex":0},{"segmentIndex":1,"questionIndex":0},{"segmentIndex":2,"questionIndex":1}]}');
    mocks.extractJson.mockReturnValue({
      assignments: [
        { segmentIndex: 0, questionIndex: 0 },
        { segmentIndex: 1, questionIndex: 0 },
        { segmentIndex: 2, questionIndex: 1 },
      ],
    });

    const streamUpdates: Array<{ text: string; done?: boolean; reset?: boolean }> = [];
    const result = await it_assignSegmentsWithLlm(
      config,
      questions,
      segments,
      undefined,
      (update) => streamUpdates.push(update),
    );

    expect(result).toBeTruthy();
    expect(result?.timings[0]).toMatchObject({
      question: "q1",
      startSec: 0,
      endSec: 4,
      durationSec: 4,
    });
    expect(result?.timings[1]).toMatchObject({
      question: "q2",
      startSec: 5,
      endSec: 7,
      durationSec: 2,
    });
    expect(result?.answers[0].answer).toContain("answer q1 part1");
    expect(result?.answers[0].answer).toContain("answer q1 part2");
    expect(result?.answers[1].answer).toContain("answer q2 part1");
    expect(streamUpdates[0]).toMatchObject({ reset: true });
    expect(streamUpdates.at(-1)).toMatchObject({ done: true });
  });

  it("returns null for assign when parsed assignments are empty or invalid", async () => {
    const config = createLlmConfig();
    const questions = ["q1"];
    const segments = [{ type: "speech", startSec: 0, endSec: 1, text: "answer" }] as any;

    mocks.callLlmChatStreaming.mockResolvedValue("any");
    mocks.extractJson.mockReturnValue({ assignments: [] });
    await expect(it_assignSegmentsWithLlm(config, questions, segments)).resolves.toBeNull();

    mocks.extractJson.mockReturnValue({
      assignments: [{ segmentIndex: 9, questionIndex: 0 }],
    });
    await expect(it_assignSegmentsWithLlm(config, questions, segments)).resolves.toBeNull();
  });

  it("returns null and traces error when assign llm call fails", async () => {
    mocks.callLlmChatStreaming.mockRejectedValueOnce(new Error("llm failed"));

    const result = await it_assignSegmentsWithLlm(
      createLlmConfig(),
      ["q1"],
      [{ type: "speech", startSec: 0, endSec: 1, text: "answer" }] as any,
    );

    expect(result).toBeNull();
    expect(mocks.logLlmTemplateError).toHaveBeenCalledTimes(1);
  });

  it("returns null for splitAnswers when questions or transcript are empty", async () => {
    const config = createLlmConfig();
    await expect(it_splitAnswersWithLlm(config, [], "a")).resolves.toBeNull();
    await expect(it_splitAnswersWithLlm(config, ["q1"], "   ")).resolves.toBeNull();
    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
  });

  it("supports string-array answer output when length matches questions", async () => {
    const config = createLlmConfig();
    mocks.callLlmChatStreaming.mockResolvedValueOnce('{"answers":["a1","a2"]}');
    mocks.extractJson.mockReturnValue({ answers: ["a1", "a2"] });

    const result = await it_splitAnswersWithLlm(config, ["q1", "q2"], "full transcript");

    expect(result).toEqual([
      { question: "q1", answer: "a1" },
      { question: "q2", answer: "a2" },
    ]);
  });

  it("maps object answers by index or question text and merges duplicate entries", async () => {
    const config = createLlmConfig();
    mocks.callLlmChatStreaming.mockResolvedValueOnce("json");
    mocks.extractJson.mockReturnValue({
      answers: [
        { questionIndex: 0, answer: "first part" },
        { question: "Q2", text: "second answer" },
        { questionIndex: 0, answer: "second part" },
        { questionIndex: 8, answer: "invalid" },
      ],
    });

    const result = await it_splitAnswersWithLlm(config, ["q1", "q2"], "full transcript");

    expect(result).toEqual([
      { question: "q1", answer: "first part second part" },
      { question: "q2", answer: "second answer" },
    ]);
  });

  it("returns null when splitAnswers has no valid mapped answers", async () => {
    const config = createLlmConfig();
    mocks.callLlmChatStreaming.mockResolvedValueOnce("json");
    mocks.extractJson.mockReturnValue({
      answers: [{ questionIndex: 99, answer: "out of range" }],
    });

    await expect(it_splitAnswersWithLlm(config, ["q1"], "full transcript")).resolves.toBeNull();
  });

  it("returns null and traces error when splitAnswers llm call fails", async () => {
    mocks.callLlmChatStreaming.mockRejectedValueOnce(new Error("llm broken"));

    const result = await it_splitAnswersWithLlm(
      createLlmConfig(),
      ["q1"],
      "full transcript",
    );

    expect(result).toBeNull();
    expect(mocks.logLlmTemplateError).toHaveBeenCalledTimes(1);
  });
});
