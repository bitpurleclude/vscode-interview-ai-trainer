import fs from "fs";
import path from "path";
import * as vscode from "vscode";

import type { ItAnalyzeRequest } from "./protocol/interviewTrainer";
import { InterviewTrainerExtension } from "./interviewTrainer/InterviewTrainerExtension";
import { it_ensureConfigFiles, it_getUserConfigDir } from "./interviewTrainer/infra/api/it_apiConfig";
import {
  InterviewTrainerWebviewViewProvider,
  type ItWebviewLifecycleEvent,
} from "./webview/InterviewTrainerWebviewViewProvider";

const IT_E2E_FIXTURE_AUDIO_MAX_BYTES = 256 * 1024;
const IT_E2E_FIXTURE_ANALYZE_COMMAND = "itInterviewTrainer.__test.runFixtureAnalyze";
const IT_E2E_WEBVIEW_UI_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewUiClickFlow";
const IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewAnalyzeFlow";
const IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewCancelFlow";
const IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewSaveResultFlow";
const IT_E2E_WEBVIEW_PROTOCOL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewProtocolGuardFlow";
const IT_E2E_WEBVIEW_UI_REQUEST = "it/test/webviewUiAutomationRequest";
const IT_E2E_WEBVIEW_UI_ACK = "it/test/webviewUiAutomationAck";
const IT_E2E_WEBVIEW_UI_READY = "it/test/webviewUiAutomationReady";
const IT_E2E_WEBVIEW_ANALYZE_REQUEST = "it/test/webviewAnalyzeFlowRequest";
const IT_E2E_WEBVIEW_ANALYZE_ACK = "it/test/webviewAnalyzeFlowAck";
const IT_E2E_WEBVIEW_PROTOCOL_REQUEST = "it/test/webviewProtocolGuardRequest";
const IT_E2E_WEBVIEW_PROTOCOL_ACK = "it/test/webviewProtocolGuardAck";
const IT_E2E_WEBVIEW_UI_TIMEOUT_MS = 20_000;
const IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS = 90_000;
const IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS = 20_000;
const IT_E2E_WORKSPACE_ERROR_CODE = "workspace_not_found";
const IT_E2E_WORKSPACE_ERROR_MESSAGE = "Please open a workspace folder before running analysis.";

type ItE2EUiAutomationResult = {
  runId: string;
  status: "success" | "error";
  activePage?: "practice" | "settings" | "unknown";
  steps?: Array<{ action: string; ok: boolean; detail?: string }>;
  overallScoreText?: string;
  error?: string;
  errorCode?: string;
  userMessage?: string;
  probeResponse?: unknown;
};

type ItE2EUiPending = {
  resolve: (result: ItE2EUiAutomationResult) => void;
  timeout: NodeJS.Timeout;
};

type ItE2EAnalyzeScenario = "analyze" | "cancel" | "save";

type ItE2EErrorPayload = {
  message: string;
  errorCode?: string;
  userMessage?: string;
  probeResponse?: unknown;
};

function it_createE2EWorkspaceRequiredError(): Error {
  const error = new Error("workspace not found") as Error & {
    code?: string;
    userMessage?: string;
  };
  error.code = IT_E2E_WORKSPACE_ERROR_CODE;
  error.userMessage = IT_E2E_WORKSPACE_ERROR_MESSAGE;
  return error;
}

function it_toE2EErrorPayload(error: unknown): ItE2EErrorPayload {
  if (error instanceof Error) {
    const errorWithMeta = error as Error & {
      code?: string;
      userMessage?: string;
    };
    return {
      message: error.message,
      errorCode: errorWithMeta.code,
      userMessage: errorWithMeta.userMessage,
    };
  }
  return {
    message: String(error),
  };
}

