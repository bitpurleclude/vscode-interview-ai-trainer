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
import { WebviewProtocol } from "../webview/WebviewProtocol";
import { it_handleAnalyze } from "./application/useCases/it_analysisFlow";
import {
  it_buildConfigSnapshot,
  it_normalizeWorkspaceKey,
  it_refreshConfigSnapshot,
  it_updateCorpusWatchers,
} from "./application/services/it_configSnapshot";
import {
  it_isIdleForWarmup,
  it_runEmbeddingWarmup,
  it_scheduleEmbeddingWarmup,
} from "./application/useCases/it_embeddingWarmup";
import { ItTokenService } from "./application/services/it_tokens";
import {
  it_emitEvaluationStreamUpdate,
  it_emitStreamUpdate,
  it_logCorpusTrace,
  it_logEmbeddingTestFailure,
  it_logLlmTestFailure,
} from "./application/services/it_logging";
import {
  IT_STATUS_INIT,
  it_buildRunSteps,
  it_computeOverallProgress,
  it_updateEmbeddingWarmupState,
  it_updateProgress,
} from "./application/services/it_progress";
import {
  it_detectDefaultInput,
  it_findFfmpeg,
  it_listInputs,
  it_runFfmpegProbe,
  it_startNativeRecording,
  it_stopNativeRecording,
} from "./infra/recording/it_recording";
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

export class InterviewTrainerExtension implements vscode.Disposable {
  public state: ItState = { ...IT_STATUS_INIT };
  public configSnapshot: ItConfigSnapshot;
  public configBundle: ItConfigBundle;
  public configService: ItConfigService;
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
  public outputChannel: vscode.OutputChannel;
  public embeddingWarmupTimer: ReturnType<typeof setTimeout> | null = null;
  public embeddingWarmupAbort: { aborted: boolean } | null = null;
  public embeddingWarmupRunning = false;
  public analysisAbort: { aborted: boolean } | null = null;
  public corpusDirty = true;
  public corpusDirtyFiles = new Set<string>();
  public corpusWatchers: vscode.FileSystemWatcher[] = [];
  public tokenService: ItTokenService;

  constructor(
    public readonly context: vscode.ExtensionContext,
    public readonly webviewProtocol: WebviewProtocol,
  ) {
    this.outputChannel = vscode.window.createOutputChannel("Interview Trainer");
    this.configService = new ItConfigService(this.context);
    this.configBundle = this.configService.loadBundle();
    this.tokenService = new ItTokenService(this);
    this.tokenService.sync();
    this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
    this.updateCorpusWatchers();
    this.registerHandlers();
    this.scheduleEmbeddingWarmup("startup");
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
    this.state = { ...this.state, ...nextState };
    this.webviewProtocol.send("it/stateUpdate", this.state);
  }

  public updateEmbeddingWarmup(next: Partial<ItEmbeddingWarmupState>): void {
    it_updateEmbeddingWarmupState(this, next);
  }

  public isIdleForWarmup(): boolean {
    return it_isIdleForWarmup(this);
  }

  public scheduleEmbeddingWarmup(reason: string, delayMs: number = 2500): void {
    it_scheduleEmbeddingWarmup(this, reason, delayMs);
  }

  public async runEmbeddingWarmup(reason: string): Promise<void> {
    await it_runEmbeddingWarmup(this, reason);
  }

  public resolveApiConfigWithProviders(apiConfig: ItApiConfig): ItApiConfig {
    return it_resolveApiConfigWithProviders(this.configBundle, apiConfig);
  }

  public buildRunSteps(): ItStepState[] {
    return it_buildRunSteps();
  }

  public computeOverallProgress(steps: ItStepState[]): number {
    return it_computeOverallProgress(steps);
  }


  public updateProgress(update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }): void {
    it_updateProgress(this, update);
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
    return await it_findFfmpeg();
  }

  public async it_detectDefaultInput(ffmpeg: string): Promise<string | null> {
    return await it_detectDefaultInput(this, ffmpeg);
  }

  public async it_runFfmpegProbe(
    ffmpeg: string,
    args: string[],
  ): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
    return await it_runFfmpegProbe(ffmpeg, args);
  }

  public async it_listInputs(ffmpeg: string): Promise<string[]> {
    return await it_listInputs(this, ffmpeg);
  }

  public async it_startNativeRecording(deviceOverride?: string): Promise<{
    tmpDir: string;
    tmpPath: string;
    startedAt: number;
  }> {
    return await it_startNativeRecording(this, deviceOverride);
  }

  public async it_stopNativeRecording(): Promise<{
    audio: ItAnalyzeRequest["audio"];
    locked?: string[];
  }> {
    return await it_stopNativeRecording(this);
  }

  public async handleAnalyze(
    request: ItAnalyzeRequest,
  ): Promise<ItAnalyzeResponse> {
    return await it_handleAnalyze(this, request);
  }

  dispose(): void {
    it_disposeExtensionHost(this);
  }
}
