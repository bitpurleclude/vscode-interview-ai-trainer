import type {
  ItState,
  ItStepState,
  ItStepStatus,
  ItUserError,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type { ItAnalysisSessionPort } from "./it_analysisHostPorts";

const IT_ANALYSIS_SUCCESS_STEPS: ItWorkflowStep[] = [
  "acoustic",
  "asr",
  "segment",
  "notes",
  "evaluation",
  "report",
  "write",
];

export type ItAnalysisSessionHost = ItAnalysisSessionPort;

export type ItAnalysisPartial = {
  transcript?: ItState["draftTranscript"];
  detailedTranscript?: ItState["draftDetailedTranscript"];
  acoustic?: ItState["draftAcoustic"];
  notes?: ItState["draftNotes"];
  questionTimings?: ItState["draftQuestionTimings"];
  questionTimingNote?: ItState["draftQuestionTimingNote"];
  evaluation?: ItState["draftEvaluation"];
};

function it_markRunningStepsAsError(steps: ItStepState[]): ItStepState[] {
  return steps.map((step) =>
    step.status === "running"
      ? { ...step, status: "error", progress: step.progress }
      : step,
  );
}

function it_finalizeAnalysisSession(host: ItAnalysisSessionHost): void {
  host.scheduleEmbeddingWarmup("after-analysis", 3000);
  host.analysisAbort = null;
}

export function it_startAnalysisSession(
  host: ItAnalysisSessionHost,
  runId: string,
): void {
  if (host.embeddingWarmupAbort) {
    host.embeddingWarmupAbort.aborted = true;
  }
  host.analysisAbort = { aborted: false };

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
}

export function it_applyAnalysisPartial(
  host: ItAnalysisSessionHost,
  partial: ItAnalysisPartial,
): void {
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
}

export function it_markAnalysisCorpusClean(host: ItAnalysisSessionHost): void {
  host.corpusDirty = false;
  host.corpusDirtyFiles.clear();
}

export function it_finishAnalysisSessionSuccess(
  host: ItAnalysisSessionHost,
  statusMessage: string,
): void {
  host.updateState({
    statusMessage,
    steps: host.state.steps.map((step) =>
      IT_ANALYSIS_SUCCESS_STEPS.includes(step.id)
        ? { ...step, status: "success", progress: 100 }
        : step,
    ),
    overallProgress: 100,
    lastError: undefined,
  });
  it_finalizeAnalysisSession(host);
}

export function it_finishAnalysisSessionCanceled(
  host: ItAnalysisSessionHost,
  statusMessage: string,
): void {
  host.updateState({
    statusMessage,
    overallProgress: 0,
    lastError: undefined,
    steps: it_markRunningStepsAsError(host.state.steps),
  });
  it_finalizeAnalysisSession(host);
}

export function it_finishAnalysisSessionError(
  host: ItAnalysisSessionHost,
  statusMessage: string,
  userError: ItUserError,
): void {
  host.updateState({
    statusMessage,
    overallProgress: 0,
    lastError: userError,
    steps: it_markRunningStepsAsError(host.state.steps),
  });
  it_finalizeAnalysisSession(host);
}
