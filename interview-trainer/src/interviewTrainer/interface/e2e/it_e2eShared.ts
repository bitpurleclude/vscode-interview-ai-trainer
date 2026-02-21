import fs from "fs";
import path from "path";
import * as vscode from "vscode";

import type { ItAnalyzeRequest, ItApiTemplate } from "../../../protocol/interviewTrainer";
import { InterviewTrainerExtension } from "../../InterviewTrainerExtension";

export const IT_E2E_FIXTURE_AUDIO_MAX_BYTES = 256 * 1024;
export const IT_E2E_FIXTURE_ANALYZE_COMMAND = "itInterviewTrainer.__test.runFixtureAnalyze";
export const IT_E2E_WEBVIEW_UI_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewUiClickFlow";
export const IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewAnalyzeFlow";
export const IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewCancelFlow";
export const IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewSaveResultFlow";
export const IT_E2E_WEBVIEW_PROTOCOL_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewProtocolGuardFlow";
export const IT_E2E_WEBVIEW_SETTINGS_FLOW_COMMAND = "itInterviewTrainer.__test.runWebviewSettingsFlow";
export const IT_E2E_WEBVIEW_UI_REQUEST = "it/test/webviewUiAutomationRequest";
export const IT_E2E_WEBVIEW_UI_ACK = "it/test/webviewUiAutomationAck";
export const IT_E2E_WEBVIEW_UI_READY = "it/test/webviewUiAutomationReady";
export const IT_E2E_WEBVIEW_ANALYZE_REQUEST = "it/test/webviewAnalyzeFlowRequest";
export const IT_E2E_WEBVIEW_ANALYZE_ACK = "it/test/webviewAnalyzeFlowAck";
export const IT_E2E_WEBVIEW_PROTOCOL_REQUEST = "it/test/webviewProtocolGuardRequest";
export const IT_E2E_WEBVIEW_PROTOCOL_ACK = "it/test/webviewProtocolGuardAck";
export const IT_E2E_WEBVIEW_SETTINGS_REQUEST = "it/test/webviewSettingsFlowRequest";
export const IT_E2E_WEBVIEW_SETTINGS_ACK = "it/test/webviewSettingsFlowAck";
export const IT_E2E_WEBVIEW_UI_TIMEOUT_MS = 20_000;
export const IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS = 90_000;
export const IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS = 20_000;
export const IT_E2E_WEBVIEW_SETTINGS_TIMEOUT_MS = 40_000;
export const IT_E2E_WORKSPACE_ERROR_CODE = "workspace_not_found";
export const IT_E2E_WORKSPACE_ERROR_MESSAGE =
  "Please open a workspace folder before running analysis.";
export const IT_E2E_TEMPLATE_ENDPOINT = "http://10.255.255.1:81";
export const IT_E2E_ASR_TEMPLATE_ID = "it-e2e-asr-transcription";
export const IT_E2E_EVALUATION_TEMPLATE_ID = "it-e2e-llm-evaluation";

