import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import { it_runAnalysis } from "../flows/analyze/flow";
import {
  it_applyAnalysisPartial,
  it_finishAnalysisSessionCanceled,
  it_finishAnalysisSessionError,
  it_finishAnalysisSessionSuccess,
  it_markAnalysisCorpusClean,
  it_startAnalysisSession,
} from "../services/it_analysisSessionState";
import { it_prepareAnalysisRunDeps } from "../services/it_analysisRunConfig";
import {
  IT_ANALYSIS_CANCELED_MESSAGE,
  IT_ANALYSIS_FAILED_MESSAGE,
  it_buildAnalysisFailedUserError,
  it_isAnalysisCanceledError,
} from "../services/it_analysisErrors";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";

export type ItAnalysisHost = {
  context: import("vscode").ExtensionContext;
  configService: ItConfigService;
  configBundle: ItConfigBundle;
  state: ItState;
  analysisAbort: { aborted: boolean } | null;
  embeddingWarmupAbort: { aborted: boolean } | null;
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
  buildRunSteps: () => ItStepState[];
  computeOverallProgress: (steps: ItStepState[]) => number;
  updateState: (next: Partial<ItState>) => void;
  updateProgress: (update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }) => void;
  emitStreamUpdate: (update: {
    step: ItWorkflowStep;
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
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
};

export async function it_handleAnalyze(
  host: ItAnalysisHost,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  try {
    const runId = request.runId || new Date().toISOString();
    it_startAnalysisSession(host, runId);

    const deps = await it_prepareAnalysisRunDeps(host, (partial) =>
      it_applyAnalysisPartial(host, partial),
    );
    const response = await it_runAnalysis(deps, request);

    it_markAnalysisCorpusClean(host);
    it_finishAnalysisSessionSuccess(host, "分析完成，可保存与复盘");
    return response;
  } catch (error) {
    if (it_isAnalysisCanceledError(error)) {
      it_finishAnalysisSessionCanceled(host, IT_ANALYSIS_CANCELED_MESSAGE);
      throw error;
    }

    it_finishAnalysisSessionError(
      host,
      IT_ANALYSIS_FAILED_MESSAGE,
      it_buildAnalysisFailedUserError(error),
    );
    throw error;
  }
}
