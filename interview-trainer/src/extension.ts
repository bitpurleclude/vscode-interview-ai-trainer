import fs from "fs";
import path from "path";
import * as vscode from "vscode";

import type { ItAnalyzeRequest } from "./protocol/interviewTrainer";
import { InterviewTrainerExtension } from "./interviewTrainer/InterviewTrainerExtension";
import { it_ensureConfigFiles, it_getUserConfigDir } from "./interviewTrainer/infra/api/it_apiConfig";
import { InterviewTrainerWebviewViewProvider } from "./webview/InterviewTrainerWebviewViewProvider";

const IT_E2E_FIXTURE_AUDIO_MAX_BYTES = 256 * 1024;
const IT_E2E_FIXTURE_ANALYZE_COMMAND = "itInterviewTrainer.__test.runFixtureAnalyze";
const IT_E2E_WEBVIEW_UI_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewUiClickFlow";
const IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewAnalyzeFlow";
const IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewCancelFlow";
const IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewSaveResultFlow";
const IT_E2E_WEBVIEW_UI_REQUEST = "it/test/webviewUiAutomationRequest";
const IT_E2E_WEBVIEW_UI_ACK = "it/test/webviewUiAutomationAck";
const IT_E2E_WEBVIEW_UI_READY = "it/test/webviewUiAutomationReady";
const IT_E2E_WEBVIEW_ANALYZE_REQUEST = "it/test/webviewAnalyzeFlowRequest";
const IT_E2E_WEBVIEW_ANALYZE_ACK = "it/test/webviewAnalyzeFlowAck";
const IT_E2E_WEBVIEW_UI_TIMEOUT_MS = 20_000;
const IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS = 90_000;

type ItE2EUiAutomationResult = {
  runId: string;
  status: "success" | "error";
  activePage?: "practice" | "settings" | "unknown";
  steps?: Array<{ action: string; ok: boolean; detail?: string }>;
  overallScoreText?: string;
  error?: string;
};

type ItE2EUiPending = {
  resolve: (result: ItE2EUiAutomationResult) => void;
  timeout: NodeJS.Timeout;
};

type ItE2EAnalyzeScenario = "analyze" | "cancel" | "save";

function it_findFixtureFile(
  fixtureDir: string,
  matcher: (name: string) => boolean,
  label: string,
): string {
  const entries = fs.readdirSync(fixtureDir, { withFileTypes: true });
  const found = entries.find((entry) => entry.isFile() && matcher(entry.name));
  if (!found) {
    throw new Error(`Missing ${label} fixture in ${fixtureDir}`);
  }
  return path.join(fixtureDir, found.name);
}

function it_cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function it_applyE2ETestConfigBundle(
  trainer: InterviewTrainerExtension,
  mockText: string,
): () => void {
  const originalBundle = trainer.configService.loadBundle();
  const testBundle = it_cloneJson(originalBundle);
  const env = String(testBundle.api?.active?.environment || "prod");
  const envConfig = {
    ...(testBundle.api?.environments?.[env] || {}),
    llm: {
      ...((testBundle.api?.environments?.[env] || {}).llm || {}),
      api_key: "",
      apiKey: "",
    },
  };

  testBundle.api = {
    ...testBundle.api,
    active: {
      ...(testBundle.api?.active || {}),
      environment: env,
    },
    environments: {
      ...(testBundle.api?.environments || {}),
      [env]: envConfig,
    },
  };
  testBundle.skill = {
    ...(testBundle.skill || {}),
    asr: {
      ...((testBundle.skill || {}).asr || {}),
      provider: "mock",
      mock_text: mockText,
      timeout_sec: 10,
      max_retries: 0,
    },
    retrieval: {
      ...((testBundle.skill || {}).retrieval || {}),
      enabled: false,
    },
  };

  trainer.configBundle = testBundle;
  const originalLoadBundle = trainer.configService.loadBundle.bind(trainer.configService);
  trainer.configService.loadBundle = () => it_cloneJson(testBundle);

  return () => {
    trainer.configService.loadBundle = originalLoadBundle;
    trainer.configBundle = originalBundle;
  };
}

function it_buildSmokeWavBase64(durationSec = 1, sampleRate = 16_000): string {
  const totalSamples = Math.max(1, Math.round(durationSec * sampleRate));
  const dataSize = totalSamples * 2;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * 220 * t) * 0.15;
    buffer.writeInt16LE(Math.round(sample * 32767), 44 + i * 2);
  }

  return buffer.toString("base64");
}

