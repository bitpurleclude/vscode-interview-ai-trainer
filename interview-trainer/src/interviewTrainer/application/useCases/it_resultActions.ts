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


function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_isValidAnalyzeRequest(payload: unknown): payload is ItAnalyzeRequest {
  if (!it_isPlainObject(payload)) {
    return false;
  }
  const audio = payload.audio;
  if (!it_isPlainObject(audio)) {
    return false;
  }
  const base64 = audio.base64;
  const format = audio.format;
  const sampleRate = Number(audio.sampleRate);
  const byteLength = Number(audio.byteLength);
  if (typeof base64 !== "string" || !base64.trim()) {
    return false;
  }
  if (typeof format !== "string" || !format.trim()) {
    return false;
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return false;
  }
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    return false;
  }
  return true;
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
  if (!it_isValidAnalyzeRequest(params.payload)) {
    throw new Error("invalid analyze request payload");
  }
  return await params.context.analyzeAudio(params.payload);
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
