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
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
};

type ItResultTraceLevel = "debug" | "info" | "warn" | "error";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceResult(
  context: ItResultUseCaseContext,
  event: string,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItResultTraceLevel = "info",
): void {
  context.logCorpusTrace?.(`result ${action} ${status}`, {
    event,
    status,
    level,
    module: "it_resultActions",
    ...(detail || {}),
  });
}

function it_validateAnalyzeRequest(payload: unknown): string | null {
  if (!it_isPlainObject(payload)) {
    return "payload_not_object";
  }
  const audio = payload.audio;
  if (!it_isPlainObject(audio)) {
    return "audio_not_object";
  }
  const base64 = audio.base64;
  const format = audio.format;
  const sampleRate = Number(audio.sampleRate);
  const byteLength = Number(audio.byteLength);
  if (typeof base64 !== "string" || !base64.trim()) {
    return "audio_base64_missing";
  }
  if (typeof format !== "string" || !format.trim()) {
    return "audio_format_missing";
  }
  if (!Number.isFinite(sampleRate) || sampleRate <= 0) {
    return "audio_sample_rate_invalid";
  }
  if (!Number.isFinite(byteLength) || byteLength <= 0) {
    return "audio_byte_length_invalid";
  }
  return null;
}

export async function it_openResultFileFromWebview(params: {
  context: ItResultUseCaseContext;
  payload: unknown;
}): Promise<void> {
  const payload = it_asRecord(params.payload);
  const target = String(payload.path || "").trim();
  if (!target) {
    it_traceResult(
      params.context,
      "application.result.open_file",
      "open_file",
      "skipped",
      { reason: "path_missing" },
      "debug",
    );
    return;
  }

  it_traceResult(params.context, "application.result.open_file", "open_file", "start", {
    path: target,
  });

  try {
    await params.context.openFile(target);
    it_traceResult(params.context, "application.result.open_file", "open_file", "success", {
      path: target,
    });
  } catch (error) {
    it_traceResult(
      params.context,
      "application.result.open_file",
      "open_file",
      "error",
      {
        path: target,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_analyzeAudioFromWebview(params: {
  context: ItResultUseCaseContext;
  payload: unknown;
}): Promise<ItAnalyzeResponse> {
  const validationError = it_validateAnalyzeRequest(params.payload);
  if (validationError) {
    it_traceResult(
      params.context,
      "application.result.analyze_audio",
      "analyze_audio",
      "error",
      {
        errorCode: "invalid_analyze_payload",
        reason: validationError,
      },
      "error",
    );
    throw new Error("invalid analyze request payload");
  }

  const request = params.payload as ItAnalyzeRequest;
  const audio = request.audio;
  it_traceResult(params.context, "application.result.analyze_audio", "analyze_audio", "start", {
    runId: request.runId || "",
    format: audio.format,
    sampleRate: Number(audio.sampleRate),
    byteLength: Number(audio.byteLength),
    questionTextLength: String(request.questionText || "").length,
    questionCount: Array.isArray(request.questionList) ? request.questionList.length : 0,
  });

  try {
    const result = await params.context.analyzeAudio(request);
    it_traceResult(params.context, "application.result.analyze_audio", "analyze_audio", "success", {
      runId: request.runId || "",
      reportPath: result.reportPath || "",
      topicDir: result.topicDir || "",
      questionCount: Array.isArray(result.questionList) ? result.questionList.length : 0,
    });
    return result;
  } catch (error) {
    it_traceResult(
      params.context,
      "application.result.analyze_audio",
      "analyze_audio",
      "error",
      {
        runId: request.runId || "",
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export function it_cancelAnalyzeFromWebview(params: {
  context: ItResultUseCaseContext;
}): { cancelled: true } {
  const abortState = params.context.getAnalysisAbort();
  const state = params.context.getState();
  const runningStepCount = state.steps.filter((step) => step.status === "running").length;

  it_traceResult(params.context, "application.result.cancel_analyze", "cancel_analyze", "start", {
    hasAbortState: Boolean(abortState),
    runningStepCount,
  });

  if (abortState) {
    abortState.aborted = true;
  }

  params.context.updateState({
    statusMessage: "Analysis cancel requested",
    lastError: undefined,
    steps: state.steps.map((step) =>
      step.status === "running"
        ? { ...step, status: "error", progress: step.progress }
        : step,
    ),
  });

  it_traceResult(params.context, "application.result.cancel_analyze", "cancel_analyze", "success", {
    hasAbortState: Boolean(abortState),
    runningStepCount,
  });

  return { cancelled: true };
}
