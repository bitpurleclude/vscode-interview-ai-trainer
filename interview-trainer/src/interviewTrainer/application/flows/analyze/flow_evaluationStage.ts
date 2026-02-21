import type {
  ItAnalyzeRequest,
  ItAudioSegment,
  ItEvaluation,
  ItNoteHit,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../../protocol/interviewTrainer";
import { it_evaluateAnswer } from "../../services/it_evaluation";
import type { ItEvaluationConfig } from "../../services/it_evaluation";
import { it_buildAcousticForTiming, it_mergeEvaluations } from "../../../domain/analyze/evaluation";
import type { ItAnalyzeDeps } from "./flow_types";

type FlowTrace = (
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level?: "debug" | "info" | "warn" | "error",
) => void;

type EvaluationStageInput = {
  deps: ItAnalyzeDeps;
  request: ItAnalyzeRequest;
  questionText: string;
  topicTitle: string;
  questionList: string[];
  questionAnswers?: Array<{ question: string; answer: string }>;
  questionTimings: ItQuestionTiming[];
  audioSegments?: ItAudioSegment[];
  notes: ItNoteHit[];
  notesByQuestion: ItNoteHit[][];
  evaluationConfig: ItEvaluationConfig;
  evalLabel: string;
  evalModeLabel: string;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
  ensureNotAborted: () => void;
  traceFlow: FlowTrace;
};

function it_flowErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function it_runEvaluationStage({
  deps,
  request,
  questionText,
  topicTitle,
  questionList,
  questionAnswers,
  questionTimings,
  audioSegments,
  notes,
  notesByQuestion,
  evaluationConfig,
  evalLabel,
  evalModeLabel,
  reportProgress,
  ensureNotAborted,
  traceFlow,
}: EvaluationStageInput): Promise<ItEvaluation> {
  const timePlan = [4, 3, 3];
  const evalQuestions = questionList.length
    ? questionList
    : questionText
      ? [questionText]
      : [topicTitle];
  const evalAnswers =
    questionAnswers && questionAnswers.length === evalQuestions.length
      ? questionAnswers
      : evalQuestions.map((question) => ({ question, answer: "" }));
  const evalNotes =
    notesByQuestion.length === evalQuestions.length
      ? notesByQuestion
      : evalQuestions.map(() => notes);
  const evalAcoustics = evalQuestions.map((_, idx) =>
    it_buildAcousticForTiming(
      questionTimings[idx],
      audioSegments,
      evalAnswers[idx]?.answer || "",
    ),
  );

  const totalQuestions = evalQuestions.length || 1;
  let completed = 0;
  const baseProgress = 15;
  const spanProgress = 75;
  reportProgress(
    "evaluation",
    baseProgress,
    `Evaluation ${baseProgress}% - generating - ${evalLabel} - ${evalModeLabel}`,
    "running",
  );
  const evaluations: ItEvaluation[] = [];
  const streamEnabled = Boolean(deps.onStream || deps.onEvalStream);
  const evaluationStageStartedAt = Date.now();
  traceFlow(
    "evaluation_stage",
    "start",
    {
      questionCount: evalQuestions.length,
      streamEnabled,
    },
    "debug",
  );

  const it_evaluateQuestionAt = async (question: string, idx: number): Promise<void> => {
    ensureNotAborted();
    const streamHandler = streamEnabled
      ? (update: { text: string; done?: boolean; reset?: boolean }) => {
          deps.onStream?.({ step: "evaluation", ...update });
          deps.onEvalStream?.({ questionIndex: idx, ...update });
        }
      : undefined;
    const result = await it_evaluateAnswer(
      question,
      evalAnswers[idx]?.answer || "",
      evalAcoustics[idx],
      evalNotes[idx] || [],
      evaluationConfig,
      [question],
      [{ question, answer: evalAnswers[idx]?.answer || "" }],
      questionText,
      evalQuestions,
      [
        request.systemPrompt?.trim(),
        request.perQuestionSystemPrompts?.[idx]?.trim(),
      ]
        .filter(Boolean)
        .join("\n\n") || undefined,
      [
        request.demoPrompt?.trim(),
        request.perQuestionDemoPrompts?.[idx]?.trim(),
      ]
        .filter(Boolean)
        .join("\n\n") || undefined,
      deps.onCorpusTrace,
      streamHandler,
    );
    ensureNotAborted();
    evaluations[idx] = result;
    deps.onPartial?.({
      evaluation: it_mergeEvaluations({
        topicTitle: questionText || topicTitle,
        questions: evalQuestions,
        answers: evalAnswers,
        evaluations,
        timePlan,
      }),
    });
    completed += 1;
    const progress = Math.min(
      95,
      baseProgress + Math.round((spanProgress * completed) / totalQuestions),
    );
    reportProgress(
      "evaluation",
      progress,
      `Evaluation ${progress}% - ${evalLabel} - ${evalModeLabel} - ${completed}/${totalQuestions}`,
      "running",
    );
  };

  try {
    for (let idx = 0; idx < evalQuestions.length; idx += 1) {
      await it_evaluateQuestionAt(evalQuestions[idx], idx);
    }
  } catch (error) {
    traceFlow(
      "evaluation_stage",
      "error",
      {
        durationMs: Date.now() - evaluationStageStartedAt,
        questionCount: evalQuestions.length,
        streamEnabled,
        errorCode: "evaluation_stage_failed",
        error: it_flowErrorMessage(error),
      },
      "error",
    );
    throw error;
  }

  const evaluation: ItEvaluation = it_mergeEvaluations({
    topicTitle: questionText || topicTitle,
    questions: evalQuestions,
    answers: evalAnswers,
    evaluations,
    timePlan,
  });
  reportProgress("evaluation", 95, "Evaluation 95% - merge", "running");
  reportProgress("evaluation", 100, `Evaluation 100% - ${evalLabel}`, "success");
  deps.onPartial?.({ evaluation });
  ensureNotAborted();
  traceFlow(
    "evaluation_stage",
    "success",
    {
      durationMs: Date.now() - evaluationStageStartedAt,
      questionCount: evalQuestions.length,
      streamEnabled,
    },
  );

  return evaluation;
}
