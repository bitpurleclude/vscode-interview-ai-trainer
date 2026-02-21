import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  splitAnswersWithLlm: vi.fn(),
  assignSegmentsWithLlm: vi.fn(),
  alignAnswerToSegments: vi.fn(),
}));

vi.mock("../../services/it_questionsLlm", () => ({
  it_splitAnswersWithLlm: mocks.splitAnswersWithLlm,
  it_assignSegmentsWithLlm: mocks.assignSegmentsWithLlm,
}));

vi.mock("../../../domain/analyze/questionsSegments", () => ({
  it_alignAnswerToSegments: mocks.alignAnswerToSegments,
}));

import { it_runSegmentStage } from "./flow_segmentStage";

describe("flow_segmentStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses aligned split answers when all alignments succeed", async () => {
    const partialEvents: Array<Record<string, unknown>> = [];
    const progressEvents: Array<Record<string, unknown>> = [];
    const answers = [
      { question: "q1", answer: "a1" },
      { question: "q2", answer: "a2" },
    ];
    mocks.splitAnswersWithLlm.mockResolvedValueOnce(answers);
    mocks.alignAnswerToSegments
      .mockReturnValueOnce({ startSec: 0, endSec: 1.2 })
      .mockReturnValueOnce({ startSec: 1.3, endSec: 2.6 });

    const result = await it_runSegmentStage({
      deps: {
        onPartial: (event) => partialEvents.push(event as Record<string, unknown>),
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      segmentLlmConfig: { provider: "template", model: "mock" } as any,
      questionList: ["q1", "q2"],
      transcript: "long transcript",
      audioSegments: [{ text: "seg", startSec: 0, endSec: 2.6 }] as any,
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    expect(mocks.assignSegmentsWithLlm).not.toHaveBeenCalled();
    expect(result.questionTimings).toHaveLength(2);
    expect(result.questionAnswers).toEqual(answers);
    expect(result.llmTimingAttempted).toBe(true);
    expect(result.llmTimingFailed).toBe(false);
    expect(partialEvents.at(-1)).toMatchObject({
      questionTimings: expect.any(Array),
      questionTimingNote: undefined,
    });
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "segment", progress: 25, status: "running" }),
        expect.objectContaining({ step: "segment", progress: 45, status: "running" }),
      ]),
    );
  });

  it("falls back to remote assignment when local alignment is partially missing", async () => {
    const answers = [
      { question: "q1", answer: "a1" },
      { question: "q2", answer: "a2" },
    ];
    mocks.splitAnswersWithLlm.mockResolvedValueOnce(answers);
    mocks.alignAnswerToSegments
      .mockReturnValueOnce(null)
      .mockReturnValueOnce({ startSec: 2, endSec: 4 });
    mocks.assignSegmentsWithLlm.mockResolvedValueOnce({
      timings: [
        {
          question: "q1",
          startSec: 0,
          endSec: 2,
          durationSec: 2,
          note: "LLM fallback",
        },
        {
          question: "q2",
          startSec: 2,
          endSec: 4,
          durationSec: 2,
          note: "LLM fallback",
        },
      ],
      answers,
    });

    const result = await it_runSegmentStage({
      deps: {
        onPartial: undefined,
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      segmentLlmConfig: { provider: "template", model: "mock" } as any,
      questionList: ["q1", "q2"],
      transcript: "long transcript",
      audioSegments: [{ text: "seg", startSec: 0, endSec: 4 }] as any,
      reportProgress: () => undefined,
    });

    expect(mocks.assignSegmentsWithLlm).toHaveBeenCalledTimes(1);
    expect(result.questionTimings).toHaveLength(2);
    expect(result.llmTimingFailed).toBe(false);
    expect(result.questionTimingNote).toBeUndefined();
  });

  it("marks failure and returns note/default answers when split+assign both fail", async () => {
    const partialEvents: Array<Record<string, unknown>> = [];
    const progressEvents: Array<Record<string, unknown>> = [];
    mocks.splitAnswersWithLlm.mockResolvedValueOnce(null);
    mocks.assignSegmentsWithLlm.mockResolvedValueOnce(null);

    const result = await it_runSegmentStage({
      deps: {
        onPartial: (event) => partialEvents.push(event as Record<string, unknown>),
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      segmentLlmConfig: { provider: "template", model: "mock" } as any,
      questionList: ["q1", "q2"],
      transcript: "long transcript",
      audioSegments: [{ text: "seg", startSec: 0, endSec: 4 }] as any,
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    expect(result.llmTimingAttempted).toBe(true);
    expect(result.llmTimingFailed).toBe(true);
    expect(result.questionTimings).toEqual([]);
    expect(result.questionTimingNote).toBe("无法计算（LLM分段失败）");
    expect(result.questionAnswers).toEqual([
      { question: "q1", answer: "" },
      { question: "q2", answer: "" },
    ]);
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ step: "segment", progress: 80, status: "running" }),
      ]),
    );
    expect(partialEvents.at(-1)).toMatchObject({
      questionTimingNote: "无法计算（LLM分段失败）",
    });
  });

  it("returns immediate error state when audio segments are missing", async () => {
    const progressEvents: Array<Record<string, unknown>> = [];

    const result = await it_runSegmentStage({
      deps: {
        onPartial: undefined,
        onStream: undefined,
        onCorpusTrace: undefined,
      } as any,
      segmentLlmConfig: { provider: "template", model: "mock" } as any,
      questionList: ["q1", "q2"],
      transcript: "long transcript",
      audioSegments: undefined,
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    expect(result.llmTimingAttempted).toBe(true);
    expect(result.llmTimingFailed).toBe(true);
    expect(result.questionTimingNote).toBe("无法计算（LLM分段失败）");
    expect(result.questionAnswers).toEqual([
      { question: "q1", answer: "" },
      { question: "q2", answer: "" },
    ]);
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "segment",
          progress: 100,
          status: "error",
        }),
      ]),
    );
  });
});