function it_buildFixtureWebviewAnalyzePayload(workspaceRoot: string): {
  questionText: string;
  questionList: string[];
  audio: {
    base64: string;
    filename: string;
    mimeType: string;
  };
} {
  const fixtureDir = path.join(workspaceRoot, "testdata");
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }

  const markdownPath = it_findFixtureFile(
    fixtureDir,
    (name) => name.toLowerCase().endsWith(".md"),
    "markdown",
  );
  it_findFixtureFile(
    fixtureDir,
    (name) => /\.(m4a|wav|mp3|aac)$/i.test(name),
    "audio",
  );

  const markdownText = fs.readFileSync(markdownPath, "utf-8").trim();
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const questionText = lines[0] || "fixture question";
  const questionList = lines.filter((line) => line.length >= 8).slice(0, 3);

  return {
    questionText,
    questionList: questionList.length ? questionList : [questionText],
    audio: {
      base64: it_buildSmokeWavBase64(1, 16_000),
      filename: "fixture-smoke.wav",
      mimeType: "audio/wav",
    },
  };
}

function it_buildFixtureAnalyzeRequest(workspaceRoot: string): ItAnalyzeRequest {
  const fixtureDir = path.join(workspaceRoot, "testdata");
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }

  const markdownPath = it_findFixtureFile(
    fixtureDir,
    (name) => name.toLowerCase().endsWith(".md"),
    "markdown",
  );
  const audioPath = it_findFixtureFile(
    fixtureDir,
    (name) => /\.(m4a|wav|mp3|aac)$/i.test(name),
    "audio",
  );

  const markdownText = fs.readFileSync(markdownPath, "utf-8").trim();
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const audioRaw = fs.readFileSync(audioPath);
  const audioBuffer = audioRaw.subarray(0, Math.min(audioRaw.length, IT_E2E_FIXTURE_AUDIO_MAX_BYTES));
  const audioExt = path.extname(audioPath).toLowerCase();
  const audioFormat = audioExt === ".wav" ? "wav" : "m4a";

  const questionText = lines[0] || "fixture question";
  const questionList = lines.filter((line) => line.length >= 8).slice(0, 3);

  return {
    audio: {
      format: audioFormat,
      sampleRate: 16000,
      byteLength: audioBuffer.byteLength,
      durationSec: Math.max(1, Math.round(audioBuffer.byteLength / 16000)),
      base64: audioBuffer.toString("base64"),
    },
    questionText,
    questionList: questionList.length ? questionList : [questionText],
    runId: `e2e-fixture-${Date.now()}`,
  };
}

