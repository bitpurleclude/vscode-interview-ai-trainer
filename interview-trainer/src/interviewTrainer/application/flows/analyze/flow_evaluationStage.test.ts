import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ItAnalyzeRequest } from "../../../../protocol/interviewTrainer";

const mocks = vi.hoisted(() => ({
  evaluateAnswer: vi.fn(),
  buildAcousticForTiming: vi.fn(),
  mergeEvaluations: vi.fn(),
}));

vi.mock("../../services/it_evaluation", () => ({
  it_evaluateAnswer: mocks.evaluateAnswer,
}));

vi.mock("../../../domain/analyze/evaluation", () => ({
  it_buildAcousticForTiming: mocks.buildAcousticForTiming,
  it_mergeEvaluations: mocks.mergeEvaluations,
}));

import { it_runEvaluationStage } from "./flow_evaluationStage";

function createEvaluation(question: string, overallScore: number) {
  return {
    topicTitle: question,
    topicSummary: `${question}-summary`,
    scores: { clarity: overallScore },
    overallScore,
    strengths: ["strength"],
    issues: ["issue"],
    improvements: ["improvement"],
    nextFocus: ["next"],
    revisedAnswers: [
      {
        question,
        original: "original",
        revised: "revised",
        estimatedTimeMin: 3,
      },
    ],
    mode: "llm" as const,
  };
}

function createRequest(overrides: Partial<ItAnalyzeRequest> = {}): ItAnalyzeRequest {
  return {
    audio: {
      format: "wav",
      sampleRate: 16000,
      byteLength: 12,
      durationSec: 8,
      base64: "AQIDBA==",
    },
    questionText: "question-1\nquestion-2",
    questionList: ["question-1", "question-2"],
    runId: "evaluation-stage-test-run",
    ...overrides,
  };
}

