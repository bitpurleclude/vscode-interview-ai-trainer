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
import { ItLlmConfig } from "./infra/api/it_llmTypes";
import { WebviewProtocol } from "../webview/WebviewProtocol";
import { it_handleAnalyze } from "./application/useCases/it_analysisFlow";
import {
  it_buildConfigSnapshot,
  it_normalizeWorkspaceKey,
  it_refreshConfigSnapshot,
  it_updateCorpusWatchers,
} from "./core/it_configSnapshot";
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
} from "./core/it_logging";
import {
  IT_STATUS_INIT,
  it_buildRunSteps,
  it_computeOverallProgress,
  it_updateEmbeddingWarmupState,
  it_updateProgress,
} from "./core/it_progress";
import {
  it_detectDefaultInput,
  it_findFfmpeg,
  it_listInputs,
  it_runFfmpegProbe,
  it_startNativeRecording,
  it_stopNativeRecording,
} from "./core/it_recording";
import { it_registerHandlers } from "./handlers/it_webviewHandlers";

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
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
      return folders[0].uri.fsPath;
    }
    void vscode.window.showErrorMessage("请先打开工作区文件夹后再进行分析。");
    throw new Error("workspace not found");
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
    const env = this.configBundle.api.active?.environment || "prod";
    const envConfig = this.configBundle.api.environments?.[env] ?? {};
    const providerId =
      envConfig.llm_provider || envConfig.llm?.provider || this.configBundle.api.active?.llm;
    const providerProfile =
      providerId && this.configBundle.providers?.[providerId]?.llm
        ? this.configBundle.providers?.[providerId]?.llm
        : undefined;
    const baseLlm = {
      ...(providerProfile || {}),
      ...(envConfig.llm || {}),
      provider: providerId || envConfig.llm?.provider,
    };
    const profile =
      profileId && envConfig.llm_profiles ? envConfig.llm_profiles[profileId] : undefined;
    const llm = {
      ...baseLlm,
      ...(profile || {}),
      provider: profile?.provider || baseLlm.provider,
      api_key: profile?.api_key || profile?.apiKey || baseLlm.api_key,
      base_url: profile?.base_url || profile?.baseUrl || baseLlm.base_url,
      model: profile?.model || baseLlm.model,
    };
    const provider = llm.provider || providerId || "openai_compatible";
    const apiKey = llm.api_key || "";
    if (!provider || (!apiKey && !options?.allowMissingAuth)) {
      return null;
    }
    const isDoubao = provider === "volc_doubao";
    const defaultBase = isDoubao
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
    const apiModeRaw = llm.api_mode ?? llm.apiMode;
    const apiMode = apiModeRaw
      ? String(apiModeRaw).toLowerCase() === "responses"
        ? "responses"
        : "chat"
      : undefined;
    const useResponses = apiMode
      ? apiMode === "responses"
      : Boolean(llm.use_responses ?? llm.useResponses ?? (isDoubao ? true : false));
    return {
      provider,
      apiKey,
      baseUrl: llm.base_url || defaultBase,
      model:
        llm.model ||
        (isDoubao ? "doubao-seed-1-8-251228" : "ernie-4.5-turbo-128k"),
      temperature: Number(llm.temperature ?? 0.8),
      topP: Number(llm.top_p ?? 0.8),
      timeoutSec: Number(llm.timeout_sec ?? 60),
      maxRetries: Number(llm.max_retries ?? 1),
      antiRepeat: Boolean(llm.anti_repeat ?? llm.antiRepeat ?? false),
      useResponses,
      apiMode,
      responsesPath: llm.responses_path ?? llm.responsesPath ?? "",
      toolsPreset: llm.tools_preset ?? llm.toolsPreset ?? "",
      webSearch: Boolean(
        llm.web_search ?? llm.webSearch ?? (isDoubao ? true : false),
      ),
      reasoningEffort:
        llm.reasoning_effort ?? llm.reasoningEffort ?? (isDoubao ? "medium" : undefined),
      maxOutputTokens: Number(llm.max_output_tokens ?? llm.maxOutputTokens ?? 800),
      reusePrefix: Boolean(
        llm.reuse_prefix ?? llm.reusePrefix ?? (isDoubao ? true : false),
      ),
      stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
    };
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
    const env = apiConfig.active?.environment || "prod";
    const envConfig = apiConfig.environments?.[env] ?? {};
    const providers = this.configBundle.providers || {};
    const llmProvider =
      envConfig.llm_provider || envConfig.llm?.provider || apiConfig.active?.llm;
    const asrProvider =
      envConfig.asr_provider || envConfig.asr?.provider || apiConfig.active?.asr;
    const llmProfile = llmProvider ? providers[llmProvider]?.llm : undefined;
    const asrProfile = asrProvider ? providers[asrProvider]?.asr : undefined;
    const mergedLlm = llmProfile
      ? {
          ...llmProfile,
          ...(envConfig.llm || {}),
          provider: llmProvider,
        }
      : envConfig.llm;
    const mergedAsr = asrProfile
      ? {
          ...asrProfile,
          ...(envConfig.asr || {}),
          provider: asrProvider,
        }
      : envConfig.asr;
    return {
      ...apiConfig,
      environments: {
        ...apiConfig.environments,
        [env]: {
          ...envConfig,
          llm: mergedLlm,
          asr: mergedAsr,
        },
      },
    };
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
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return "";
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
    if (this.embeddingWarmupTimer) {
      clearTimeout(this.embeddingWarmupTimer);
      this.embeddingWarmupTimer = null;
    }
    if (this.embeddingWarmupAbort) {
      this.embeddingWarmupAbort.aborted = true;
      this.embeddingWarmupAbort = null;
    }
    if (this.recordingChild && !this.recordingChild.killed) {
      try {
        this.recordingChild.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
    this.recordingChild = null;
    this.outputChannel.dispose();
  }
}
