import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItAnalyzeRequest } from "../../../../protocol/interviewTrainer";

const mocks = vi.hoisted(() => ({
  evaluateAnswer: vi.fn(),
  resolveBindingTemplate: vi.fn(),
  nextAttemptIndexAsync: vi.fn(),
  reportPathForTopicAsync: vi.fn(),
  resolveTopicDirAsync: vi.fn(),
  buildCorpusAsync: vi.fn(),
  storeRecordingAsync: vi.fn(),
  buildAcousticForTiming: vi.fn(),
  mergeEvaluations: vi.fn(),
  deriveTopicTitle: vi.fn(),
  generateTopicTitleWithLlm: vi.fn(),
  persistAnalysis: vi.fn(),
  buildTemplateLlmConfig: vi.fn(),
  buildTemplateRuntime: vi.fn(),
  splitFallbackQuestions: vi.fn(),
  runAudioStage: vi.fn(),
  prepareQuestionParseStage: vi.fn(),
  runSegmentStage: vi.fn(),
  runRetrievalStage: vi.fn(),
}));

vi.mock("../../services/it_evaluation", () => ({
  it_evaluateAnswer: mocks.evaluateAnswer,
}));

vi.mock("../../services/it_templateGateway", () => ({
  it_resolveBindingTemplate: mocks.resolveBindingTemplate,
}));

vi.mock("../../services/it_storageGateway", () => ({
  it_nextAttemptIndexAsync: mocks.nextAttemptIndexAsync,
  it_reportPathForTopicAsync: mocks.reportPathForTopicAsync,
  it_resolveTopicDirAsync: mocks.resolveTopicDirAsync,
}));

vi.mock("../../services/it_notesGateway", () => ({
  it_buildCorpusAsync: mocks.buildCorpusAsync,
}));

vi.mock("../../services/it_recordingGateway", () => ({
  it_storeRecordingAsync: mocks.storeRecordingAsync,
}));

vi.mock("../../../domain/analyze/evaluation", () => ({
  it_buildAcousticForTiming: mocks.buildAcousticForTiming,
  it_mergeEvaluations: mocks.mergeEvaluations,
}));

vi.mock("../../../domain/analyze/result", () => ({
  it_deriveTopicTitle: mocks.deriveTopicTitle,
}));

vi.mock("../../services/it_topicTitle", () => ({
  it_generateTopicTitleWithLlm: mocks.generateTopicTitleWithLlm,
}));

vi.mock("../../services/it_analysisPersistence", () => ({
  it_persistAnalysis: mocks.persistAnalysis,
}));

vi.mock("./flow_helpers", () => ({
  it_buildTemplateLlmConfig: mocks.buildTemplateLlmConfig,
  it_buildTemplateRuntime: mocks.buildTemplateRuntime,
  it_splitFallbackQuestions: mocks.splitFallbackQuestions,
}));

vi.mock("./flow_audioStage", () => ({
  it_runAudioStage: mocks.runAudioStage,
}));

vi.mock("./flow_questionStage", () => ({
  it_prepareQuestionParseStage: mocks.prepareQuestionParseStage,
}));

vi.mock("./flow_segmentStage", () => ({
  it_runSegmentStage: mocks.runSegmentStage,
}));

vi.mock("./flow_retrievalStage", () => ({
  it_runRetrievalStage: mocks.runRetrievalStage,
}));

import { it_runAnalysis } from "./flow";

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

function createRequest(): ItAnalyzeRequest {
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
    runId: "fault-matrix-run",
  };
}

function createDeps(overrides: Record<string, unknown> = {}) {
  const progressEvents: Array<Record<string, unknown>> = [];
  const partialEvents: Array<Record<string, unknown>> = [];
  const streamEvents: Array<Record<string, unknown>> = [];
  const evalStreamEvents: Array<Record<string, unknown>> = [];
  const traceEvents: Array<Record<string, unknown>> = [];
  const abortSignal = { aborted: false };

  const deps: Record<string, unknown> = {
    context: {
      globalStorageUri: {
        fsPath: "/cache",
      },
    },
    apiConfig: {
      active: {
        environment: "prod",
      },
    },
    templatesConfig: {
      version: 1,
      environments: {},
    },
    skillConfig: {
      retrieval: {
        enabled: true,
        mode: "vector",
        vector: {},
      },
      workspace: {
        notes_dir: "inputs/notes",
      },
      topics: {
        title_mode: "llm",
      },
      filenames: {
        allow_unicode: true,
        max_slug_len: 16,
      },
      evaluation: {
        language: "zh-CN",
        dimensions: [],
      },
    },
    workspaceRoot: "/workspace",
    abortSignal,
    onProgress: (update: Record<string, unknown>) => {
      progressEvents.push(update);
    },
    onPartial: (partial: Record<string, unknown>) => {
      partialEvents.push(partial);
    },
    onStream: (update: Record<string, unknown>) => {
      streamEvents.push(update);
    },
    onEvalStream: (update: Record<string, unknown>) => {
      evalStreamEvents.push(update);
    },
    onCorpusTrace: (message: string, detail?: Record<string, unknown>) => {
      traceEvents.push({ message, detail });
    },
    ...overrides,
  };

  return {
    deps,
    progressEvents,
    partialEvents,
    streamEvents,
    evalStreamEvents,
    traceEvents,
    abortSignal,
  };
}