function it_commandErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function it_runLoggedCommand<T>(
  trainer: InterviewTrainerExtension,
  options: {
    commandId: string;
    event: string;
    detail?: Record<string, unknown>;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  trainer.logCorpusTrace(`${options.commandId} request`, {
    event: options.event,
    status: "request",
    ...(options.detail || {}),
  });
  try {
    const result = await run();
    trainer.logCorpusTrace(`${options.commandId} success`, {
      event: options.event,
      status: "success",
      ...(options.detail || {}),
    });
    return result;
  } catch (error) {
    trainer.logCorpusTrace(`${options.commandId} error`, {
      event: options.event,
      status: "error",
      error: it_commandErrorMessage(error),
      ...(options.detail || {}),
    });
    throw error;
  }
}

type ItBridgeLogLevel = "debug" | "info" | "warn" | "error";

function it_logWebviewBridge(
  trainer: InterviewTrainerExtension,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItBridgeLogLevel = "info",
): void {
  trainer.logCorpusTrace(`webview bridge ${action} ${status}`, {
    event: `extension.webview_bridge.${action}`,
    status,
    level,
    module: "extension",
    ...(detail || {}),
  });
}

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


function it_shouldRequireWorkspaceInE2E(): boolean {
  return process.env.IT_E2E_REQUIRE_WORKSPACE === "1";
}

function it_resolveE2EWorkspaceRoot(context: vscode.ExtensionContext): string {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (workspaceRoot) {
    return workspaceRoot;
  }
  if (it_shouldRequireWorkspaceInE2E()) {
    void vscode.window.showErrorMessage(IT_E2E_WORKSPACE_ERROR_MESSAGE);
    throw it_createE2EWorkspaceRequiredError();
  }
  return path.resolve(context.extensionPath, "..");
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

  viewProvider.setLifecycleObserver((event: ItWebviewLifecycleEvent) => {
    if (event.type !== "webview_resolved") {
      return;
    }
    it_logWebviewBridge(
      trainer,
      "resolve",
      "success",
      { viewType: event.viewType },
      "debug",
    );
  });

  const sendToWebview = async (messageType: string, data?: any): Promise<boolean> => {
    it_logWebviewBridge(
      trainer,
      "send",
      "request",
      {
        messageType,
        hasData: data !== undefined,
      },
      "debug",
    );
    await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!viewProvider.webviewProtocol.webview) {
      it_logWebviewBridge(
        trainer,
        "send",
        "skipped",
        {
          messageType,
          reason: "webview_not_ready",
        },
        "warn",
      );
      return false;
    }
    try {
      viewProvider.webviewProtocol.send(messageType, data);
      it_logWebviewBridge(
        trainer,
        "send",
        "success",
        {
          messageType,
        },
        "debug",
      );
      return true;
    } catch (error) {
      it_logWebviewBridge(
        trainer,
        "send",
        "error",
        {
          messageType,
          errorCode: "webview_send_failed",
          error: it_commandErrorMessage(error),
        },
        "error",
      );
      return false;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.open", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.open",
          event: "extension.command.open",
        },
        async () => {
          await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.analyzeAudioFile", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.analyzeAudioFile",
          event: "extension.command.analyze_audio_file",
        },
        async () => {
          const selection = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { Audio: ["wav", "m4a", "mp3", "aac"] },
          });
          if (!selection || selection.length === 0) {
            trainer.logCorpusTrace("itInterviewTrainer.analyzeAudioFile cancelled", {
              event: "extension.command.analyze_audio_file",
              status: "cancelled",
            });
            return;
          }
          await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
          await vscode.window.showInformationMessage(
            "已选中音频文件，请在面试训练助手面板中点击“导入音频”后开始分析。",
          );
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openSettings", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.openSettings",
          event: "extension.command.open_settings",
        },
        async () => {
          const sent = await sendToWebview("it/showSettings");
          if (sent) {
            return;
          }
          it_ensureConfigFiles(context);
          const configDir = it_getUserConfigDir(context);
          const target = path.join(configDir, "api_config.yaml");
          trainer.logCorpusTrace("itInterviewTrainer.openSettings fallback", {
            event: "extension.command.open_settings",
            status: "fallback",
            target,
          });
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openHistory", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.openHistory",
          event: "extension.command.open_history",
        },
        async () => {
          const sent = await sendToWebview("it/showHistory");
          if (sent) {
            return;
          }
          trainer.logCorpusTrace("itInterviewTrainer.openHistory fallback", {
            event: "extension.command.open_history",
            status: "fallback",
          });
          await vscode.window.showInformationMessage("请先打开面试训练助手面板。");
        },
      ),
    ),
  );

  if (process.env.IT_E2E_ENABLE_TEST_COMMANDS === "1") {
    const pendingUiRuns = new Map<string, ItE2EUiPending>();
    const pendingAnalyzeRuns = new Map<string, ItE2EUiPending>();
    const pendingProtocolRuns = new Map<string, ItE2EUiPending>();
    let webviewUiBridgeReady = false;

    const ensureWebviewUiBridgeReady = async (): Promise<{ ready: boolean; reason?: string }> => {
      const timeoutMs = 15_000;
      const startedAt = Date.now();
      const readyDeadline = startedAt + timeoutMs;
      let focusAttempts = 0;
      it_logWebviewBridge(
        trainer,
        "automation_ready",
        "start",
        { timeoutMs },
        "debug",
      );
      while (!webviewUiBridgeReady && Date.now() < readyDeadline) {
        focusAttempts += 1;
        await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      const waitMs = Date.now() - startedAt;
      if (!webviewUiBridgeReady) {
        it_logWebviewBridge(
          trainer,
          "automation_ready",
          "timeout",
          {
            timeoutMs,
            waitMs,
            focusAttempts,
            reason: "bridge_ready_not_received",
          },
          "warn",
        );
        return {
          ready: false,
          reason: "Webview UI automation bridge is not ready",
        };
      }
      it_logWebviewBridge(
        trainer,
        "automation_ready",
        "success",
        {
          waitMs,
          focusAttempts,
        },
        "debug",
      );
      return { ready: true };
    };

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_READY, () => {
      webviewUiBridgeReady = true;
      it_logWebviewBridge(
        trainer,
        "ready_signal",
        "success",
        { messageType: IT_E2E_WEBVIEW_UI_READY },
        "debug",
      );
      return { received: true };
    });

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_ACK, (message) => {
      webviewUiBridgeReady = true;
      const runId = String(message.data?.runId || "");
      if (!runId) {
        it_logWebviewBridge(
          trainer,
          "ui_ack",
          "invalid",
          {
            reason: "missing_run_id",
            messageType: IT_E2E_WEBVIEW_UI_ACK,
          },
          "warn",
        );
        return { received: false, reason: "missing runId" };
      }
      const pending = pendingUiRuns.get(runId);
      if (!pending) {
        it_logWebviewBridge(
          trainer,
          "ui_ack",
          "invalid",
          {
            reason: "not_pending",
            messageType: IT_E2E_WEBVIEW_UI_ACK,
            runId,
            pendingCount: pendingUiRuns.size,
          },
          "warn",
        );
        return { received: false, reason: "not pending" };
      }
      clearTimeout(pending.timeout);
      pendingUiRuns.delete(runId);
      pending.resolve(message.data as ItE2EUiAutomationResult);
      it_logWebviewBridge(
        trainer,
        "ui_ack",
        "success",
        {
          messageType: IT_E2E_WEBVIEW_UI_ACK,
          runId,
          pendingCount: pendingUiRuns.size,
        },
        "debug",
      );
      return { received: true };
    });

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_ANALYZE_ACK, (message) => {
      webviewUiBridgeReady = true;
      const runId = String(message.data?.runId || "");
      if (!runId) {
        it_logWebviewBridge(
          trainer,
          "analyze_ack",
          "invalid",
          {
            reason: "missing_run_id",
            messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
          },
          "warn",
        );
        return { received: false, reason: "missing runId" };
      }
      const pending = pendingAnalyzeRuns.get(runId);
      if (!pending) {
        it_logWebviewBridge(
          trainer,
          "analyze_ack",
          "invalid",
          {
            reason: "not_pending",
            messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
            runId,
            pendingCount: pendingAnalyzeRuns.size,
          },
          "warn",
        );
        return { received: false, reason: "not pending" };
      }
      clearTimeout(pending.timeout);
      pendingAnalyzeRuns.delete(runId);
      pending.resolve(message.data as ItE2EUiAutomationResult);
      it_logWebviewBridge(
        trainer,
        "analyze_ack",
        "success",
        {
          messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
          runId,
          pendingCount: pendingAnalyzeRuns.size,
        },
        "debug",
      );
      return { received: true };
    });

    viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_PROTOCOL_ACK, (message) => {
      webviewUiBridgeReady = true;
      const runId = String(message.data?.runId || "");
      if (!runId) {
        it_logWebviewBridge(
          trainer,
          "protocol_ack",
          "invalid",
          {
            reason: "missing_run_id",
            messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
          },
          "warn",
        );
        return { received: false, reason: "missing runId" };
      }
      const pending = pendingProtocolRuns.get(runId);
      if (!pending) {
        it_logWebviewBridge(
          trainer,
          "protocol_ack",
          "invalid",
          {
            reason: "not_pending",
            messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
            runId,
            pendingCount: pendingProtocolRuns.size,
          },
          "warn",
        );
        return { received: false, reason: "not pending" };
      }
      clearTimeout(pending.timeout);
      pendingProtocolRuns.delete(runId);
      pending.resolve(message.data as ItE2EUiAutomationResult);
      it_logWebviewBridge(
        trainer,
        "protocol_ack",
        "success",
        {
          messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
          runId,
          pendingCount: pendingProtocolRuns.size,
        },
        "debug",
      );
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
          const errorPayload = it_toE2EErrorPayload(error);
          return {
            runId,
            status: "error",
            error: errorPayload.message,
            errorCode: errorPayload.errorCode,
            userMessage: errorPayload.userMessage,
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

      let fixtureRequest: ItAnalyzeRequest;
      let webviewPayload: ReturnType<typeof it_buildFixtureWebviewAnalyzePayload>;
      try {
        const workspaceRoot = it_resolveE2EWorkspaceRoot(context);
        fixtureRequest = it_buildFixtureAnalyzeRequest(workspaceRoot);
        webviewPayload = it_buildFixtureWebviewAnalyzePayload(workspaceRoot);
      } catch (error) {
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          runId,
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
        } satisfies ItE2EUiAutomationResult;
      }
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
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          runId,
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
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
      vscode.commands.registerCommand(IT_E2E_WEBVIEW_PROTOCOL_FLOW_COMMAND, async () => {
        const runId = `e2e-webview-protocol-${Date.now()}-${Math.random().toString(16).slice(2)}`;

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
            pendingProtocolRuns.delete(runId);
            reject(
              new Error(
                `Webview protocol guard flow timed out after ${IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS}ms`,
              ),
            );
          }, IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS);
          pendingProtocolRuns.set(runId, { resolve, timeout });
        });

        const sent = await sendToWebview(IT_E2E_WEBVIEW_PROTOCOL_REQUEST, { runId });
        if (!sent) {
          const pending = pendingProtocolRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingProtocolRuns.delete(runId);
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
          const errorPayload = it_toE2EErrorPayload(error);
          return {
            runId,
            status: "error",
            error: errorPayload.message,
            errorCode: errorPayload.errorCode,
            userMessage: errorPayload.userMessage,
          } satisfies ItE2EUiAutomationResult;
        } finally {
          const pending = pendingProtocolRuns.get(runId);
          if (pending) {
            clearTimeout(pending.timeout);
            pendingProtocolRuns.delete(runId);
          }
        }
      }),
    );

    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_FIXTURE_ANALYZE_COMMAND, async () => {
        let request: ItAnalyzeRequest;
        try {
          const workspaceRoot = it_resolveE2EWorkspaceRoot(context);
          request = it_buildFixtureAnalyzeRequest(workspaceRoot);
        } catch (error) {
          const errorPayload = it_toE2EErrorPayload(error);
          return {
            status: "error",
            error: errorPayload.message,
            errorCode: errorPayload.errorCode,
            userMessage: errorPayload.userMessage,
            stateError: trainer.state.lastError?.reason || "",
          };
        }

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
          const errorPayload = it_toE2EErrorPayload(error);
          return {
            status: "error",
            error: errorPayload.message,
            errorCode: errorPayload.errorCode,
            userMessage: errorPayload.userMessage,
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