describe("flow_evaluationStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.buildAcousticForTiming.mockImplementation((_timing, _segments, answer) => ({
      acoustic: `a:${String(answer || "")}`,
    }));
    mocks.mergeEvaluations.mockImplementation(({ questions, evaluations }: any) =>
      createEvaluation(
        questions?.[0] || "merged-topic",
        Math.max(
          0,
          ...((evaluations || [])
            .filter(Boolean)
            .map((item: any) => Number(item?.overallScore || 0))),
        ),
      ),
    );
  });

  it("evaluates questions, emits stream/partial/progress, and returns merged result", async () => {
    const streamEvents: Array<Record<string, unknown>> = [];
    const evalStreamEvents: Array<Record<string, unknown>> = [];
    const partialEvents: Array<Record<string, unknown>> = [];
    const progressEvents: Array<Record<string, unknown>> = [];
    const traceEvents: Array<Record<string, unknown>> = [];

    mocks.evaluateAnswer
      .mockImplementationOnce(async (_q: string, _a: string, _ac: unknown, _notes: unknown, _cfg: unknown, _single: unknown, _qas: unknown, _qt: unknown, _ql: unknown, _sys: unknown, _demo: unknown, _trace: unknown, streamHandler?: (update: { text: string; done?: boolean }) => void) => {
        streamHandler?.({ text: "token-1", done: false });
        return createEvaluation("question-1", 85);
      })
      .mockImplementationOnce(async (_q: string, _a: string, _ac: unknown, _notes: unknown, _cfg: unknown, _single: unknown, _qas: unknown, _qt: unknown, _ql: unknown, _sys: unknown, _demo: unknown, _trace: unknown, streamHandler?: (update: { text: string; done?: boolean }) => void) => {
        streamHandler?.({ text: "token-2", done: true });
        return createEvaluation("question-2", 92);
      });

    const result = await it_runEvaluationStage({
      deps: {
        onStream: (event: unknown) => streamEvents.push(event as Record<string, unknown>),
        onEvalStream: (event: unknown) => evalStreamEvents.push(event as Record<string, unknown>),
        onPartial: (event: unknown) => partialEvents.push(event as Record<string, unknown>),
        onCorpusTrace: undefined,
      } as any,
      request: createRequest(),
      questionText: "question-1\nquestion-2",
      topicTitle: "topic-title",
      questionList: ["question-1", "question-2"],
      questionAnswers: [
        { question: "question-1", answer: "answer-1" },
        { question: "question-2", answer: "answer-2" },
      ],
      questionTimings: [] as any,
      audioSegments: [] as any,
      notes: [{ source: "note.md", text: "note-text" }] as any,
      notesByQuestion: [[{ source: "q1.md", text: "q1-note" }], [{ source: "q2.md", text: "q2-note" }]] as any,
      evaluationConfig: { provider: "template", model: "mock-model", timeoutSec: 30 } as any,
      evalLabel: "topic-eval",
      evalModeLabel: "stream-on",
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
      ensureNotAborted: () => undefined,
      traceFlow: (action, status, detail, level) => {
        traceEvents.push({ action, status, detail, level });
      },
    });

    expect(mocks.evaluateAnswer).toHaveBeenCalledTimes(2);
    expect(progressEvents[0]).toMatchObject({
      step: "evaluation",
      progress: 15,
      status: "running",
    });
    expect(String(progressEvents[0]?.message || "")).toContain("Evaluation 15% - generating");
    expect(partialEvents.length).toBeGreaterThanOrEqual(3);
    expect(streamEvents).toHaveLength(2);
    expect(evalStreamEvents).toHaveLength(2);
    expect(evalStreamEvents[0]).toMatchObject({ questionIndex: 0, text: "token-1" });
    expect(evalStreamEvents[1]).toMatchObject({ questionIndex: 1, text: "token-2" });
    expect(traceEvents.some((event) => event.action === "evaluation_stage" && event.status === "start")).toBe(
      true,
    );
    expect(traceEvents.some((event) => event.action === "evaluation_stage" && event.status === "success")).toBe(
      true,
    );
    expect(result.overallScore).toBe(92);
  });

  it("falls back to empty answers and shared notes when answer/note arrays are mismatched", async () => {
    mocks.evaluateAnswer.mockImplementation(async (question: string) => createEvaluation(question, 80));

    await it_runEvaluationStage({
      deps: {
        onPartial: undefined,
        onCorpusTrace: undefined,
      } as any,
      request: createRequest(),
      questionText: "question-1\nquestion-2",
      topicTitle: "topic-title",
      questionList: ["question-1", "question-2"],
      questionAnswers: [{ question: "question-1", answer: "only-one-answer" }],
      questionTimings: [] as any,
      audioSegments: [] as any,
      notes: [{ source: "shared.md", text: "shared-note" }] as any,
      notesByQuestion: [],
      evaluationConfig: { provider: "template", model: "mock-model", timeoutSec: 30 } as any,
      evalLabel: "topic-eval",
      evalModeLabel: "fallback-inputs",
      reportProgress: () => undefined,
      ensureNotAborted: () => undefined,
      traceFlow: () => undefined,
    });

    const firstCallArgs = mocks.evaluateAnswer.mock.calls[0];
    const secondCallArgs = mocks.evaluateAnswer.mock.calls[1];
    expect(firstCallArgs[1]).toBe("");
    expect(secondCallArgs[1]).toBe("");
    expect(firstCallArgs[3]).toEqual([{ source: "shared.md", text: "shared-note" }]);
    expect(secondCallArgs[3]).toEqual([{ source: "shared.md", text: "shared-note" }]);
  });

  it("emits error trace and rethrows when evaluation fails", async () => {
    const traceEvents: Array<Record<string, unknown>> = [];
    mocks.evaluateAnswer.mockRejectedValueOnce(new Error("evaluation-failed"));

    await expect(
      it_runEvaluationStage({
        deps: {
          onPartial: undefined,
          onCorpusTrace: undefined,
        } as any,
        request: createRequest(),
        questionText: "question-1",
        topicTitle: "topic-title",
        questionList: ["question-1"],
        questionAnswers: [{ question: "question-1", answer: "answer-1" }],
        questionTimings: [] as any,
        audioSegments: [] as any,
        notes: [] as any,
        notesByQuestion: [[]] as any,
        evaluationConfig: { provider: "template", model: "mock-model", timeoutSec: 30 } as any,
        evalLabel: "topic-eval",
        evalModeLabel: "error-path",
        reportProgress: () => undefined,
        ensureNotAborted: () => undefined,
        traceFlow: (action, status, detail, level) => {
          traceEvents.push({ action, status, detail, level });
        },
      }),
    ).rejects.toThrow("evaluation-failed");

    const errorTrace = traceEvents.find(
      (event) => event.action === "evaluation_stage" && event.status === "error",
    );
    expect(errorTrace).toBeTruthy();
    expect((errorTrace?.detail as any)?.errorCode).toBe("evaluation_stage_failed");
    expect((errorTrace?.detail as any)?.error).toBe("evaluation-failed");
  });
});
