import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../protocol/interviewTrainer";

import { ItApiConfig, ItConfigBundle } from "./infra/api/it_apiConfig";
import { ItConfigService } from "./infra/api/it_configService";
import type { ItLlmConfig } from "./application/services/it_llmGateway";
import { WebviewProtocol, type WebviewProtocolEvent } from "../webview/WebviewProtocol";
import {
  it_buildConfigSnapshot,
  it_normalizeWorkspaceKey,
  it_refreshConfigSnapshot,
  it_updateCorpusWatchers,
} from "./application/services/it_configSnapshot";
import { ItTokenService } from "./application/services/it_tokens";
import {
  it_emitEvaluationStreamUpdate,
  it_emitStreamUpdate,
  it_logCorpusTrace,
  it_logEmbeddingTestFailure,
  it_logLlmTestFailure,
  it_logInternalEvent,
} from "./application/services/it_logging";
import { IT_STATUS_INIT } from "./application/services/it_progress";
import {
  it_detectRecordingInput,
  it_findRecordingFfmpeg,
  it_listRecordingInputs,
  it_probeRecordingFfmpeg,
  it_startHostRecording,
  it_stopHostRecording,
} from "./application/services/it_extensionRecording";
import { it_registerHandlers } from "./interface/handlers/it_webviewHandlers";
import {
  it_firstNonEmpty,
  it_getLlmConfig,
  it_resolveApiConfigWithProviders,
} from "./application/services/it_extensionConfig";
import {
  it_disposeExtensionHost,
  it_requireWorkspaceRoot,
} from "./application/services/it_extensionLifecycle";
import { it_updateHostState } from "./application/services/it_extensionState";
import { it_bootstrapExtensionHost } from "./application/services/it_extensionBootstrap";
import {
  it_buildHostRunSteps,
  it_computeHostOverallProgress,
  it_handleHostAnalyze,
  it_hostIdleForWarmup,
  it_runHostEmbeddingWarmup,
  it_scheduleHostEmbeddingWarmup,
  it_updateHostEmbeddingWarmup,
  it_updateHostProgress,
} from "./application/services/it_extensionRuntime";
import { IT_EXTENSION_RUNTIME_DEPS } from "./application/services/it_extensionRuntimeDeps";

export class InterviewTrainerExtension implements vscode.Disposable {
  public state: ItState = { ...IT_STATUS_INIT };
  public configSnapshot!: ItConfigSnapshot;
  public configBundle!: ItConfigBundle;
  public configService!: ItConfigService;
  public traceLogsEnabled = false;
  public recordingChild: import("child_process").ChildProcess | null = null;
  public recordingTempDir: string | null = null;
  public recordingStartAt: number | null = null;
  public recordingExitInfo: {
    exitCode: number | null;
    exitSignal: string | null;
    stderr: string;
  } | null = null;
  public detectedInput: string | null = null;
  public availableInputs: string[] | null = null;
  public outputChannel!: vscode.OutputChannel;
  public embeddingWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  public embeddingWarmupAbort: { aborted: boolean } | null = null;
  public embeddingWarmupRunning = false;
  public analysisAbort: { aborted: boolean } | null = null;
  public corpusDirty = true;
  public corpusDirtyFiles = new Set<string>();
  public corpusWatchers: vscode.FileSystemWatcher[] = [];
  public tokenService!: ItTokenService;

