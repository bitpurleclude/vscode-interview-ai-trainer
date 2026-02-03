import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItState,
} from "../../protocol/interviewTrainer";
import { ItApiConfig, ItConfigBundle } from "../api/it_apiConfig";
import { ItConfigService } from "../api/it_configService";
import { ItLlmConfig } from "../api/it_llmTypes";
import { WebviewProtocol } from "../../webview/WebviewProtocol";
import { it_registerConfigHandlers } from "./it_webviewConfigHandlers";
import { it_registerCoreHandlers } from "./it_webviewCoreHandlers";
import { it_registerQuestionHandlers } from "./it_webviewQuestionHandlers";
import { it_registerRecordingHandlers } from "./it_webviewRecordingHandlers";
import { it_registerRetrievalHandlers } from "./it_webviewRetrievalHandlers";
import { it_registerResultHandlers } from "./it_webviewResultHandlers";
import { it_registerTestHandlers } from "./it_webviewTestHandlers";

export type ItWebviewHandlersHost = {
  context: vscode.ExtensionContext;
  webviewProtocol: WebviewProtocol;
  outputChannel: vscode.OutputChannel;
  traceLogsEnabled: boolean;
  state: ItState;
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  configService: ItConfigService;
  corpusDirty: boolean;
  detectedInput: string | null;
  availableInputs: string[] | null;
  analysisAbort: { aborted: boolean } | null;
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  requireWorkspaceRoot: () => string;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  updateEmbeddingWarmup: (next: Partial<ItEmbeddingWarmupState>) => void;
  updateState: (next: Partial<ItState>) => void;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  logEmbeddingTestFailure: (error: unknown) => void;
  logLlmTestFailure: (error: unknown, detail?: Record<string, unknown>) => void;
  it_getLlmConfig: (profileId?: string) => ItLlmConfig | null;
  it_findFfmpeg: () => Promise<string | null>;
  it_listInputs: (ffmpeg: string) => Promise<string[]>;
  it_startNativeRecording: (
    device?: string,
  ) => Promise<{ tmpDir: string; tmpPath: string; startedAt: number }>;
  it_stopNativeRecording: () => Promise<{ audio: ItAnalyzeRequest["audio"]; locked?: string[] }>;
  handleAnalyze: (request: ItAnalyzeRequest) => Promise<ItAnalyzeResponse>;
  it_firstNonEmpty: (...values: Array<string | undefined | null>) => string;
  normalizeWorkspaceKey: (root: string) => string;
};

export function it_registerHandlers(host: ItWebviewHandlersHost): void {
  it_registerCoreHandlers(host);
  it_registerRecordingHandlers(host);
  it_registerQuestionHandlers(host);
  it_registerRetrievalHandlers(host);
  it_registerConfigHandlers(host);
  it_registerTestHandlers(host);
  it_registerResultHandlers(host);
}
