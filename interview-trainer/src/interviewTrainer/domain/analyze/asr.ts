import type { ItAnalyzeRequest, ItStepStatus, ItWorkflowStep } from "../../../protocol/interviewTrainer";

export type ItAsrTemplateRequestVars = {
  audioFile: string;
  audio: {
    format: string;
    rate: number;
    sampleRate: number;
    channel: number;
    byteLength: number;
    durationSec?: number;
    url?: string;
  };
  asr: {
    lang: string;
    dev_pid: number;
    language: string;
    devPid: number;
  };
  audioUrl?: string;
};

export type ItAsrRuntimeConfig = {
  devPid: number;
  language: string;
  timeoutSec: number;
  maxRetries: number;
};

export type ItPcmChunk = {
  speech: string;
  len: number;
};

export type ItAsrProgressReporter = (
  step: ItWorkflowStep,
  progress: number,
  message?: string,
  status?: ItStepStatus,
) => void;

export function it_isBaiduContentTooLong(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    message.includes("3310") ||
    lower.includes("content len too long") ||
    lower.includes("content length too long")
  );
}

export function it_buildAsrTemplateVars(
  request: ItAnalyzeRequest,
  asrCfg: Record<string, unknown>,
): {
  vars: ItAsrTemplateRequestVars;
  runtimeConfig: ItAsrRuntimeConfig;
  maxChunkSec: number;
  maxConcurrency: number;
  audioUrl: string;
} {
  const language = String(asrCfg.language || "zh");
  const devPid = Number(asrCfg.dev_pid ?? 1537);
  const timeoutSec = Number(asrCfg.timeout_sec ?? 120);
  const maxRetries = Number(asrCfg.max_retries ?? 1);
  const maxChunkSec = Number(asrCfg.max_chunk_sec ?? 50);
  const maxConcurrency = Number(asrCfg.max_concurrency ?? asrCfg.maxConcurrency ?? 1);
  const audioUrl = String(asrCfg.audio_url || asrCfg.audioUrl || "");

  const vars: ItAsrTemplateRequestVars = {
    audioFile: request.audio.base64,
    audio: {
      format: request.audio.format,
      rate: request.audio.sampleRate,
      sampleRate: request.audio.sampleRate,
      channel: 1,
      byteLength: request.audio.byteLength,
      durationSec: request.audio.durationSec,
      url: audioUrl || undefined,
    },
    asr: {
      lang: language,
      dev_pid: devPid,
      language,
      devPid,
    },
  };

  return {
    vars,
    runtimeConfig: {
      devPid,
      language,
      timeoutSec,
      maxRetries,
    },
    maxChunkSec,
    maxConcurrency,
    audioUrl,
  };
}

export async function it_transcribePcmWithChunks(params: {
  runtimeConfig: ItAsrRuntimeConfig;
  base64: string;
  sampleRate: number;
  maxChunkSec: number;
  maxConcurrency: number;
  splitChunks: (base64: string, sampleRate: number, chunkSec: number) => ItPcmChunk[];
  requestChunk: (vars: ItAsrTemplateRequestVars) => Promise<string>;
  onProgress?: (processed: number, total: number) => void;
}): Promise<string> {
  const {
    runtimeConfig,
    base64,
    sampleRate,
    maxChunkSec,
    maxConcurrency,
    splitChunks,
    requestChunk,
    onProgress,
  } = params;

  let chunkSec = Math.max(5, Math.floor(maxChunkSec || 50));
  const resolvedConcurrency = Number.isFinite(maxConcurrency)
    ? Math.max(1, Math.floor(maxConcurrency))
    : 1;

  const runWithLimit = async <T, R>(
    list: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    const results: R[] = new Array(list.length);
    let cursor = 0;
    const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(list[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  };

  for (;;) {
    const chunks = splitChunks(base64, sampleRate, chunkSec);
    const parts: string[] = new Array(chunks.length);
    let done = 0;

    try {
      await runWithLimit(chunks, resolvedConcurrency, async (chunk, idx) => {
        const part = await requestChunk({
          audioFile: chunk.speech,
          audio: {
            format: "pcm",
            rate: sampleRate,
            sampleRate,
            channel: 1,
            byteLength: chunk.len,
          },
          asr: {
            lang: runtimeConfig.language,
            dev_pid: runtimeConfig.devPid,
            language: runtimeConfig.language,
            devPid: runtimeConfig.devPid,
          },
        });

        parts[idx] = part;
        done += 1;
        onProgress?.(done, chunks.length);
        return part;
      });
      return parts.join(" ").replace(/\s+/g, " ").trim();
    } catch (err) {
      if (it_isBaiduContentTooLong(err) && chunkSec > 5) {
        chunkSec = Math.max(5, Math.floor(chunkSec / 2));
        continue;
      }
      throw err;
    }
  }
}
