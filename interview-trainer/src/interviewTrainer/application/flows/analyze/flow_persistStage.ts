import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../../protocol/interviewTrainer";
import { it_persistAnalysis } from "../../services/it_analysisPersistence";

type FlowTrace = (
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level?: "debug" | "info" | "warn" | "error",
) => void;

type PersistStageInput = {
  questionText: string;
  questionList: string[];
  topicTitle: string;
  topicDir: string;
  reportPath: string;
  attemptIndex: number;
  response: ItAnalyzeResponse;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
  shouldAbort?: () => boolean;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
  traceFlow: FlowTrace;
};

function it_flowErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function it_runPersistStage({
  questionText,
  questionList,
  topicTitle,
  topicDir,
  reportPath,
  attemptIndex,
  response,
  reportProgress,
  shouldAbort,
  onTrace,
  traceFlow,
}: PersistStageInput): Promise<void> {
  const persistStageStartedAt = Date.now();
  traceFlow(
    "persist_stage",
    "start",
    {
      reportPath,
      topicDir,
      attemptIndex,
    },
    "debug",
  );
  try {
    await it_persistAnalysis({
      questionText,
      questionList,
      topicTitle,
      topicDir,
      reportPath,
      attemptIndex,
      response,
      reportProgress,
      onTrace,
      shouldAbort,
    });
    traceFlow(
      "persist_stage",
      "success",
      {
        durationMs: Date.now() - persistStageStartedAt,
        reportPath,
        topicDir,
        attemptIndex,
      },
    );
  } catch (error) {
    traceFlow(
      "persist_stage",
      "error",
      {
        durationMs: Date.now() - persistStageStartedAt,
        reportPath,
        topicDir,
        attemptIndex,
        errorCode: "persist_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
  }
}
