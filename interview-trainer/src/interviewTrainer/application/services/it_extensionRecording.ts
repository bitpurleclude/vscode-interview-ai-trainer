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

export type ItExtensionRecordingHost = ItRecordingHost;

export async function it_findRecordingFfmpeg(): Promise<string | null> {
  return await it_findFfmpeg();
}

export async function it_detectRecordingInput(
  host: ItExtensionRecordingHost,
  ffmpeg: string,
): Promise<string | null> {
  return await it_detectDefaultInput(host, ffmpeg);
}

export async function it_probeRecordingFfmpeg(
  ffmpeg: string,
  args: string[],
): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
  return await it_runFfmpegProbe(ffmpeg, args);
}

export async function it_listRecordingInputs(
  host: ItExtensionRecordingHost,
  ffmpeg: string,
): Promise<string[]> {
  return await it_listInputs(host, ffmpeg);
}

export async function it_startHostRecording(
  host: ItExtensionRecordingHost,
  deviceOverride?: string,
): Promise<{
  tmpDir: string;
  tmpPath: string;
  startedAt: number;
}> {
  return await it_startNativeRecording(host, deviceOverride);
}

export async function it_stopHostRecording(
  host: ItExtensionRecordingHost,
): Promise<{
  audio: ItAnalyzeRequest["audio"];
  locked?: string[];
}> {
  return await it_stopNativeRecording(host);
}
