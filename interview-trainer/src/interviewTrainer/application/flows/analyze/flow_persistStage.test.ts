import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistAnalysis: vi.fn(),
}));

vi.mock("../../services/it_analysisPersistence", () => ({
  it_persistAnalysis: mocks.persistAnalysis,
}));

import { it_runPersistStage } from "./flow_persistStage";

function createResponse() {
  return {
    transcript: "transcript",
    questionText: "question",
    questionList: ["question"],
    questionTimings: [],
    reportPath: "/workspace/sessions/20260221/topic/report.md",
    topicDir: "/workspace/sessions/20260221/topic",
    topicTitle: "topic",
    attemptIndex: 1,
    notes: [],
    notesByQuestion: [],
    evaluation: {
      topicTitle: "topic",
      topicSummary: "summary",
      scores: { clarity: 80 },
      overallScore: 80,
      strengths: [],
      issues: [],
      improvements: [],
      nextFocus: [],
      revisedAnswers: [],
      mode: "llm",
    },
  };
}

describe("flow_persistStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates persistence and emits start/success traces", async () => {
    const traceEvents: Array<Record<string, unknown>> = [];
    const reportProgress = vi.fn();
    const shouldAbort = vi.fn(() => false);
    const onTrace = vi.fn();

    mocks.persistAnalysis.mockResolvedValue(undefined);

    await it_runPersistStage({
      questionText: "question",
      questionList: ["question"],
      topicTitle: "topic",
      topicDir: "/workspace/sessions/20260221/topic",
      reportPath: "/workspace/sessions/20260221/topic/report.md",
      attemptIndex: 2,
      response: createResponse() as any,
      reportProgress,
      shouldAbort,
      onTrace,
      traceFlow: (action, status, detail, level) => {
        traceEvents.push({ action, status, detail, level });
      },
    });

    expect(mocks.persistAnalysis).toHaveBeenCalledTimes(1);
    expect(mocks.persistAnalysis).toHaveBeenCalledWith(
      expect.objectContaining({
        questionText: "question",
        questionList: ["question"],
        topicTitle: "topic",
        topicDir: "/workspace/sessions/20260221/topic",
        reportPath: "/workspace/sessions/20260221/topic/report.md",
        attemptIndex: 2,
        response: expect.any(Object),
        reportProgress,
        shouldAbort,
        onTrace,
      }),
    );
    expect(traceEvents[0]).toMatchObject({
      action: "persist_stage",
      status: "start",
      level: "debug",
    });
    expect(traceEvents.some((event) => event.action === "persist_stage" && event.status === "success")).toBe(
      true,
    );
  });

  it("emits error trace and rethrows when persistence fails", async () => {
    const traceEvents: Array<Record<string, unknown>> = [];
    mocks.persistAnalysis.mockRejectedValueOnce(new Error("persist-failed"));

    await expect(
      it_runPersistStage({
        questionText: "question",
        questionList: ["question"],
        topicTitle: "topic",
        topicDir: "/workspace/sessions/20260221/topic",
        reportPath: "/workspace/sessions/20260221/topic/report.md",
        attemptIndex: 2,
        response: createResponse() as any,
        reportProgress: () => undefined,
        shouldAbort: () => false,
        onTrace: () => undefined,
        traceFlow: (action, status, detail, level) => {
          traceEvents.push({ action, status, detail, level });
        },
      }),
    ).rejects.toThrow("persist-failed");

    const errorTrace = traceEvents.find(
      (event) => event.action === "persist_stage" && event.status === "error",
    );
    expect(errorTrace).toBeTruthy();
    expect((errorTrace?.detail as any)?.errorCode).toBe("persist_stage_failed");
    expect((errorTrace?.detail as any)?.error).toBe("persist-failed");
  });
});
