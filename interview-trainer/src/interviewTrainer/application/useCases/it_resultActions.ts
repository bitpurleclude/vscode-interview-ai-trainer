import type {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItState,
} from "../../../protocol/interviewTrainer";

export type ItResultUseCaseContext = {
  openFile: (filePath: string) => Promise<void>;
  analyzeAudio: (request: ItAnalyzeRequest) => Promise<ItAnalyzeResponse>;
  getAnalysisAbort: () => { aborted: boolean } | null;
  getState: () => ItState;
  updateState: (next: Partial<ItState>) => void;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function it_openResultFileFromWebview(params: {
  context: ItResultUseCaseContext;
  payload: unknown;
}): Promise<void> {
  const payload = it_asRecord(params.payload);
  const target = String(payload.path || "").trim();
  if (!target) {
    return;
  }
  await params.context.openFile(target);
}

export async function it_analyzeAudioFromWebview(params: {
  context: ItResultUseCaseContext;
  payload: unknown;
}): Promise<ItAnalyzeResponse> {
  return await params.context.analyzeAudio(params.payload as ItAnalyzeRequest);
}

export function it_cancelAnalyzeFromWebview(params: {
  context: ItResultUseCaseContext;
}): { cancelled: true } {
  const abortState = params.context.getAnalysisAbort();
  if (abortState) {
    abortState.aborted = true;
  }

  const state = params.context.getState();
  params.context.updateState({
    statusMessage: "Analysis cancel requested",
    lastError: undefined,
    steps: state.steps.map((step) =>
      step.status === "running"
        ? { ...step, status: "error", progress: step.progress }
        : step,
    ),
  });

  return { cancelled: true };
}