  private handleWebviewProtocolEvent(event: WebviewProtocolEvent): void {
    if (event.type === "request_no_handler") {
      it_logInternalEvent(this, {
        level: "error",
        event: "protocol.webview.request_unhandled",
        module: "InterviewTrainerExtension",
        status: "error",
        errorCode: "handler_not_found",
        message: "Webview request has no registered handler",
        detail: {
          messageType: event.messageType,
          messageId: event.messageId,
        },
      });
      return;
    }

    if (event.type === "request_error") {
      it_logInternalEvent(this, {
        level: "error",
        event: "protocol.webview.request_error",
        module: "InterviewTrainerExtension",
        status: "error",
        errorCode: "handler_error",
        message: "Webview request handler threw an error",
        detail: {
          messageType: event.messageType,
          messageId: event.messageId,
          error: event.error,
        },
      });
      return;
    }

    if (event.type === "broadcast_handler_error") {
      it_logInternalEvent(this, {
        level: "error",
        event: "protocol.webview.broadcast_handler_error",
        module: "InterviewTrainerExtension",
        status: "error",
        errorCode: "handler_error",
        message: "Webview broadcast handler threw an error",
        detail: {
          messageType: event.messageType,
          handlerIndex: event.handlerIndex,
          error: event.error,
        },
      });
      return;
    }

    if (event.type === "send_error") {
      it_logInternalEvent(this, {
        level: "error",
        event: "protocol.webview.send_error",
        module: "InterviewTrainerExtension",
        status: "error",
        errorCode: "post_message_failed",
        message: "Failed to post message to Webview",
        detail: {
          messageType: event.messageType,
          messageId: event.messageId,
          error: event.error,
        },
      });
      return;
    }

    if (event.type === "invalid_message") {
      it_logInternalEvent(this, {
        level: "warn",
        event: "protocol.webview.invalid_message",
        module: "InterviewTrainerExtension",
        status: "ignored",
        message: "Ignored invalid Webview message",
        detail: {
          rawKind: event.rawKind,
          hasMessageId: event.hasMessageId,
        },
      });
      return;
    }

    if (event.type === "handler_registered") {
      it_logInternalEvent(this, {
        level: "debug",
        event: "protocol.webview.handler_registered",
        module: "InterviewTrainerExtension",
        status: "success",
        message: "Webview handler registered",
        detail: {
          messageType: event.messageType,
          handlerCount: event.handlerCount,
        },
      });
      return;
    }

    if (event.type === "broadcast_no_handler") {
      it_logInternalEvent(this, {
        level: "debug",
        event: "protocol.webview.broadcast_unhandled",
        module: "InterviewTrainerExtension",
        status: "ignored",
        message: "Webview broadcast has no handler",
        detail: {
          messageType: event.messageType,
        },
      });
      return;
    }

    if (event.type === "send_without_webview") {
      it_logInternalEvent(this, {
        level: "warn",
        event: "protocol.webview.send_without_webview",
        module: "InterviewTrainerExtension",
        status: "ignored",
        message: "Skip posting message before Webview is ready",
        detail: {
          messageType: event.messageType,
          messageId: event.messageId,
        },
      });
    }
  }

  constructor(
    public readonly context: vscode.ExtensionContext,
    public readonly webviewProtocol: WebviewProtocol,
  ) {
    this.logEmbeddingTestFailure = this.logEmbeddingTestFailure.bind(this);
    this.logLlmTestFailure = this.logLlmTestFailure.bind(this);
    this.logCorpusTrace = this.logCorpusTrace.bind(this);
    this.emitStreamUpdate = this.emitStreamUpdate.bind(this);
    this.emitEvaluationStreamUpdate = this.emitEvaluationStreamUpdate.bind(this);
    this.requireWorkspaceRoot = this.requireWorkspaceRoot.bind(this);
    this.buildConfigSnapshot = this.buildConfigSnapshot.bind(this);
    this.updateCorpusWatchers = this.updateCorpusWatchers.bind(this);
    this.refreshConfigSnapshot = this.refreshConfigSnapshot.bind(this);
    this.it_getLlmConfig = this.it_getLlmConfig.bind(this);
    this.updateState = this.updateState.bind(this);
    this.updateEmbeddingWarmup = this.updateEmbeddingWarmup.bind(this);
    this.isIdleForWarmup = this.isIdleForWarmup.bind(this);
    this.scheduleEmbeddingWarmup = this.scheduleEmbeddingWarmup.bind(this);
    this.runEmbeddingWarmup = this.runEmbeddingWarmup.bind(this);
    this.resolveApiConfigWithProviders = this.resolveApiConfigWithProviders.bind(this);
    this.buildRunSteps = this.buildRunSteps.bind(this);
    this.computeOverallProgress = this.computeOverallProgress.bind(this);
    this.updateProgress = this.updateProgress.bind(this);
    this.it_firstNonEmpty = this.it_firstNonEmpty.bind(this);
    this.normalizeWorkspaceKey = this.normalizeWorkspaceKey.bind(this);
    this.registerHandlers = this.registerHandlers.bind(this);
    this.it_findFfmpeg = this.it_findFfmpeg.bind(this);
    this.it_detectDefaultInput = this.it_detectDefaultInput.bind(this);
    this.it_runFfmpegProbe = this.it_runFfmpegProbe.bind(this);
    this.it_listInputs = this.it_listInputs.bind(this);
    this.it_startNativeRecording = this.it_startNativeRecording.bind(this);
    this.it_stopNativeRecording = this.it_stopNativeRecording.bind(this);
    this.handleAnalyze = this.handleAnalyze.bind(this);

    it_bootstrapExtensionHost(this, {
      createOutputChannel: (name) => vscode.window.createOutputChannel(name),
      createConfigService: (context) => new ItConfigService(context),
      createTokenService: (host) => new ItTokenService(host),
    });

    this.webviewProtocol.setObserver((event) => {
      this.handleWebviewProtocolEvent(event);
    });
  }

