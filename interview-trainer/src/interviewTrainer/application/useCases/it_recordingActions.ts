import type { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";
import { it_convertAudioToPcmBase64 } from "../services/it_recordingGateway";

export type ItRecordingUseCaseContext = {
  findFfmpeg: () => Promise<string | null>;
  listInputs: (ffmpeg: string) => Promise<string[]>;
  startNativeRecording: (
    device?: string,
  ) => Promise<{ tmpDir: string; tmpPath: string; startedAt: number }>;
  stopNativeRecording: () => Promise<{
    audio: ItAnalyzeRequest["audio"];
    locked?: string[];
  }>;
  resetNativeInputs: () => void;
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
};

type ItRecordingTraceLevel = "debug" | "info" | "warn" | "error";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceRecording(
  context: ItRecordingUseCaseContext,
  event: string,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItRecordingTraceLevel = "info",
): void {
  context.logCorpusTrace?.(`recording ${action} ${status}`, {
    event,
    status,
    level,
    module: "it_recordingActions",
    ...(detail || {}),
  });
}

export async function it_startNativeRecordingFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ tmpDir: string; tmpPath: string; startedAt: number }> {
  const payload = it_asRecord(params.payload);
  const device = payload.device ? String(payload.device) : undefined;
  it_traceRecording(
    params.context,
    "application.recording.start_native",
    "start_native",
    "start",
    {
      device: device || "",
      hasDevice: Boolean(device),
    },
  );

  try {
    const result = await params.context.startNativeRecording(device);
    it_traceRecording(
      params.context,
      "application.recording.start_native",
      "start_native",
      "success",
      {
        hasDevice: Boolean(device),
        tmpPath: result.tmpPath,
      },
    );
    return result;
  } catch (error) {
    it_traceRecording(
      params.context,
      "application.recording.start_native",
      "start_native",
      "error",
      {
        hasDevice: Boolean(device),
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_stopNativeRecordingFromWebview(params: {
  context: ItRecordingUseCaseContext;
}): Promise<{ audio: ItAnalyzeRequest["audio"]; locked?: string[] }> {
  it_traceRecording(
    params.context,
    "application.recording.stop_native",
    "stop_native",
    "start",
  );
  try {
    const result = await params.context.stopNativeRecording();
    it_traceRecording(
      params.context,
      "application.recording.stop_native",
      "stop_native",
      "success",
      {
        format: result.audio.format,
        sampleRate: Number(result.audio.sampleRate),
        byteLength: Number(result.audio.byteLength),
        lockedCount: Array.isArray(result.locked) ? result.locked.length : 0,
      },
    );
    return result;
  } catch (error) {
    it_traceRecording(
      params.context,
      "application.recording.stop_native",
      "stop_native",
      "error",
      {
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_listNativeInputsFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ inputs: string[] }> {
  const payload = it_asRecord(params.payload);
  const refresh = Boolean(payload.refresh);
  if (refresh) {
    params.context.resetNativeInputs();
  }

  it_traceRecording(
    params.context,
    "application.recording.list_inputs",
    "list_inputs",
    "start",
    { refresh },
    "debug",
  );

  const ffmpeg = await params.context.findFfmpeg();
  if (!ffmpeg) {
    it_traceRecording(
      params.context,
      "application.recording.list_inputs",
      "list_inputs",
      "error",
      {
        refresh,
        errorCode: "ffmpeg_not_found",
      },
      "error",
    );
    throw new Error("未检测到 ffmpeg，请先安装或配置 ffmpeg。");
  }

  try {
    const inputs = await params.context.listInputs(ffmpeg);
    it_traceRecording(
      params.context,
      "application.recording.list_inputs",
      "list_inputs",
      "success",
      {
        refresh,
        inputCount: inputs.length,
      },
      "debug",
    );
    return { inputs };
  } catch (error) {
    it_traceRecording(
      params.context,
      "application.recording.list_inputs",
      "list_inputs",
      "error",
      {
        refresh,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_convertAudioToPcmFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ base64: string; byteLength: number; durationSec: number }> {
  const payload = it_asRecord(params.payload);
  const base64 = String(payload.base64 || "");
  const ext = String(payload.ext || "m4a").replace(/[^a-z0-9]/gi, "");
  if (!base64) {
    it_traceRecording(
      params.context,
      "application.recording.convert_audio",
      "convert_audio",
      "error",
      { errorCode: "audio_bytes_missing", ext },
      "error",
    );
    throw new Error("missing audio bytes");
  }

  it_traceRecording(
    params.context,
    "application.recording.convert_audio",
    "convert_audio",
    "start",
    {
      ext,
      base64Length: base64.length,
    },
  );

  const ffmpeg = await params.context.findFfmpeg();
  if (!ffmpeg) {
    it_traceRecording(
      params.context,
      "application.recording.convert_audio",
      "convert_audio",
      "error",
      {
        ext,
        base64Length: base64.length,
        errorCode: "ffmpeg_not_found",
      },
      "error",
    );
    throw new Error(
      "未检测到 ffmpeg。请先安装 ffmpeg，或手动上传 WAV(16kHz 单声道) 后再分析",
    );
  }

  try {
    const result = await it_convertAudioToPcmBase64(ffmpeg, base64, ext);
    it_traceRecording(
      params.context,
      "application.recording.convert_audio",
      "convert_audio",
      "success",
      {
        ext,
        base64Length: base64.length,
        byteLength: result.byteLength,
        durationSec: result.durationSec,
      },
    );
    return result;
  } catch (error) {
    it_traceRecording(
      params.context,
      "application.recording.convert_audio",
      "convert_audio",
      "error",
      {
        ext,
        base64Length: base64.length,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}
