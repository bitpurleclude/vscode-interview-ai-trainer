import { ItAnalyzeRequest, ItAnalyzeResponse, ItStepStatus } from "../../../protocol/interviewTrainer";
import { it_runAnalysis } from "../flows/analyze/flow";
import {
  it_applyAnalysisPartial,
  it_finishAnalysisSessionCanceled,
  it_finishAnalysisSessionError,
  it_finishAnalysisSessionSuccess,
  it_markAnalysisCorpusClean,
  it_startAnalysisSession,
} from "../services/it_analysisSessionState";

export type ItAnalysisHost = {
  context: import("vscode").ExtensionContext;
  configService: import("../../infra/api/it_configService").ItConfigService;
  configBundle: import("../../infra/api/it_apiConfig").ItConfigBundle;
  state: import("../../../protocol/interviewTrainer").ItState;
  analysisAbort: { aborted: boolean } | null;
  embeddingWarmupAbort: { aborted: boolean } | null;
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
  buildRunSteps: () => import("../../../protocol/interviewTrainer").ItStepState[];
  computeOverallProgress: (steps: import("../../../protocol/interviewTrainer").ItStepState[]) => number;
  updateState: (next: Partial<import("../../../protocol/interviewTrainer").ItState>) => void;
  updateProgress: (update: {
    step: import("../../../protocol/interviewTrainer").ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }) => void;
  emitStreamUpdate: (update: {
    step: import("../../../protocol/interviewTrainer").ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  emitEvaluationStreamUpdate: (update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  requireWorkspaceRoot: () => string;
  resolveApiConfigWithProviders: (apiConfig: import("../../infra/api/it_apiConfig").ItApiConfig) => import("../../infra/api/it_apiConfig").ItApiConfig;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
};

export async function it_handleAnalyze(
  host: ItAnalysisHost,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  try {
    const runId = request.runId || new Date().toISOString();
    it_startAnalysisSession(host, runId);

    host.configBundle = host.configService.loadBundle();
    host.configBundle = await host.configService.ensureTemplatesConfig(host.configBundle);
    host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);

    const workspaceRoot = host.requireWorkspaceRoot();
    const activeEnv = host.configBundle.api.active?.environment || "prod";
    const envConfig = host.configBundle.api.environments?.[activeEnv] || {};
    const envAsr = envConfig.asr || {};

    const response = await it_runAnalysis(
      {
        context: host.context,
        apiConfig: host.configBundle.api,
        templatesConfig: host.configBundle.templates,
        skillConfig: {
          ...host.configBundle.skill,
          asr: {
            ...envAsr,
            ...(host.configBundle.skill.asr || {}),
          },
          providers: host.configBundle.providers,
        },
        workspaceRoot,
        onProgress: (update) => host.updateProgress(update),
        onPartial: (partial) => it_applyAnalysisPartial(host, partial),
        corpusDirty: host.corpusDirty,
        corpusDirtyFiles: Array.from(host.corpusDirtyFiles),
        onCorpusTrace: (message, detail) => host.logCorpusTrace(message, detail),
        onStream: (update) => host.emitStreamUpdate(update),
        onEvalStream: (update) => host.emitEvaluationStreamUpdate(update),
        abortSignal: host.analysisAbort ?? undefined,
      },
      request,
    );

    it_markAnalysisCorpusClean(host);
    it_finishAnalysisSessionSuccess(host, "分析完成，可保存与复盘");
    return response;
  } catch (error) {
    if (error instanceof Error && error.message && error.message.includes("?????")) {
      it_finishAnalysisSessionCanceled(host, "?????");
      throw error;
    }

    it_finishAnalysisSessionError(host, "分析失败，请检查API配置与音频格式", {
      type: "analysis",
      reason: error instanceof Error ? error.message : "未知错误",
      solution: "请检查API Key/Secret、网络连接，以及音频格式。",
    });
    throw error;
  }
}