export function activate(context: vscode.ExtensionContext) {
  const viewProvider = new InterviewTrainerWebviewViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InterviewTrainerWebviewViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: false } },
    ),
  );

  const trainer = new InterviewTrainerExtension(context, viewProvider.webviewProtocol);
  context.subscriptions.push(trainer);

  const sendToWebview = async (messageType: string, data?: any): Promise<boolean> => {
    await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!viewProvider.webviewProtocol.webview) {
      return false;
    }
    viewProvider.webviewProtocol.send(messageType, data);
    return true;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.open", () => {
      void vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.analyzeAudioFile", async () => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { Audio: ["wav", "m4a", "mp3", "aac"] },
      });
      if (!selection || selection.length === 0) {
        return;
      }
      void vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
      void vscode.window.showInformationMessage(
        "已选中音频文件，请在面试训练助手面板中点击“导入音频”后开始分析。",
      );
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openSettings", async () => {
      const sent = await sendToWebview("it/showSettings");
      if (!sent) {
        it_ensureConfigFiles(context);
        const configDir = it_getUserConfigDir(context);
        const target = path.join(configDir, "api_config.yaml");
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openHistory", async () => {
      const sent = await sendToWebview("it/showHistory");
      if (!sent) {
        void vscode.window.showInformationMessage("请先打开面试训练助手面板。");
      }
    }),
  );

  if (process.env.IT_E2E_ENABLE_TEST_COMMANDS === "1") {
    const pendingUiRuns = new Map<string, ItE2EUiPending>();
    const pendingAnalyzeRuns = new Map<string, ItE2EUiPending>();
    let webviewUiBridgeReady = false;

    const ensureWebviewUiBridgeReady = async (): Promise<{ ready: boolean; reason?: string }> => {
      const readyDeadline = Date.now() + 15_000;
      while (!webviewUiBridgeReady && Date.now() < readyDeadline) {
        await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      if (!webviewUiBridgeReady) {
        return {
          ready: false,
          reason: "Webview UI automation bridge is not ready",
        };
      }
      return { ready: true };
    };

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_READY, () => {
      webviewUiBridgeReady = true;
      return { received: true };
    });

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_ACK, (message) => {
      webviewUiBridgeReady = true;
      const runId = String(message.data?.runId || "");
      if (!runId) {
        return { received: false, reason: "missing runId" };
      }
      const pending = pendingUiRuns.get(runId);
      if (!pending) {
        return { received: false, reason: "not pending" };
      }
      clearTimeout(pending.timeout);
      pendingUiRuns.delete(runId);
      pending.resolve(message.data as ItE2EUiAutomationResult);
      return { received: true };
    });

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_ANALYZE_ACK, (message) => {
      webviewUiBridgeReady = true;
      const runId = String(message.data?.runId || "");
      if (!runId) {
        return { received: false, reason: "missing runId" };
      }
      const pending = pendingAnalyzeRuns.get(runId);
      if (!pending) {
        return { received: false, reason: "not pending" };
      }
      clearTimeout(pending.timeout);
      pendingAnalyzeRuns.delete(runId);
      pending.resolve(message.data as ItE2EUiAutomationResult);
      return { received: true };
    });

    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_WEBVIEW_UI_FLOW_COMMAND, async () => {
        const runId = `e2e-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;

        const readyState = await ensureWebviewUiBridgeReady();
        if (!readyState.ready) {
          return {
            runId,
            status: "error",
            error: readyState.reason || "Webview bridge not ready",
          } satisfies ItE2EUiAutomationResult;
        }

        const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingUiRuns.delete(runId);
            reject(new Error(`Webview UI automation timed out after ${IT_E2E_WEBVIEW_UI_TIMEOUT_MS}ms`));
          }, IT_E2E_WEBVIEW_UI_TIMEOUT_MS);
          pendingUiRuns.set(runId, { resolve, timeout });
        });

        const sent = await sendToWebview(IT_E2E_WEBVIEW_UI_REQUEST, { runId });
        if (!sent) {
          const pending = pendingUiRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingUiRuns.delete(runId);
          }
          return {
            runId,
            status: "error",
            error: "Webview is not ready",
          } satisfies ItE2EUiAutomationResult;
        }

        try {
          return await waitForResult;
        } catch (error) {
          return {
            runId,
            status: "error",
            error: error instanceof Error ? error.message : String(error),
          } satisfies ItE2EUiAutomationResult;
        } finally {
          const pending = pendingUiRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingUiRuns.delete(runId);
          }
        }
      }),
    );

    const runWebviewAnalyzeFlowScenario = async (
      scenario: ItE2EAnalyzeScenario,
    ): Promise<ItE2EUiAutomationResult> => {
      const runId = `e2e-webview-${scenario}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const readyState = await ensureWebviewUiBridgeReady();
      if (!readyState.ready) {
        return {
          runId,
          status: "error",
          error: readyState.reason || "Webview bridge not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      const workspaceRoot =
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        path.resolve(context.extensionPath, "..");
      const fixtureRequest = it_buildFixtureAnalyzeRequest(workspaceRoot);
      const webviewPayload = it_buildFixtureWebviewAnalyzePayload(workspaceRoot);
      const restoreConfig = it_applyE2ETestConfigBundle(
        trainer,
        fixtureRequest.questionList?.join("\n") || fixtureRequest.questionText || "e2e transcript",
      );

      try {
        const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingAnalyzeRuns.delete(runId);
            reject(
              new Error(`Webview ${scenario} flow timed out after ${IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS}ms`),
            );
          }, IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS);
          pendingAnalyzeRuns.set(runId, { resolve, timeout });
        });

        const sent = await sendToWebview(IT_E2E_WEBVIEW_ANALYZE_REQUEST, {
          runId,
          mode: scenario,
          questionText: webviewPayload.questionText,
          questionList: webviewPayload.questionList,
          audio: webviewPayload.audio,
        });
        if (!sent) {
          const pending = pendingAnalyzeRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingAnalyzeRuns.delete(runId);
          }
          return {
            runId,
            status: "error",
            error: "Webview is not ready",
          } satisfies ItE2EUiAutomationResult;
        }

        return await waitForResult;
      } catch (error) {
        return {
          runId,
          status: "error",
          error: error instanceof Error ? error.message : String(error),
        } satisfies ItE2EUiAutomationResult;
      } finally {
        const pending = pendingAnalyzeRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingAnalyzeRuns.delete(runId);
        }
        restoreConfig();
      }
    };

    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND, async () =>
        runWebviewAnalyzeFlowScenario("analyze"),
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND, async () =>
        runWebviewAnalyzeFlowScenario("cancel"),
      ),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND, async () =>
        runWebviewAnalyzeFlowScenario("save"),
      ),
    );


    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_FIXTURE_ANALYZE_COMMAND, async () => {
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
          path.resolve(context.extensionPath, "..");
        const request = it_buildFixtureAnalyzeRequest(workspaceRoot);
        const restoreConfig = it_applyE2ETestConfigBundle(
          trainer,
          request.questionList?.join("\n") || request.questionText || "e2e transcript",
        );

        try {
          const result = await trainer.handleAnalyze(request);
          return {
            status: "success",
            reportPath: result.reportPath,
            topicDir: result.topicDir,
            questionCount: Array.isArray(result.questionList)
              ? result.questionList.length
              : 0,
            overallScore: result.evaluation?.overallScore ?? null,
          };
        } catch (error) {
          return {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            stateError: trainer.state.lastError?.reason || "",
          };
        } finally {
          restoreConfig();
        }
      }),
    );
  }
}

export function deactivate() {}
