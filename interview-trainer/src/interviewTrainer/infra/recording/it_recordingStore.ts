import fs from "fs";
import path from "path";
import { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";
import { it_decodePcm16 } from "../utils/it_audio";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";

export async function it_storeRecordingAsync(
  topicDir: string,
  attemptIndex: number,
  audio: ItAnalyzeRequest["audio"],
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = audio.format === "pcm" ? "wav" : audio.format;
  const tempPath = path.join(
    topicDir,
    `attempt-${String(attemptIndex).padStart(2, "0")}-${timestamp}.${ext}`,
  );
  if (audio.format === "pcm") {
    const pcm = it_decodePcm16(audio.base64);
    const wavBuffer = it_pcm16ToWavBuffer(pcm, audio.sampleRate, 1);
    await fs.promises.writeFile(tempPath, wavBuffer);
  } else {
    const buffer = Buffer.from(audio.base64, "base64");
    await fs.promises.writeFile(tempPath, buffer);
  }
  return tempPath;
}

export function it_splitPcmBase64(
  base64: string,
  sampleRate: number,
  maxChunkSec: number,
): Array<{ speech: string; len: number }> {
  const buffer = Buffer.from(base64, "base64");
  const bytesPerSecond = sampleRate * 2;
  const chunkBytes = Math.max(1, Math.floor(bytesPerSecond * maxChunkSec));
  const chunks: Array<{ speech: string; len: number }> = [];
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const slice = buffer.subarray(offset, offset + chunkBytes);
    chunks.push({ speech: slice.toString("base64"), len: slice.length });
  }
  return chunks;
}
