import type * as vscode from "vscode";
import type {
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type { ItApiConfig, ItTemplatesConfig } from "../../infra/api/it_apiConfig";

export interface ItAnalyzeDeps {
  context: vscode.ExtensionContext;
  apiConfig: ItApiConfig;
  templatesConfig: ItTemplatesConfig;
  skillConfig: Record<string, any>;
  workspaceRoot: string;
  onProgress?: (update: ItAnalyzeProgress) => void;
  onPartial?: (partial: {
    transcript?: string;
    detailedTranscript?: string;
    acoustic?: ItAcousticMetrics;
    notes?: ItNoteHit[];
    questionTimings?: ItQuestionTiming[];
    questionTimingNote?: string;
    evaluation?: ItEvaluation;
  }) => void;
  onStream?: (update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  onEvalStream?: (update: {
    questionIndex: number;
    text: string;
    done?: boolean;
    reset?: boolean;
  }) => void;
  onCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
  corpusDirty?: boolean;
  corpusDirtyFiles?: string[];
  abortSignal?: { aborted: boolean };
}

export interface ItAnalyzeProgress {
  step: ItWorkflowStep;
  progress: number;
  message?: string;
  status?: ItStepStatus;
}

export type ItQuestionState = {
  text: string;
  list: string[];
};
