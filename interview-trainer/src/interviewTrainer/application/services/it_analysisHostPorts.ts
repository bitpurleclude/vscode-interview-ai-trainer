import type { ExtensionContext } from "vscode";
import type {
  ItQuestionEvaluation,
  ItState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "./it_configGateway";

export type ItAnalysisAbortStatePort = {
  analysisAbort: { aborted: boolean } | null;
  embeddingWarmupAbort: { aborted: boolean } | null;
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
};

export type ItAnalysisSessionStatePort = {
  state: ItState;
  buildRunSteps: () => ItStepState[];
  computeOverallProgress: (steps: ItStepState[]) => number;
  updateState: (next: Partial<ItState>) => void;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
};

export type ItAnalysisProgressPort = {
  updateProgress: (update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }) => void;
};

export type ItAnalysisStreamPort = {
  emitStreamUpdate: (update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  emitEvaluationStreamUpdate: (update: {
    questionIndex: number;
    text?: string;
    done?: boolean;
    reset?: boolean;
    snapshot?: ItQuestionEvaluation;
  }) => void;
};

export type ItAnalysisRunRuntimePort = {
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  requireWorkspaceRoot: () => string;
  resolveApiConfigWithProviders: (apiConfig: ItApiConfig) => ItApiConfig;
};

export type ItAnalysisConfigPort = {
  context: ExtensionContext;
  configService: ItConfigService;
  configBundle: ItConfigBundle;
};

export type ItAnalysisSessionPort =
  & ItAnalysisAbortStatePort
  & ItAnalysisSessionStatePort;

export type ItAnalysisRunConfigPort =
  & ItAnalysisAbortStatePort
  & ItAnalysisConfigPort
  & ItAnalysisProgressPort
  & ItAnalysisStreamPort
  & ItAnalysisRunRuntimePort;

export type ItAnalysisUseCasePort =
  & ItAnalysisSessionPort
  & ItAnalysisRunConfigPort;
