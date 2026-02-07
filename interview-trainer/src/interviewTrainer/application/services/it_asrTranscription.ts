import type { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";
import {
  it_executeTemplate,
  type ItTemplateRuntime,
} from "./it_templateGateway";
import { it_createTraceLogger } from "./it_traceGateway";
import { it_splitPcmBase64 } from "./it_recordingGateway";
import {
  it_buildAsrTemplateVars,
  it_transcribePcmWithChunks,
  type ItAsrProgressReporter,
} from "../../domain/analyze/asr";

async function it_requestAsrTemplate(
  runtime: ItTemplateRuntime,
  variables: Record<string, unknown>,
  options: { maxRetries: number; timeoutSec: number },
): Promise<string> {
  const result = await it_executeTemplate({
    runtime,
    variables,
    maxRetries: options.maxRetries,
    timeoutSec: options.timeoutSec,
    stream: false,
  });
  if (typeof result.text === "string") {
    return result.text;
  }
  if (typeof result.value === "string") {
    return result.value;
  }
  return "";
}

export async function it_transcribeAudio(
  request: ItAnalyzeRequest,
  asrCfg: Record<string, unknown>,
  templateRuntime: ItTemplateRuntime | null,
  reportProgress: ItAsrProgressReporter,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): Promise<string> {
  const trace = it_createTraceLogger(onTrace);
  const asrProvider = String(asrCfg.provider || "baidu_vop");
  const asrLabel = asrProvider === "mock" ? "mock" : "api";
  reportProgress("asr", 0, `asr 0% - ${asrLabel}`, "running");

  if (asrProvider === "mock") {
    const mockText = String(asrCfg.mock_text || "");
    reportProgress("asr", 100, `asr 100% - ${asrLabel}`, "success");
    return mockText;
  }

  if (!templateRuntime) {
    throw new Error("ASR template is not bound.");
  }

  const { vars, runtimeConfig, maxChunkSec, maxConcurrency, audioUrl } = it_buildAsrTemplateVars(
    request,
    asrCfg,
  );

  let transcript = "";
  if (audioUrl) {
    reportProgress("asr", 25, `asr 25% - ${asrLabel}`, "running");
    await trace.logTemplateRequest(
      "asr_transcription",
      templateRuntime,
      { ...vars, audioUrl },
      { stream: false, timeoutSec: runtimeConfig.timeoutSec },
    );

    try {
      transcript = await it_requestAsrTemplate(
        templateRuntime,
        { ...vars, audioUrl },
        {
          maxRetries: runtimeConfig.maxRetries,
          timeoutSec: runtimeConfig.timeoutSec,
        },
      );
    } catch (err) {
      trace.logTemplateError("asr_transcription", templateRuntime, err);
      throw err;
    }
  } else if (request.audio.format === "pcm" && request.audio.byteLength > 0) {
    await trace.logTemplateRequest("asr_transcription", templateRuntime, vars, {
      stream: false,
      timeoutSec: runtimeConfig.timeoutSec,
    });

    try {
      transcript = await it_transcribePcmWithChunks({
        runtimeConfig,
        base64: request.audio.base64,
        sampleRate: request.audio.sampleRate,
        maxChunkSec,
        maxConcurrency,
        splitChunks: it_splitPcmBase64,
        requestChunk: async (chunkVars) => {
          return await it_requestAsrTemplate(
            templateRuntime,
            chunkVars,
            {
              maxRetries: runtimeConfig.maxRetries,
              timeoutSec: runtimeConfig.timeoutSec,
            },
          );
        },
        onProgress: (done, total) => {
          const percent = total ? Math.round((done / total) * 100) : 0;
          reportProgress("asr", percent, `asr ${percent}% - ${asrLabel}`, "running");
        },
      });
    } catch (err) {
      trace.logTemplateError("asr_transcription", templateRuntime, err);
      throw err;
    }
  } else {
    reportProgress("asr", 25, `asr 25% - ${asrLabel}`, "running");
    await trace.logTemplateRequest("asr_transcription", templateRuntime, vars, {
      stream: false,
      timeoutSec: runtimeConfig.timeoutSec,
    });

    try {
      transcript = await it_requestAsrTemplate(
        templateRuntime,
        vars,
        {
          maxRetries: runtimeConfig.maxRetries,
          timeoutSec: runtimeConfig.timeoutSec,
        },
      );
    } catch (err) {
      trace.logTemplateError("asr_transcription", templateRuntime, err);
      throw err;
    }
  }

  trace.logTemplateResponse("asr_transcription", templateRuntime, { text: transcript });
  reportProgress("asr", 100, `asr 100% - ${asrLabel}`, "success");
  return transcript;
}
