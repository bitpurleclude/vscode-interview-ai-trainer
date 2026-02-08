import type { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";
import {
  it_detectDefaultInput,
  it_findFfmpeg,
  it_listInputs,
  it_runFfmpegProbe,
  it_startNativeRecording,
  it_stopNativeRecording,
} from "./it_recordingGateway";
import type { ItRecordingHost } from "./it_recordingGateway";

type ItRecordingTraceHost = ItRecordingHost & {
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
};

function it_recordingTrace(
  host: ItRecordingTraceHost | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  host?.logCorpusTrace?.(`recording ${action} ${status}`, {
    event: `application.recording.${action}`,
    status,
    ...(detail || {}),
  });
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export type ItExtensionRecordingHost = ItRecordingTraceHost;

export async function it_findRecordingFfmpeg(
  host?: ItRecordingTraceHost,
): Promise<string | null> {
  it_recordingTrace(host, "find_ffmpeg", "start");
  try {
    const ffmpeg = await it_findFfmpeg();
    it_recordingTrace(host, "find_ffmpeg", ffmpeg ? "success" : "not_found", {
      found: Boolean(ffmpeg),
    });
    return ffmpeg;
  } catch (error) {
    it_recordingTrace(host, "find_ffmpeg", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_detectRecordingInput(
  host: ItExtensionRecordingHost,
  ffmpeg: string,
): Promise<string | null> {
  it_recordingTrace(host, "detect_input", "start", {
    ffmpeg,
  });
  try {
    const detected = await it_detectDefaultInput(host, ffmpeg);
    it_recordingTrace(host, "detect_input", detected ? "success" : "empty", {
      detected,
    });
    return detected;
  } catch (error) {
    it_recordingTrace(host, "detect_input", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_probeRecordingFfmpeg(
  ffmpeg: string,
  args: string[],
  host?: ItRecordingTraceHost,
): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
  it_recordingTrace(host, "probe", "start", {
    ffmpeg,
    argCount: args.length,
  });
  try {
    const result = await it_runFfmpegProbe(ffmpeg, args);
    it_recordingTrace(host, "probe", "success", {
      exitCode: result.exitCode,
      exitSignal: result.exitSignal,
      stderrLength: result.stderr.length,
    });
    return result;
  } catch (error) {
    it_recordingTrace(host, "probe", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_listRecordingInputs(
  host: ItExtensionRecordingHost,
  ffmpeg: string,
): Promise<string[]> {
  it_recordingTrace(host, "list_inputs", "start", {
    ffmpeg,
  });
  try {
    const inputs = await it_listInputs(host, ffmpeg);
    it_recordingTrace(host, "list_inputs", "success", {
      inputCount: inputs.length,
    });
    return inputs;
  } catch (error) {
    it_recordingTrace(host, "list_inputs", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_startHostRecording(
  host: ItExtensionRecordingHost,
  deviceOverride?: string,
): Promise<{
  tmpDir: string;
  tmpPath: string;
  startedAt: number;
}> {
  it_recordingTrace(host, "start", "start", {
    hasDeviceOverride: Boolean(deviceOverride),
  });
  try {
    const result = await it_startNativeRecording(host, deviceOverride);
    it_recordingTrace(host, "start", "success", {
      tmpPath: result.tmpPath,
      startedAt: result.startedAt,
    });
    return result;
  } catch (error) {
    it_recordingTrace(host, "start", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_stopHostRecording(
  host: ItExtensionRecordingHost,
): Promise<{
  audio: ItAnalyzeRequest["audio"];
  locked?: string[];
}> {
  it_recordingTrace(host, "stop", "start");
  try {
    const result = await it_stopNativeRecording(host);
    it_recordingTrace(host, "stop", "success", {
      byteLength: result.audio.byteLength,
      durationSec: result.audio.durationSec,
      lockedCount: result.locked?.length || 0,
    });
    return result;
  } catch (error) {
    it_recordingTrace(host, "stop", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}