  public logEmbeddingTestFailure(error: unknown): void {
    it_logEmbeddingTestFailure(this, error);
  }

  public logLlmTestFailure(
    error: unknown,
    detail?: Record<string, unknown>,
  ): void {
    it_logLlmTestFailure(this, error, detail);
  }

  public logCorpusTrace(message: string, detail?: Record<string, unknown>): void {
    it_logCorpusTrace(this, message, detail);
  }

  public emitStreamUpdate(update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }): void {
    it_emitStreamUpdate(this, update);
  }

  public emitEvaluationStreamUpdate(update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }): void {
    it_emitEvaluationStreamUpdate(this, update);
  }

  public requireWorkspaceRoot(): string {
    return it_requireWorkspaceRoot();
  }

  public buildConfigSnapshot(apiConfig: ItApiConfig): ItConfigSnapshot {
    return it_buildConfigSnapshot(this, apiConfig);
  }

  public updateCorpusWatchers(): void {
    it_updateCorpusWatchers(this);
  }

  public async refreshConfigSnapshot(): Promise<ItConfigSnapshot> {
    return await it_refreshConfigSnapshot(this);
  }



  public it_getLlmConfig(
    profileId?: string,
    options?: { allowMissingAuth?: boolean },
  ): ItLlmConfig | null {
    return it_getLlmConfig(this.configBundle, profileId, options);
  }

  public updateState(nextState: Partial<ItState>): void {
    it_updateHostState(this, nextState);
  }

  public updateEmbeddingWarmup(next: Partial<ItEmbeddingWarmupState>): void {
    it_updateHostEmbeddingWarmup(this, next, IT_EXTENSION_RUNTIME_DEPS);
  }

  public isIdleForWarmup(): boolean {
    return it_hostIdleForWarmup(this, IT_EXTENSION_RUNTIME_DEPS);
  }

  public scheduleEmbeddingWarmup(reason: string, delayMs: number = 2500): void {
    it_scheduleHostEmbeddingWarmup(this, reason, delayMs, IT_EXTENSION_RUNTIME_DEPS);
  }

  public async runEmbeddingWarmup(reason: string): Promise<void> {
    await it_runHostEmbeddingWarmup(this, reason, IT_EXTENSION_RUNTIME_DEPS);
  }

  public resolveApiConfigWithProviders(apiConfig: ItApiConfig): ItApiConfig {
    return it_resolveApiConfigWithProviders(this.configBundle, apiConfig);
  }

  public buildRunSteps(): ItStepState[] {
    return it_buildHostRunSteps(IT_EXTENSION_RUNTIME_DEPS);
  }

  public computeOverallProgress(steps: ItStepState[]): number {
    return it_computeHostOverallProgress(steps, IT_EXTENSION_RUNTIME_DEPS);
  }


  public updateProgress(update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }): void {
    it_updateHostProgress(this, update, IT_EXTENSION_RUNTIME_DEPS);
  }

  public it_firstNonEmpty(...values: Array<string | undefined | null>): string {
    return it_firstNonEmpty(...values);
  }

  public normalizeWorkspaceKey(root: string): string {
    return it_normalizeWorkspaceKey(root);
  }

  public registerHandlers(): void {
    it_registerHandlers(this);
  }

  public async it_findFfmpeg(): Promise<string | null> {
    return await it_findRecordingFfmpeg(this);
  }

  public async it_detectDefaultInput(ffmpeg: string): Promise<string | null> {
    return await it_detectRecordingInput(this, ffmpeg);
  }

  public async it_runFfmpegProbe(
    ffmpeg: string,
    args: string[],
  ): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
    return await it_probeRecordingFfmpeg(ffmpeg, args, this);
  }

  public async it_listInputs(ffmpeg: string): Promise<string[]> {
    return await it_listRecordingInputs(this, ffmpeg);
  }

  public async it_startNativeRecording(deviceOverride?: string): Promise<{
    tmpDir: string;
    tmpPath: string;
    startedAt: number;
  }> {
    return await it_startHostRecording(this, deviceOverride);
  }

  public async it_stopNativeRecording(): Promise<{
    audio: ItAnalyzeRequest["audio"];
    locked?: string[];
  }> {
    return await it_stopHostRecording(this);
  }

  public async handleAnalyze(
    request: ItAnalyzeRequest,
  ): Promise<ItAnalyzeResponse> {
    return await it_handleHostAnalyze(this, request, IT_EXTENSION_RUNTIME_DEPS);
  }

  dispose(): void {
    it_disposeExtensionHost(this);
  }
}