export type ItE2EUiAutomationResult = {
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

export type ItE2EUiPending = {
  resolve: (result: ItE2EUiAutomationResult) => void;
  timeout: NodeJS.Timeout;
};

export type ItE2EAnalyzeScenario = "analyze" | "cancel" | "save";

export type ItE2EErrorPayload = {
  message: string;
  errorCode?: string;
  userMessage?: string;
  probeResponse?: unknown;
};

export type ItE2ESettingsFlowCommandOptions = {
  injectFailureStage?: string;
  targetEnvName?: string;
};

export type ItE2EProtocolFlowCommandOptions = {
  injectFailureStage?: string;
};

export type ItE2EAnalyzeFlowCommandOptions = {
  injectFailureStage?: string;
};

export type ItE2EUiFlowCommandOptions = {
  injectFailureStage?: string;
};

export function it_createE2EWorkspaceRequiredError(): Error {
  const error = new Error("workspace not found") as Error & {
    code?: string;
    userMessage?: string;
  };
  error.code = IT_E2E_WORKSPACE_ERROR_CODE;
  error.userMessage = IT_E2E_WORKSPACE_ERROR_MESSAGE;
  return error;
}

export function it_toE2EErrorPayload(error: unknown): ItE2EErrorPayload {
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

export function it_findFixtureFile(
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

export function it_cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

export function it_buildE2EPlaceholderTemplate(
  id: string,
  name: string,
  category: ItApiTemplate["category"],
): ItApiTemplate {
  return {
    id,
    name,
    category,
    request: {
      method: "POST",
      url: `${IT_E2E_TEMPLATE_ENDPOINT}/${id}`,
      headers: {
        "content-type": "application/json",
      },
      body: {},
      timeoutSec: 2,
      stream: false,
    },
    response: {
      mode: "json",
      textPath: "$.text",
      jsonPath: "$",
      errorPath: "$.error",
    },
  };
}

export function it_applyE2ETestConfigBundle(
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
      mock_delay_ms: 2500,
      timeout_sec: 10,
      max_retries: 0,
    },
    retrieval: {
      ...((testBundle.skill || {}).retrieval || {}),
      enabled: false,
    },
    topics: {
      ...((testBundle.skill || {}).topics || {}),
      title_mode: "simple",
      similarity_threshold: 1,
    },
  };
  const templatesConfig = testBundle.templates || { version: 1, environments: {} };
  const templateEnv = {
    ...(templatesConfig.environments?.[env] || {}),
  };
  const envTemplates = {
    ...(templateEnv.templates || {}),
  };
  if (!envTemplates[IT_E2E_ASR_TEMPLATE_ID]) {
    envTemplates[IT_E2E_ASR_TEMPLATE_ID] = it_buildE2EPlaceholderTemplate(
      IT_E2E_ASR_TEMPLATE_ID,
      "E2E ASR Placeholder",
      "asr",
    );
  }
  if (!envTemplates[IT_E2E_EVALUATION_TEMPLATE_ID]) {
    envTemplates[IT_E2E_EVALUATION_TEMPLATE_ID] = it_buildE2EPlaceholderTemplate(
      IT_E2E_EVALUATION_TEMPLATE_ID,
      "E2E LLM Placeholder",
      "llm",
    );
  }
  const llmBindings = {
    ...(templateEnv.bindings?.llm || {}),
  };
  if (!llmBindings.questionParse) {
    llmBindings.questionParse = IT_E2E_EVALUATION_TEMPLATE_ID;
  }
  if (!llmBindings.title) {
    llmBindings.title = IT_E2E_EVALUATION_TEMPLATE_ID;
  }
  if (!llmBindings.segment) {
    llmBindings.segment = IT_E2E_EVALUATION_TEMPLATE_ID;
  }
  if (!llmBindings.evaluation) {
    llmBindings.evaluation = IT_E2E_EVALUATION_TEMPLATE_ID;
  }
  const asrBindings = {
    ...(templateEnv.bindings?.asr || {}),
  };
  if (!asrBindings.transcription) {
    asrBindings.transcription = IT_E2E_ASR_TEMPLATE_ID;
  }
  testBundle.templates = {
    ...templatesConfig,
    environments: {
      ...(templatesConfig.environments || {}),
      [env]: {
        ...templateEnv,
        templates: envTemplates,
        bindings: {
          ...(templateEnv.bindings || {}),
          llm: llmBindings,
          asr: asrBindings,
          embedding: {
            ...(templateEnv.bindings?.embedding || {}),
          },
        },
      },
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

export function it_buildSmokeWavBase64(durationSec = 1, sampleRate = 16_000): string {
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

export function it_buildE2EQuestionText(baseQuestionText: string, runTag?: string): string {
  const normalizedBase = String(baseQuestionText || "").trim() || "fixture question";
  const normalizedTag = String(runTag || "").trim();
  if (!normalizedTag) {
    return normalizedBase;
  }
  return `${normalizedBase} [${normalizedTag}]`;
}

export function it_buildFixtureWebviewAnalyzePayload(workspaceRoot: string, runTag?: string): {
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

  const questionText = it_buildE2EQuestionText(lines[0] || "fixture question", runTag);
  const questionList = [questionText];

  return {
    questionText,
    questionList: questionList.length ? questionList : [questionText],
    audio: {
      base64: it_buildSmokeWavBase64(4, 16_000),
      filename: "fixture-smoke.wav",
      mimeType: "audio/wav",
    },
  };
}

export function it_buildFixtureAnalyzeRequest(workspaceRoot: string, runTag?: string): ItAnalyzeRequest {
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

  const questionText = it_buildE2EQuestionText(lines[0] || "fixture question", runTag);
  const questionList = [questionText];

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

export function it_shouldRequireWorkspaceInE2E(): boolean {
  return process.env.IT_E2E_REQUIRE_WORKSPACE === "1";
}

export function it_resolveE2EWorkspaceRoot(context: vscode.ExtensionContext): string {
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
