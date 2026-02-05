import type {
  ItAnalyzeRequest,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type { ItTemplateRuntime } from "../../api/it_templateExecutor";
import { it_requestAsrTemplate } from "../clients/asrClient";
import { it_createTraceLogger } from "../logging/it_traceLogger";
import { it_splitPcmBase64 } from "./audio";

function it_isBaiduContentTooLong(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    message.includes("3310") ||
    lower.includes("content len too long") ||
    lower.includes("content length too long")
  );
}

async function it_transcribePcmWithChunks(
  runtime: ItTemplateRuntime,
  asrConfig: {
    devPid: number;
    language: string;
    timeoutSec: number;
    maxRetries: number;
  },
  base64: string,
  sampleRate: number,
  maxChunkSec: number,
  maxConcurrency: number,
  onProgress?: (processed: number, total: number) => void,
): Promise<string> {
  let chunkSec = Math.max(5, Math.floor(maxChunkSec || 50));
  let lastError: unknown = undefined;
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
    const chunks = it_splitPcmBase64(base64, sampleRate, chunkSec);
    const parts: string[] = new Array(chunks.length);
    let done = 0;
    try {
      await runWithLimit(chunks, resolvedConcurrency, async (chunk, idx) => {
        const part = await it_requestAsrTemplate(
          runtime,
          {
            audioFile: chunk.speech,
            audio: {
              format: "pcm",
              rate: sampleRate,
              sampleRate,
              channel: 1,
              byteLength: chunk.len,
            },
            asr: {
              lang: asrConfig.language,
              dev_pid: asrConfig.devPid,
              language: asrConfig.language,
              devPid: asrConfig.devPid,
            },
          },
          {
            maxRetries: asrConfig.maxRetries,
            timeoutSec: asrConfig.timeoutSec,
          },
        );
        parts[idx] = part;
        done += 1;
        onProgress?.(done, chunks.length);
        return part;
      });
      return parts.join(" ").replace(/\s+/g, " ").trim();
    } catch (err) {
      lastError = err;
      if (it_isBaiduContentTooLong(err) && chunkSec > 5) {
        chunkSec = Math.max(5, Math.floor(chunkSec / 2));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("ASR failed.");
}

export async function it_transcribeAudio(
  request: ItAnalyzeRequest,
  asrCfg: any,
  templateRuntime: ItTemplateRuntime | null,
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): Promise<string> {
  const trace = it_createTraceLogger(onTrace);
  const asrProvider = asrCfg.provider || "baidu_vop";
  const asrLabel = asrProvider === "mock" ? "模拟" : "API";
  reportProgress("asr", 0, `语音转写 0% · ${asrLabel}`, "running");

  if (asrProvider === "mock") {
    const mockText = String(asrCfg.mock_text || "");
    reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
    return mockText;
  }

  if (!templateRuntime) {
    throw new Error("ASR 模板未绑定，无法转写。");
  }

  const language = asrCfg.language || "zh";
  const devPid = Number(asrCfg.dev_pid ?? 1537);
  const timeoutSec = Number(asrCfg.timeout_sec ?? 120);
  const maxRetries = Number(asrCfg.max_retries ?? 1);
  const maxChunkSec = Number(asrCfg.max_chunk_sec ?? 50);
  const maxConcurrency = Number(asrCfg.max_concurrency ?? asrCfg.maxConcurrency ?? 1);
  const audioUrl = asrCfg.audio_url || asrCfg.audioUrl || "";

  const audioMeta = {
    format: request.audio.format,
    rate: request.audio.sampleRate,
    sampleRate: request.audio.sampleRate,
    channel: 1,
    byteLength: request.audio.byteLength,
    durationSec: request.audio.durationSec,
    url: audioUrl || undefined,
  };
  const asrVarsBase = {
    audioFile: request.audio.base64,
    audio: audioMeta,
    asr: {
      lang: language,
      dev_pid: devPid,
      language,
      devPid,
    },
  };

  let transcript = "";
  if (audioUrl) {
    reportProgress("asr", 25, `语音转写 25% · ${asrLabel}`, "running");
    await trace.logTemplateRequest(
      "语音转写",
      templateRuntime,
      { ...asrVarsBase, audioUrl },
      { stream: false, timeoutSec },
    );
    try {
      transcript = await it_requestAsrTemplate(
        templateRuntime,
        { ...asrVarsBase, audioUrl },
        {
          maxRetries,
          timeoutSec,
        },
      );
    } catch (err) {
      trace.logTemplateError("语音转写", templateRuntime, err);
      throw err;
    }
  } else if (request.audio.format === "pcm" && request.audio.byteLength > 0) {
    await trace.logTemplateRequest("语音转写", templateRuntime, asrVarsBase, {
      stream: false,
      timeoutSec,
    });
    try {
      transcript = await it_transcribePcmWithChunks(
        templateRuntime,
        {
          devPid,
          language,
          timeoutSec,
          maxRetries,
        },
        request.audio.base64,
        request.audio.sampleRate,
        maxChunkSec,
        maxConcurrency,
        (done, total) => {
          const percent = total ? Math.round((done / total) * 100) : 0;
          reportProgress(
            "asr",
            percent,
            `语音转写 ${percent}% · ${asrLabel}`,
            "running",
          );
        },
      );
    } catch (err) {
      trace.logTemplateError("语音转写", templateRuntime, err);
      throw err;
    }
  } else {
    reportProgress("asr", 25, `语音转写 25% · ${asrLabel}`, "running");
    await trace.logTemplateRequest("语音转写", templateRuntime, asrVarsBase, {
      stream: false,
      timeoutSec,
    });
    try {
      transcript = await it_requestAsrTemplate(
        templateRuntime,
        asrVarsBase,
        {
          maxRetries,
          timeoutSec,
        },
      );
    } catch (err) {
      trace.logTemplateError("语音转写", templateRuntime, err);
      throw err;
    }
  }

  trace.logTemplateResponse("语音转写", templateRuntime, { text: transcript });
  reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
  return transcript;
}
