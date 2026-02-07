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
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function it_startNativeRecordingFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ tmpDir: string; tmpPath: string; startedAt: number }> {
  const payload = it_asRecord(params.payload);
  const device = payload.device ? String(payload.device) : undefined;
  return params.context.startNativeRecording(device);
}

export async function it_stopNativeRecordingFromWebview(params: {
  context: ItRecordingUseCaseContext;
}): Promise<{ audio: ItAnalyzeRequest["audio"]; locked?: string[] }> {
  return params.context.stopNativeRecording();
}

export async function it_listNativeInputsFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ inputs: string[] }> {
  const payload = it_asRecord(params.payload);
  if (Boolean(payload.refresh)) {
    params.context.resetNativeInputs();
  }

  const ffmpeg = await params.context.findFfmpeg();
  if (!ffmpeg) {
    throw new Error("未检测到 ffmpeg，请先安装或配置 ffmpeg。");
  }
  const inputs = await params.context.listInputs(ffmpeg);
  return { inputs };
}

export async function it_convertAudioToPcmFromWebview(params: {
  context: ItRecordingUseCaseContext;
  payload: unknown;
}): Promise<{ base64: string; byteLength: number; durationSec: number }> {
  const payload = it_asRecord(params.payload);
  const base64 = String(payload.base64 || "");
  const ext = String(payload.ext || "m4a").replace(/[^a-z0-9]/gi, "");
  if (!base64) {
    throw new Error("missing audio bytes");
  }

  const ffmpeg = await params.context.findFfmpeg();
  if (!ffmpeg) {
    throw new Error(
      "未检测到 ffmpeg。请先安装 ffmpeg，或手动上传 WAV(16kHz 单声道) 后再分析",
    );
  }

  return it_convertAudioToPcmBase64(ffmpeg, base64, ext);
}
