import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  appendAttemptDataAsync: vi.fn(),
  appendReportAsync: vi.fn(),
  buildQuestionFingerprint: vi.fn(),
  readTopicMetaAsync: vi.fn(),
  updateReferenceNotesFileAsync: vi.fn(),
  writeTopicMetaAsync: vi.fn(),
  hashText: vi.fn(),
  normalizeText: vi.fn(),
}));

vi.mock("./it_storageGateway", () => ({
  it_appendAttemptDataAsync: mocks.appendAttemptDataAsync,
  it_appendReportAsync: mocks.appendReportAsync,
  it_buildQuestionFingerprint: mocks.buildQuestionFingerprint,
  it_readTopicMetaAsync: mocks.readTopicMetaAsync,
  it_updateReferenceNotesFileAsync: mocks.updateReferenceNotesFileAsync,
  it_writeTopicMetaAsync: mocks.writeTopicMetaAsync,
}));

vi.mock("./it_textGateway", () => ({
  it_hashText: mocks.hashText,
  it_normalizeText: mocks.normalizeText,
}));

import { it_persistAnalysis } from "./it_analysisPersistence";

function createResponse() {
  return {
    transcript: "answer transcript",
    detailedTranscript: "detailed transcript",
    acoustic: { durationSec: 12, speechDurationSec: 10 },
    notes: [{ source: "n1.md", text: "note" }],
    evaluation: {
      topicTitle: "topic",
      topicSummary: "summary",
      scores: {},
      overallScore: 86,
      strengths: [],
      issues: [],
      improvements: [],
      nextFocus: [],
      revisedAnswers: [],
      mode: "llm",
    },
    audioPath: "session/a.wav",
    audioSegments: [],
    questionTimings: [],
  } as any;
}

describe("it_analysisPersistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.appendReportAsync.mockResolvedValue(undefined);
    mocks.updateReferenceNotesFileAsync.mockResolvedValue(undefined);
    mocks.appendAttemptDataAsync.mockResolvedValue(undefined);
    mocks.readTopicMetaAsync.mockResolvedValue({
      topicTitle: "",
      questionText: "",
      questionList: [],
      questionHash: "",
      createdAt: "",
      updatedAt: "",
      overallScore: 0,
    });
    mocks.writeTopicMetaAsync.mockResolvedValue(undefined);
    mocks.buildQuestionFingerprint.mockReturnValue("fp-123");
    mocks.normalizeText.mockReturnValue("normalized-text");
    mocks.hashText.mockReturnValue("hash-123");
  });

  it("persists report, attempt, and topic meta with progress + trace updates", async () => {
    const progressEvents: Array<Record<string, unknown>> = [];
    const traceEvents: Array<Record<string, unknown>> = [];

    await it_persistAnalysis({
      questionText: "question text",
      questionList: ["q1", "q2"],
      topicTitle: "topic-title",
      topicDir: "sessions/topic",
      reportPath: "sessions/topic/report.md",
      attemptIndex: 3,
      response: createResponse(),
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
      onTrace: (message, detail) => {
        traceEvents.push({ message, detail });
      },
    });

    expect(mocks.appendReportAsync).toHaveBeenCalledWith(
      "sessions/topic/report.md",
      "topic-title",
      "question text",
      ["q1", "q2"],
      3,
      expect.any(Object),
      expect.objectContaining({
        attemptHeading: "Attempt {n}",
        segmentHeading: "Question {n}",
      }),
    );
    expect(mocks.updateReferenceNotesFileAsync).toHaveBeenCalledWith(
      "sessions/topic",
      expect.any(Object),
    );
    expect(mocks.appendAttemptDataAsync).toHaveBeenCalledWith(
      "sessions/topic",
      expect.objectContaining({
        attemptIndex: 3,
        audioPath: "session/a.wav",
        transcript: "answer transcript",
      }),
    );
    expect(mocks.writeTopicMetaAsync).toHaveBeenCalledWith(
      "sessions/topic",
      expect.objectContaining({
        topicTitle: "topic-title",
        questionText: "question text",
        questionList: ["q1", "q2"],
        questionHash: "hash-123",
        overallScore: 86,
      }),
    );
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "report", progress: 30, status: "running" }),
        expect.objectContaining({ step: "report", progress: 100, status: "success" }),
        expect.objectContaining({ step: "write", progress: 40, status: "running" }),
        expect.objectContaining({ step: "write", progress: 100, status: "success" }),
      ]),
    );
    expect(
      traceEvents.some(
        (item) =>
          item.message === "persistence persist_analysis success" &&
          (item.detail as any)?.event === "application.persistence.persist_analysis",
      ),
    ).toBe(true);
  });

  it("uses meta fallback values and normalized hash when fingerprint is empty", async () => {
    mocks.buildQuestionFingerprint.mockReturnValue("");
    mocks.readTopicMetaAsync.mockResolvedValue({
      topicTitle: "meta-topic",
      questionText: "meta-question",
      questionList: ["meta-q1"],
      questionHash: "meta-hash",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      overallScore: 66,
    });

    await it_persistAnalysis({
      questionText: "",
      questionList: [],
      topicTitle: "fallback-topic",
      topicDir: "sessions/topic",
      reportPath: "sessions/topic/report.md",
      attemptIndex: 1,
      response: createResponse(),
      reportProgress: () => undefined,
    });

    expect(mocks.normalizeText).toHaveBeenCalled();
    expect(mocks.hashText).not.toHaveBeenCalled();
    expect(mocks.writeTopicMetaAsync).toHaveBeenCalledWith(
      "sessions/topic",
      expect.objectContaining({
        topicTitle: "meta-topic",
        questionText: "meta-question",
        questionList: ["meta-q1"],
        questionHash: "meta-hash",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
  });

  it("stops early when shouldAbort returns true before start", async () => {
    await expect(
      it_persistAnalysis({
        questionText: "q",
        questionList: [],
        topicTitle: "topic",
        topicDir: "sessions/topic",
        reportPath: "sessions/topic/report.md",
        attemptIndex: 1,
        response: createResponse(),
        reportProgress: () => undefined,
        shouldAbort: () => true,
      }),
    ).rejects.toThrow(/停止/);

    expect(mocks.appendReportAsync).not.toHaveBeenCalled();
    expect(mocks.appendAttemptDataAsync).not.toHaveBeenCalled();
  });

  it("traces error and rethrows when report append fails", async () => {
    const traceEvents: Array<Record<string, unknown>> = [];
    mocks.appendReportAsync.mockRejectedValueOnce(new Error("report failed"));

    await expect(
      it_persistAnalysis({
        questionText: "q",
        questionList: [],
        topicTitle: "topic",
        topicDir: "sessions/topic",
        reportPath: "sessions/topic/report.md",
        attemptIndex: 1,
        response: createResponse(),
        reportProgress: () => undefined,
        onTrace: (message, detail) => traceEvents.push({ message, detail }),
      }),
    ).rejects.toThrow("report failed");

    const errorTrace = traceEvents.find(
      (item) => item.message === "persistence persist_analysis error",
    );
    expect(errorTrace).toBeTruthy();
    expect((errorTrace?.detail as any)?.error).toBe("report failed");
  });
});
