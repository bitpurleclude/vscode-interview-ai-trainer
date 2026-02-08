import fs from "fs";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItState,
  ItStepState,
} from "../../../protocol/interviewTrainer";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
  runAnalysis: vi.fn(),
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: mocks.executeCommand,
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

vi.mock("../../application/flows/analyze/flow", () => ({
  it_runAnalysis: mocks.runAnalysis,
}));

import { it_handleAnalyze } from "../../application/useCases/it_analysisFlow";
import { WebviewProtocol } from "../../../webview/WebviewProtocol";
import { it_registerResultHandlers } from "./it_webviewResultHandlers";

class FakeWebview {
  private listener: ((msg: any) => Promise<void> | void) | null = null;
  public posted: any[] = [];

  onDidReceiveMessage(listener: (msg: any) => Promise<void> | void) {
    this.listener = listener;
    return { dispose: vi.fn() };
  }

  async emit(msg: any): Promise<void> {
    if (!this.listener) {
      throw new Error("listener not registered");
    }
    await this.listener(msg);
  }

  postMessage(message: any): Promise<boolean> {
    this.posted.push(message);
    return Promise.resolve(true);
  }
}

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

function createResponse(request: ItAnalyzeRequest): ItAnalyzeResponse {
  return {
    transcript: "fixture transcript",
    detailedTranscript: "fixture detailed transcript",
    acoustic: {
      durationSec: 12,
      speechDurationSec: 9,
      speechRateWpm: 110,
      pauseCount: 1,
      pauseAvgSec: 0.3,
      pauseMaxSec: 0.4,
      rmsDbMean: -13,
      rmsDbStd: 1.1,
    },
    evaluation: {
      topicTitle: "fixture topic",
      topicSummary: "fixture summary",
      scores: { content: 88 },
      overallScore: 88,
      strengths: ["good structure"],
      issues: ["need more detail"],
      improvements: ["add examples"],
      nextFocus: ["timing"],
      revisedAnswers: [],
      mode: "llm",
    },
    notes: [],
    audioSegments: [],
    questionTimings: [],
    questionText: request.questionText || "fixture question",
    questionList: request.questionList || [request.questionText || "fixture question"],
    reportPath: "/workspace/sessions/fixture/report.md",
    topicDir: "/workspace/sessions/fixture",
    audioPath: "/workspace/sessions/fixture/audio.m4a",
  };
}

function findRepoRoot(startDir: string): string {
  let current = startDir;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(current, "testdata"))) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent == current) {
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
    runId: "handler-fixture-run",
  };
}

function createHost(webviewProtocol: WebviewProtocol) {
  const state: ItState = {
    statusMessage: "idle",
    overallProgress: 0,
    recordingState: "idle",
    steps: createSteps(),
  };

  const host: any = {
    webviewProtocol,
    state,
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
    context: { globalStorageUri: { fsPath: "/cache" } },
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

  host.handleAnalyze = async (request: ItAnalyzeRequest) => {
    return await it_handleAnalyze(host, request);
  };

  return host;
}

describe("it_webviewResultHandlers integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles fixture analyze request via protocol roundtrip", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    protocol.webview = webview as any;
    const host = createHost(protocol);
    const request = buildFixtureRequest();

    mocks.runAnalysis.mockImplementation(async (deps: any, req: ItAnalyzeRequest) => {
      expect(req.runId).toBe("handler-fixture-run");
      expect(req.audio.base64.length).toBeGreaterThan(1024);
      expect(req.questionText?.length || 0).toBeGreaterThan(0);
      deps.onPartial?.({ transcript: "handler partial transcript" });
      return createResponse(req);
    });

    it_registerResultHandlers(host);

    await webview.emit({
      messageType: "it/analyzeAudio",
      messageId: "req-1",
      data: request,
    });

    expect(webview.posted).toHaveLength(1);
    expect(webview.posted[0]).toMatchObject({
      messageType: "it/analyzeAudio",
      messageId: "req-1",
      data: {
        status: "success",
      },
    });

    const content = webview.posted[0].data.content as ItAnalyzeResponse;
    expect(content.evaluation.overallScore).toBe(88);
    expect(content.questionText).toBe(request.questionText);
    expect(content.questionList).toEqual(request.questionList);
    expect(host.state.draftTranscript).toBe("handler partial transcript");
    expect(host.state.lastError).toBeUndefined();
    expect(host.corpusDirty).toBe(false);

    const asrStep = host.state.steps.find((step: ItStepState) => step.id === "asr");
    const writeStep = host.state.steps.find((step: ItStepState) => step.id === "write");
    expect(asrStep).toMatchObject({ status: "success" });
    expect(writeStep).toMatchObject({ status: "success" });
  });

  it("rejects malformed analyze payload through protocol error response", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    protocol.webview = webview as any;
    const host = createHost(protocol);

    it_registerResultHandlers(host);

    await webview.emit({
      messageType: "it/analyzeAudio",
      messageId: "bad-1",
      data: {
        questionText: "no audio field",
      },
    });

    expect(webview.posted).toHaveLength(1);
    expect(webview.posted[0]).toMatchObject({
      messageType: "it/analyzeAudio",
      messageId: "bad-1",
      data: {
        status: "error",
      },
    });
    expect(String(webview.posted[0].data.error || "")).toMatch(/invalid analyze request payload/i);
    expect(mocks.runAnalysis).not.toHaveBeenCalled();
  });
});