describe("flow fault matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        switch (key) {
          case "asr:transcription":
            return { id: "tpl-asr" };
          case "llm:questionParse":
            return { id: "tpl-question" };
          case "llm:title":
            return { id: "tpl-title" };
          case "llm:evaluation":
            return { id: "tpl-evaluation" };
          case "llm:segment":
            return { id: "tpl-segment" };
          case "embedding:retrieval":
            return { id: "tpl-embedding" };
          default:
            return null;
        }
      },
    );

    mocks.buildTemplateRuntime.mockImplementation((deps: any, template: any) => {
      if (!template) {
        return null;
      }
      return {
        template,
        environment: deps.apiConfig?.active?.environment || "prod",
        context: deps.context,
      };
    });

    mocks.buildTemplateLlmConfig.mockImplementation((runtime: any, overrides?: any) => ({
      provider: "template",
      model: "mock-llm",
      temperature: 0.2,
      topP: 0.8,
      timeoutSec: 30,
      maxRetries: 1,
      useResponses: false,
      apiMode: "chat",
      stream: true,
      template: runtime.template,
      templateEnv: runtime.environment,
      templateContext: runtime.context,
      ...(overrides || {}),
    }));

    mocks.splitFallbackQuestions.mockReturnValue([]);
    mocks.buildCorpusAsync.mockResolvedValue([
      {
        kind: "notes",
        source: "note.md",
        text: "note text",
      },
    ]);

    mocks.runAudioStage.mockResolvedValue({
      transcript: "mock transcript",
      detailedTranscript: "mock detailed transcript",
      acoustic: {
        durationSec: 8,
        speechDurationSec: 7,
        speechRateWpm: 120,
        pauseCount: 1,
        pauseAvgSec: 0.2,
        pauseMaxSec: 0.2,
        rmsDbMean: -12,
        rmsDbStd: 1,
      },
      audioSegments: [],
    });

    mocks.prepareQuestionParseStage.mockImplementation(
      ({ questionText, questionList }: { questionText: string; questionList: string[] }) => ({
        questionState: {
          text: questionText,
          list: questionList,
        },
        parsePromise: null,
      }),
    );

    mocks.runSegmentStage.mockImplementation(
      async ({ questionList }: { questionList: string[] }) => ({
        questionTimings: questionList.map((question, idx) => ({
          question,
          startSec: idx * 3,
          endSec: idx * 3 + 3,
          durationSec: 3,
        })),
        questionAnswers: questionList.map((question, idx) => ({
          question,
          answer: `answer-${idx + 1}`,
        })),
        questionTimingNote: undefined,
        llmTimingAttempted: true,
        llmTimingFailed: false,
      }),
    );

    mocks.runRetrievalStage.mockImplementation(async ({ questionList }: { questionList: string[] }) => ({
      notes: [{ score: 0.8, source: "[notes] note.md", snippet: "hit" }],
      notesByQuestion: questionList.map((question, idx) => [
        {
          score: 0.6 + idx * 0.1,
          source: `[notes] ${question}.md`,
          snippet: `snippet-${idx + 1}`,
        },
      ]),
    }));

    mocks.deriveTopicTitle.mockReturnValue("derived-topic");
    mocks.generateTopicTitleWithLlm.mockResolvedValue("llm-topic");
    mocks.resolveTopicDirAsync.mockResolvedValue("/workspace/sessions/topic");
    mocks.reportPathForTopicAsync.mockResolvedValue("/workspace/sessions/topic/report.md");
    mocks.nextAttemptIndexAsync.mockResolvedValue(2);
    mocks.storeRecordingAsync.mockResolvedValue("/workspace/sessions/topic/audio-2.wav");

    mocks.buildAcousticForTiming.mockReturnValue({
      durationSec: 3,
      speechDurationSec: 2,
      speechRateWpm: 100,
      pauseCount: 0,
      pauseAvgSec: 0,
      pauseMaxSec: 0,
      rmsDbMean: -10,
      rmsDbStd: 1,
    });

    mocks.evaluateAnswer.mockImplementation(async (...args: any[]) => {
      const question = String(args[0]);
      const streamHandler = args[12] as
        | ((update: { text: string; done?: boolean; reset?: boolean }) => void)
        | undefined;
      streamHandler?.({ text: `${question}-chunk`, reset: true });
      streamHandler?.({ text: `${question}-done`, done: true });
      return createEvaluation(question, question.endsWith("2") ? 84 : 88);
    });

    mocks.mergeEvaluations.mockImplementation(
      ({ topicTitle, questions, answers, evaluations, timePlan }: any) => {
        const ready = (evaluations as Array<any>).filter(Boolean);
        const overallScore =
          ready.length > 0
            ? Math.round(
                ready.reduce((sum, item) => sum + Number(item.overallScore || 0), 0) /
                  ready.length,
              )
            : 0;
        return {
          topicTitle,
          topicSummary: `merged-${ready.length}`,
          scores: { clarity: overallScore },
          overallScore,
          strengths: ["strength"],
          issues: ready.length ? ["issue"] : [],
          improvements: ["improvement"],
          nextFocus: ["next"],
          revisedAnswers: (questions as string[]).map((question, idx) => ({
            question,
            original: answers[idx]?.answer || "",
            revised: answers[idx]?.answer || "",
            estimatedTimeMin: timePlan[idx] ?? 3,
          })),
          mode: ready.every((item) => item.mode === "llm") ? "llm" : "heuristic",
        };
      },
    );

    mocks.persistAnalysis.mockResolvedValue(undefined);
  });

  it("completes full flow when retrieval is empty and keeps callback payloads coherent", async () => {
    mocks.runRetrievalStage.mockResolvedValue({
      notes: [],
      notesByQuestion: [[], []],
    });

    const context = createDeps();
    const response = await it_runAnalysis(context.deps as any, createRequest());

    expect(response.notes).toEqual([]);
    expect(response.evaluation.overallScore).toBeGreaterThan(0);
    expect(mocks.evaluateAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.persistAnalysis).toHaveBeenCalledTimes(1);
    expect(context.partialEvents.some((item) => Object.hasOwn(item, "notes"))).toBe(true);
    expect(context.partialEvents.some((item) => Object.hasOwn(item, "evaluation"))).toBe(true);
    expect(context.streamEvents.some((item) => item.step === "evaluation")).toBe(true);
    expect(new Set(context.evalStreamEvents.map((item) => item.questionIndex))).toEqual(
      new Set([0, 1]),
    );
    expect(
      context.progressEvents.some(
        (item) => item.step === "evaluation" && item.status === "success",
      ),
    ).toBe(true);
  });

  it("bubbles persistence failures with explicit error and never returns false success", async () => {
    mocks.persistAnalysis.mockRejectedValue(new Error("persist boom"));

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow(
      "persist boom",
    );
    expect(mocks.persistAnalysis).toHaveBeenCalledTimes(1);
  });

  it("fails fast on pairwise fault (empty retrieval + one evaluation throw) and skips persistence", async () => {
    mocks.runRetrievalStage.mockResolvedValue({
      notes: [],
      notesByQuestion: [[], []],
    });

    mocks.evaluateAnswer.mockImplementation(async (...args: any[]) => {
      const question = String(args[0]);
      if (question === "question-2") {
        throw new Error("evaluation boom");
      }
      return createEvaluation(question, 87);
    });

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow(
      "evaluation boom",
    );
    expect(mocks.evaluateAnswer).toHaveBeenCalledTimes(2);
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("stops before persistence when abort signal flips during evaluation", async () => {
    const context = createDeps();

    mocks.evaluateAnswer.mockImplementation(async (...args: any[]) => {
      context.abortSignal.aborted = true;
      return createEvaluation(String(args[0]), 82);
    });

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("fails fast when progress callback is unstable", async () => {
    const context = createDeps({
      onProgress: () => {
        throw new Error("progress handler boom");
      },
    });

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow(
      "progress handler boom",
    );
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects early when ASR template binding is missing", async () => {
    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        if (key === "asr:transcription") {
          return null;
        }
        if (key === "llm:questionParse") {
          return { id: "tpl-question" };
        }
        if (key === "llm:title") {
          return { id: "tpl-title" };
        }
        if (key === "llm:evaluation") {
          return { id: "tpl-evaluation" };
        }
        if (key === "llm:segment") {
          return { id: "tpl-segment" };
        }
        if (key === "embedding:retrieval") {
          return { id: "tpl-embedding" };
        }
        return null;
      },
    );

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow();
    expect(mocks.runAudioStage).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects early when evaluation template binding is missing", async () => {
    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        if (key === "asr:transcription") {
          return { id: "tpl-asr" };
        }
        if (key === "llm:questionParse") {
          return { id: "tpl-question" };
        }
        if (key === "llm:title") {
          return { id: "tpl-title" };
        }
        if (key === "llm:evaluation") {
          return null;
        }
        if (key === "llm:segment") {
          return { id: "tpl-segment" };
        }
        if (key === "embedding:retrieval") {
          return { id: "tpl-embedding" };
        }
        return null;
      },
    );

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow();
    expect(mocks.runAudioStage).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("rejects multi-question flow when segment template binding is missing", async () => {
    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        if (key === "asr:transcription") {
          return { id: "tpl-asr" };
        }
        if (key === "llm:questionParse") {
          return { id: "tpl-question" };
        }
        if (key === "llm:title") {
          return { id: "tpl-title" };
        }
        if (key === "llm:evaluation") {
          return { id: "tpl-evaluation" };
        }
        if (key === "llm:segment") {
          return null;
        }
        if (key === "embedding:retrieval") {
          return { id: "tpl-embedding" };
        }
        return null;
      },
    );

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow();
    expect(mocks.runAudioStage).toHaveBeenCalledTimes(1);
    expect(mocks.runSegmentStage).not.toHaveBeenCalled();
    expect(mocks.runRetrievalStage).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });


  it("rejects early when embedding template binding is missing for vector retrieval", async () => {
    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        if (key === "asr:transcription") {
          return { id: "tpl-asr" };
        }
        if (key === "llm:questionParse") {
          return { id: "tpl-question" };
        }
        if (key === "llm:title") {
          return { id: "tpl-title" };
        }
        if (key === "llm:evaluation") {
          return { id: "tpl-evaluation" };
        }
        if (key === "llm:segment") {
          return { id: "tpl-segment" };
        }
        if (key === "embedding:retrieval") {
          return null;
        }
        return null;
      },
    );

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow();
    expect(mocks.runAudioStage).not.toHaveBeenCalled();
    expect(mocks.runRetrievalStage).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("allows keyword retrieval mode when embedding template is missing", async () => {
    mocks.resolveBindingTemplate.mockImplementation(
      (_cfg: unknown, _env: string, provider: string, purpose: string) => {
        const key = `${provider}:${purpose}`;
        if (key === "asr:transcription") {
          return { id: "tpl-asr" };
        }
        if (key === "llm:questionParse") {
          return { id: "tpl-question" };
        }
        if (key === "llm:title") {
          return { id: "tpl-title" };
        }
        if (key === "llm:evaluation") {
          return { id: "tpl-evaluation" };
        }
        if (key === "llm:segment") {
          return { id: "tpl-segment" };
        }
        if (key === "embedding:retrieval") {
          return null;
        }
        return null;
      },
    );

    const context = createDeps();
    (context.deps as any).skillConfig.retrieval.mode = "keyword";

    await expect(it_runAnalysis(context.deps as any, createRequest())).resolves.toBeDefined();
    expect(mocks.runAudioStage).toHaveBeenCalledTimes(1);
    expect(mocks.runRetrievalStage).toHaveBeenCalledTimes(1);
    expect(mocks.evaluateAnswer).toHaveBeenCalledTimes(2);
  });

  it("fails fast when retrieval stage throws and skips evaluation/persistence", async () => {
    mocks.runRetrievalStage.mockRejectedValue(new Error("retrieval stage boom"));

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow(
      "retrieval stage boom",
    );
    expect(mocks.evaluateAnswer).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

  it("fails fast when question parse preparation throws and skips audio stage", async () => {
    mocks.prepareQuestionParseStage.mockImplementation(() => {
      throw new Error("question stage boom");
    });

    const context = createDeps();

    await expect(it_runAnalysis(context.deps as any, createRequest())).rejects.toThrow(
      "question stage boom",
    );
    expect(mocks.runAudioStage).not.toHaveBeenCalled();
    expect(mocks.persistAnalysis).not.toHaveBeenCalled();
  });

});
