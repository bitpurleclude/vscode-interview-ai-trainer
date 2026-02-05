import { ItAnalyzeRequest, ItAnalyzeResponse, ItStepStatus } from "../../../protocol/interviewTrainer";
import { it_runAnalysis } from "../flows/analyze/flow";

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
    if (host.embeddingWarmupAbort) {
      host.embeddingWarmupAbort.aborted = true;
    }
    host.analysisAbort = { aborted: false };
    const runId = request.runId || new Date().toISOString();
    const steps = host.buildRunSteps().map((step) => {
      if (step.id === "recording") {
        return { ...step, status: "success" as ItStepStatus, progress: 100 };
      }
      if (step.id === "asr") {
        return { ...step, status: "running" as ItStepStatus, progress: 0 };
      }
      return step;
    });
    host.updateState({
      statusMessage: `Analysis started (runId: ${runId})`,
      steps,
      overallProgress: host.computeOverallProgress(steps),
      lastError: undefined,
      draftTranscript: undefined,
      draftDetailedTranscript: undefined,
      draftAcoustic: undefined,
      draftNotes: undefined,
      draftQuestionTimings: undefined,
      draftQuestionTimingNote: undefined,
      draftEvaluation: undefined,
    });

    host.configBundle = host.configService.loadBundle();
    host.configBundle = await host.configService.ensureTemplatesConfig(host.configBundle);
    host.configBundle.api = host.resolveApiConfigWithProviders(host.configBundle.api);
    const workspaceRoot = host.requireWorkspaceRoot();
    const response = await it_runAnalysis(
      {
        context: host.context,
        apiConfig: host.configBundle.api,
        templatesConfig: host.configBundle.templates,
        skillConfig: {
          ...host.configBundle.skill,
          providers: host.configBundle.providers,
        },
        workspaceRoot,
        onProgress: (update) => host.updateProgress(update),
        onPartial: (partial) => {
          host.updateState({
            draftTranscript: partial.transcript ?? host.state.draftTranscript ?? undefined,
            draftDetailedTranscript:
              partial.detailedTranscript ?? host.state.draftDetailedTranscript ?? undefined,
            draftAcoustic: partial.acoustic ?? host.state.draftAcoustic ?? undefined,
            draftNotes: partial.notes ?? host.state.draftNotes ?? undefined,
            draftQuestionTimings:
              partial.questionTimings ?? host.state.draftQuestionTimings ?? undefined,
            draftQuestionTimingNote:
              partial.questionTimingNote ?? host.state.draftQuestionTimingNote ?? undefined,
            draftEvaluation: partial.evaluation ?? host.state.draftEvaluation ?? undefined,
          });
        },
        corpusDirty: host.corpusDirty,
        corpusDirtyFiles: Array.from(host.corpusDirtyFiles),
        onCorpusTrace: (message, detail) => host.logCorpusTrace(message, detail),
        onStream: (update) => host.emitStreamUpdate(update),
        onEvalStream: (update) => host.emitEvaluationStreamUpdate(update),
        abortSignal: host.analysisAbort ?? undefined,
      },
      request,
    );

    host.corpusDirty = false;
    host.corpusDirtyFiles.clear();

    host.updateState({
      statusMessage: "分析完成，可保存与复盘",
      steps: host.state.steps.map((step) =>
        [
          "acoustic",
          "asr",
          "segment",
          "notes",
          "evaluation",
          "report",
          "write",
        ].includes(step.id)
          ? { ...step, status: "success", progress: 100 }
          : step,
      ),
      overallProgress: 100,
      lastError: undefined,
    });

    host.scheduleEmbeddingWarmup("after-analysis", 3000);
    host.analysisAbort = null;
    return response;
  } catch (error) {
    if (error instanceof Error && error.message && error.message.includes("?????")) {
      host.updateState({
        statusMessage: "?????",
        overallProgress: 0,
        lastError: undefined,
        steps: host.state.steps.map((step) =>
          step.status === "running"
            ? { ...step, status: "error", progress: step.progress }
            : step,
        ),
      });
      host.scheduleEmbeddingWarmup("after-analysis", 3000);
      host.analysisAbort = null;
      throw error;
    }
    host.updateState({
      statusMessage: "分析失败，请检查API配置与音频格式",
      overallProgress: 0,
      lastError: {
        type: "analysis",
        reason: error instanceof Error ? error.message : "未知错误",
        solution: "请检查API Key/Secret、网络连接，以及音频格式。",
      },
      steps: host.state.steps.map((step) =>
        step.status === "running"
          ? { ...step, status: "error", progress: step.progress }
          : step,
      ),
    });
    host.scheduleEmbeddingWarmup("after-analysis", 3000);
    host.analysisAbort = null;
    throw error;
  }
}
