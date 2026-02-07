import type * as vscode from "vscode";
import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItState,
} from "../../../protocol/interviewTrainer";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "../../application/services/it_configGateway";
import type { ItTemplateTokenService } from "../../application/useCases/it_templateActions";
import type { WebviewProtocol } from "../../../webview/WebviewProtocol";

export type ItWebviewProtocolPort = {
  webviewProtocol: WebviewProtocol;
};

export type ItConfigStatePort = {
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
};

export type ItConfigSnapshotBuildPort = {
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
};

export type ItWorkspacePort = {
  requireWorkspaceRoot: () => string;
};

export type ItCoreHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & ItWorkspacePort
  & {
    context: vscode.ExtensionContext;
    outputChannel: vscode.OutputChannel;
    traceLogsEnabled: boolean;
    state: ItState;
    scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  };

export type ItEnvironmentHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & ItConfigSnapshotBuildPort;

export type ItProviderHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & ItConfigSnapshotBuildPort
  & {
    context: vscode.ExtensionContext;
  };

export type ItQuestionHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & {
    context: vscode.ExtensionContext;
    logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
    resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  };

export type ItRecordingHandlersPort =
  & ItWebviewProtocolPort
  & {
    detectedInput: string | null;
    availableInputs: string[] | null;
    it_findFfmpeg: () => Promise<string | null>;
    it_listInputs: (ffmpeg: string) => Promise<string[]>;
    it_startNativeRecording: (
      device?: string,
    ) => Promise<{ tmpDir: string; tmpPath: string; startedAt: number }>;
    it_stopNativeRecording: () => Promise<{ audio: ItAnalyzeRequest["audio"]; locked?: string[] }>;
  };

export type ItResultHandlersPort =
  & ItWebviewProtocolPort
  & ItWorkspacePort
  & {
    analysisAbort: { aborted: boolean } | null;
    state: ItState;
    configBundle: ItConfigBundle;
    updateState: (next: Partial<ItState>) => void;
    handleAnalyze: (request: ItAnalyzeRequest) => Promise<ItAnalyzeResponse>;
  };

export type ItRetrievalHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & ItWorkspacePort
  & {
    context: vscode.ExtensionContext;
    corpusDirty: boolean;
    normalizeWorkspaceKey: (root: string) => string;
    scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
    updateEmbeddingWarmup: (next: Partial<ItEmbeddingWarmupState>) => void;
  };

export type ItTemplateHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & {
    context: vscode.ExtensionContext;
    tokenService: ItTemplateTokenService;
  };

export type ItTemplateTestHandlersPort =
  & ItWebviewProtocolPort
  & {
    context: vscode.ExtensionContext;
    configService: ItConfigService;
    configSnapshot: ItConfigSnapshot;
  };

export type ItWorkspaceHandlersPort =
  & ItWebviewProtocolPort
  & ItConfigStatePort
  & ItWorkspacePort;

export type ItAsrTestHandlerPort = ItWebviewProtocolPort;

export type ItEmbeddingTestHandlerPort =
  & ItWebviewProtocolPort
  & {
    logEmbeddingTestFailure: (error: unknown) => void;
  };

export type ItLlmTestHandlerPort =
  & ItWebviewProtocolPort
  & {
    logLlmTestFailure: (error: unknown, detail?: Record<string, unknown>) => void;
    outputChannel: vscode.OutputChannel;
  };

export type ItConfigHandlersPort =
  & ItEnvironmentHandlersPort
  & ItProviderHandlersPort
  & ItTemplateHandlersPort
  & ItWorkspaceHandlersPort;

export type ItTestHandlersPort =
  & ItAsrTestHandlerPort
  & ItEmbeddingTestHandlerPort
  & ItLlmTestHandlerPort
  & ItTemplateTestHandlersPort;

export type ItWebviewHandlersHost =
  & ItCoreHandlersPort
  & ItConfigHandlersPort
  & ItQuestionHandlersPort
  & ItRecordingHandlersPort
  & ItResultHandlersPort
  & ItRetrievalHandlersPort
  & ItTestHandlersPort;
