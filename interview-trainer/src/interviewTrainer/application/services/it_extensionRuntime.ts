import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItEmbeddingWarmupState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";

export type ItExtensionRuntimeDeps = {
  handleAnalyze: (host: any, request: ItAnalyzeRequest) => Promise<ItAnalyzeResponse>;
  isIdleForWarmup: (host: any) => boolean;
  runEmbeddingWarmup: (host: any, reason: string) => Promise<void>;
  scheduleEmbeddingWarmup: (host: any, reason: string, delayMs?: number) => void;
  buildRunSteps: () => ItStepState[];
  computeOverallProgress: (steps: ItStepState[]) => number;
  updateEmbeddingWarmupState: (
    host: any,
    next: Partial<ItEmbeddingWarmupState>,
  ) => void;
  updateProgress: (
    host: any,
    update: {
      step: ItWorkflowStep;
      progress: number;
      message?: string;
      status?: ItStepStatus;
    },
  ) => void;
};

export function it_buildHostRunSteps(deps: ItExtensionRuntimeDeps): ItStepState[] {
  return deps.buildRunSteps();
}

export function it_computeHostOverallProgress(
  steps: ItStepState[],
  deps: ItExtensionRuntimeDeps,
): number {
  return deps.computeOverallProgress(steps);
}

export function it_updateHostEmbeddingWarmup(
  host: any,
  next: Partial<ItEmbeddingWarmupState>,
  deps: ItExtensionRuntimeDeps,
): void {
  deps.updateEmbeddingWarmupState(host, next);
}

export function it_updateHostProgress(
  host: any,
  update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  },
  deps: ItExtensionRuntimeDeps,
): void {
  deps.updateProgress(host, update);
}

export function it_hostIdleForWarmup(
  host: any,
  deps: ItExtensionRuntimeDeps,
): boolean {
  return deps.isIdleForWarmup(host);
}

export function it_scheduleHostEmbeddingWarmup(
  host: any,
  reason: string,
  delayMs: number = 2500,
  deps: ItExtensionRuntimeDeps,
): void {
  deps.scheduleEmbeddingWarmup(host, reason, delayMs);
}

export async function it_runHostEmbeddingWarmup(
  host: any,
  reason: string,
  deps: ItExtensionRuntimeDeps,
): Promise<void> {
  await deps.runEmbeddingWarmup(host, reason);
}

export async function it_handleHostAnalyze(
  host: any,
  request: ItAnalyzeRequest,
  deps: ItExtensionRuntimeDeps,
): Promise<ItAnalyzeResponse> {
  return await deps.handleAnalyze(host, request);
}
