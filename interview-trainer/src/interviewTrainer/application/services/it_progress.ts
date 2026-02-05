import {
  ItEmbeddingWarmupState,
  ItState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";

export const IT_STATUS_INIT: ItState = {
  statusMessage: "等待开始面试训练",
  overallProgress: 0,
  recordingState: "idle",
  draftTranscript: undefined,
  draftDetailedTranscript: undefined,
  draftAcoustic: undefined,
  draftNotes: undefined,
  draftQuestionTimings: undefined,
  draftQuestionTimingNote: undefined,
  draftEvaluation: undefined,
  embeddingWarmup: {
    status: "idle",
    progress: 0,
    total: 0,
    done: 0,
  },
  steps: [
    { id: "init", status: "success", progress: 100 },
    { id: "question", status: "pending", progress: 0 },
    { id: "recording", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "segment", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ],
};

export const IT_PROGRESS_WEIGHTS: Partial<Record<ItWorkflowStep, number>> = {
  question: 0.05,
  asr: 0.35,
  acoustic: 0.15,
  segment: 0.05,
  notes: 0.1,
  evaluation: 0.2,
  report: 0.05,
  write: 0.05,
};

export function it_buildRunSteps(): ItStepState[] {
  return IT_STATUS_INIT.steps.map((step) => ({
    ...step,
    status: (step.id === "init" ? "success" : "pending") as ItStepStatus,
    progress: step.id === "init" ? 100 : 0,
    message: undefined,
  }));
}

export function it_computeOverallProgress(steps: ItStepState[]): number {
  let weighted = 0;
  let totalWeight = 0;
  for (const step of steps) {
    const weight = IT_PROGRESS_WEIGHTS[step.id];
    if (!weight) {
      continue;
    }
    totalWeight += weight;
    const progress = Math.max(0, Math.min(100, step.progress || 0));
    weighted += weight * (progress / 100);
  }
  if (!totalWeight) {
    return 0;
  }
  return Math.round((weighted / totalWeight) * 100);
}

export function it_updateProgress(
  host: {
    state: ItState;
    updateState: (next: Partial<ItState>) => void;
    computeOverallProgress: (steps: ItStepState[]) => number;
  },
  update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  },
): void {
  const steps = host.state.steps.map((step) => {
    if (step.id !== update.step) {
      return step;
    }
    return {
      ...step,
      status: update.status ?? step.status,
      progress: Math.max(0, Math.min(100, Math.round(update.progress))),
      message: update.message ?? step.message,
    };
  });
  const overallProgress = host.computeOverallProgress(steps);
  host.updateState({
    steps,
    overallProgress,
    statusMessage: update.message ?? host.state.statusMessage,
  });
}

export function it_updateEmbeddingWarmupState(
  host: {
    state: ItState;
    updateState: (next: Partial<ItState>) => void;
  },
  next: Partial<ItEmbeddingWarmupState>,
): void {
  const current = host.state.embeddingWarmup || {
    status: "idle",
    progress: 0,
    total: 0,
    done: 0,
  };
  host.updateState({
    embeddingWarmup: {
      ...current,
      ...next,
      updatedAt: new Date().toISOString(),
    },
  });
}
