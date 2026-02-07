import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItState,
  ItStepState,
} from "../../../protocol/interviewTrainer";
import { IT_ANALYSIS_CANCELED_MESSAGE } from "../services/it_analysisErrors";

const mocks = vi.hoisted(() => ({
  runAnalysis: vi.fn(),
}));

vi.mock("../flows/analyze/flow", () => ({
  it_runAnalysis: mocks.runAnalysis,
}));

import { it_handleAnalyze } from "./it_analysisFlow";

function createSteps(): ItStepState[] {
  return [
    { id: "recording", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "segment", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ];
}

function createResponse(): ItAnalyzeResponse {
  return {
    transcript: "final transcript",
    detailedTranscript: "detailed transcript",
    acoustic: {
      durationSec: 12,
      speechDurationSec: 10,
      speechRateWpm: 120,
      pauseCount: 1,
      pauseAvgSec: 0.2,
      pauseMaxSec: 0.2,
      rmsDbMean: -12,
      rmsDbStd: 1,
    },
    evaluation: {
      topicTitle: "topic",
      topicSummary: "summary",
      scores: { clarity: 85 },
      overallScore: 85,
      strengths: ["s1"],
      issues: ["i1"],
      improvements: ["m1"],
      nextFocus: ["n1"],
      revisedAnswers: [
        {
          question: "q1",
          original: "o1",
          revised: "r1",
          estimatedTimeMin: 3,
        },
      ],
      mode: "llm",
    },
    notes: [
      {
        score: 0.9,
        source: "[notes] source.md",
        snippet: "hit",
      },
    ],
    audioSegments: [],
    questionTimings: [],
    questionText: "q1",
    questionList: ["q1"],
    reportPath: "/workspace/sessions/topic/report.md",
    topicDir: "/workspace/sessions/topic",
    audioPath: "/workspace/sessions/topic/audio-1.wav",
  };
}

function createRequest(): ItAnalyzeRequest {
  return {
    audio: {
      format: "wav",
      sampleRate: 16000,
      byteLength: 16,
      durationSec: 1,
      base64: "AQIDBAUGBwg=",
    },
    questionText: "q1",
    questionList: ["q1"],
    runId: "analysis-run-1",
  };
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(current, "testdata"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }
  throw new Error("unable to locate repository root");
}

function resolveFixtureFiles(fixtureDir: string): {
  markdownPath: string;
  audioPath: string;
} {
  const entries = fs.readdirSync(fixtureDir, { withFileTypes: true });
  const markdownFile = entries.find(
    (entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"),
  );
  const audioFile = entries.find(
    (entry) => entry.isFile() && /\.(m4a|wav|mp3|aac)$/i.test(entry.name),
  );
  if (!markdownFile || !audioFile) {
    throw new Error(`fixture files missing in ${fixtureDir}`);
  }
  return {
    markdownPath: path.join(fixtureDir, markdownFile.name),
    audioPath: path.join(fixtureDir, audioFile.name),
  };
}

function buildFixtureRequest(): ItAnalyzeRequest {
  const repoRoot = findRepoRoot(__dirname);
  const { markdownPath, audioPath } = resolveFixtureFiles(path.join(repoRoot, "testdata"));

  const markdownText = fs.readFileSync(markdownPath, "utf-8").trim();
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const audioBuffer = fs.readFileSync(audioPath);
  const cappedAudio = audioBuffer.subarray(0, Math.min(audioBuffer.length, 256 * 1024));
  const questionText = lines[0] || "fixture question";
  const questionList = lines.filter((line) => line.length >= 8).slice(0, 3);

  return {
    audio: {
      format: "m4a",
      sampleRate: 16000,
      byteLength: cappedAudio.byteLength,
      durationSec: Math.max(1, Math.round(cappedAudio.byteLength / 16000)),
      base64: cappedAudio.toString("base64"),
    },
    questionText,
    questionList: questionList.length ? questionList : [questionText],
    runId: "analysis-fixture-run",
  };
}

function createHost() {
  const state: ItState = {
    statusMessage: "idle",
    overallProgress: 0,
    recordingState: "idle",
    steps: createSteps(),
  };

  const host: any = {
    state,
    context: { globalStorageUri: { fsPath: "/cache" } },
    configBundle: {
      api: {
        version: 1,
        active: { environment: "prod" },
        environments: { prod: {} },
      },
      templates: { version: 1, environments: {} },
      skill: { asr: {}, retrieval: {} },
      providers: {},
      guardrails: {},
    },
    configService: {
      loadBundle: vi.fn(function () {
        return host.configBundle;
      }),
      ensureTemplatesConfig: vi.fn(async (bundle: any) => bundle),
    },
    resolveApiConfigWithProviders: vi.fn((api: any) => api),
    requireWorkspaceRoot: vi.fn(() => "/workspace"),
    updateProgress: vi.fn(),
    emitStreamUpdate: vi.fn(),
    emitEvaluationStreamUpdate: vi.fn(),
    logCorpusTrace: vi.fn(),
    scheduleEmbeddingWarmup: vi.fn(),
    buildRunSteps: vi.fn(() => createSteps()),
    computeOverallProgress: vi.fn((steps: ItStepState[]) => {
      if (!steps.length) {
        return 0;
      }
      const total = steps.reduce((sum, step) => sum + step.progress, 0);
      return Math.round(total / steps.length);
    }),
    updateState: vi.fn((next: Partial<ItState>) => {
      host.state = {
        ...host.state,
        ...next,
      };
    }),
    analysisAbort: null,
    embeddingWarmupAbort: null,
    corpusDirty: true,
    corpusDirtyFiles: new Set(["dirty-note.md"]),
  };

  return host;
}

describe("it_handleAnalyze integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("completes full use-case flow and marks corpus clean on success", async () => {
    const host = createHost();
    const request = createRequest();
    const response = createResponse();

    mocks.runAnalysis.mockImplementation(async (deps: any, req: ItAnalyzeRequest) => {
      deps.onPartial?.({ transcript: "draft transcript" });
      expect(req).toEqual(request);
      expect(deps.abortSignal).toEqual({ aborted: false });
      return response;
    });

    await expect(it_handleAnalyze(host, request)).resolves.toEqual(response);

    expect(host.state.draftTranscript).toBe("draft transcript");
    expect(host.state.lastError).toBeUndefined();
    expect(host.corpusDirty).toBe(false);
    expect(Array.from(host.corpusDirtyFiles)).toEqual([]);
    expect(host.analysisAbort).toBeNull();
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("after-analysis", 3000);

    const asrStep = host.state.steps.find((step: ItStepState) => step.id === "asr");
    const writeStep = host.state.steps.find((step: ItStepState) => step.id === "write");
    expect(asrStep).toMatchObject({ status: "success", progress: 100 });
    expect(writeStep).toMatchObject({ status: "success", progress: 100 });
  });

  it("accepts fixture-driven request payloads and keeps lifecycle stable", async () => {
    const host = createHost();
    const request = buildFixtureRequest();
    const response = createResponse();

    mocks.runAnalysis.mockImplementation(async (deps: any, req: ItAnalyzeRequest) => {
      expect(req.runId).toBe("analysis-fixture-run");
      expect(req.audio.base64.length).toBeGreaterThan(1024);
      expect(req.audio.byteLength).toBeGreaterThan(1024);
      expect(req.questionText?.length || 0).toBeGreaterThan(0);
      expect(req.questionList?.length || 0).toBeGreaterThan(0);

      deps.onPartial?.({ transcript: "fixture partial transcript" });
      return {
        ...response,
        questionText: req.questionText || response.questionText,
        questionList: req.questionList || response.questionList,
      };
    });

    const result = await it_handleAnalyze(host, request);

    expect(result.questionText).toBe(request.questionText);
    expect(result.questionList).toEqual(request.questionList);
    expect(host.state.draftTranscript).toBe("fixture partial transcript");
    expect(host.state.lastError).toBeUndefined();
    expect(host.corpusDirty).toBe(false);
    expect(host.analysisAbort).toBeNull();
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("after-analysis", 3000);
  });

  it("handles canceled analysis without writing user error", async () => {
    const host = createHost();
    const request = createRequest();

    mocks.runAnalysis.mockRejectedValue(new Error(IT_ANALYSIS_CANCELED_MESSAGE));

    await expect(it_handleAnalyze(host, request)).rejects.toThrow(IT_ANALYSIS_CANCELED_MESSAGE);

    expect(host.state.lastError).toBeUndefined();
    expect(host.state.overallProgress).toBe(0);
    expect(host.corpusDirty).toBe(true);
    expect(Array.from(host.corpusDirtyFiles)).toEqual(["dirty-note.md"]);
    expect(host.analysisAbort).toBeNull();
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("after-analysis", 3000);

    const asrStep = host.state.steps.find((step: ItStepState) => step.id === "asr");
    expect(asrStep).toMatchObject({ status: "error" });
  });

  it("maps unexpected analysis failure to user-facing error and preserves dirty corpus", async () => {
    const host = createHost();
    const request = createRequest();

    mocks.runAnalysis.mockRejectedValue(new Error("boom failure"));

    await expect(it_handleAnalyze(host, request)).rejects.toThrow("boom failure");

    expect(host.state.lastError).toMatchObject({
      type: "analysis",
      reason: "boom failure",
    });
    expect(host.state.overallProgress).toBe(0);
    expect(host.corpusDirty).toBe(true);
    expect(Array.from(host.corpusDirtyFiles)).toEqual(["dirty-note.md"]);
    expect(host.analysisAbort).toBeNull();
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("after-analysis", 3000);
  });
});
