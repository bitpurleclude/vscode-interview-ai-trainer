import { it_callBaiduAsr, it_callVolcAsr } from "../services/it_asrGateway";
import { it_pcm16ToWavBuffer } from "../services/it_textGateway";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceAsr(
  onTrace: ((message: string, detail?: Record<string, unknown>) => void) | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.(`test_asr ${action} ${status}`, {
    event: `application.test_asr.${action}`,
    status,
    ...(detail || {}),
  });
}

export async function it_testAsr(params: {
  payload: unknown;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
}): Promise<Record<string, unknown>> {
  const payload = it_asRecord(params.payload);
  const asrForm = it_asRecord(payload.asr);
  const provider = String(asrForm.provider || "baidu_vop");
  const normalizedProvider = provider.toLowerCase();
  const isVolc =
    normalizedProvider === "volc_asr" ||
    normalizedProvider === "volcengine_asr" ||
    normalizedProvider === "volc_doubao";
  const start = Date.now();

  it_traceAsr(params.onTrace, "run", "start", {
    provider,
    isVolc,
  });

  const buildRawOutput = (
    error: unknown,
    meta: Record<string, unknown>,
  ): Record<string, unknown> => {
    const errAny = error as any;
    const debug = errAny?.itDebug || errAny?.debug || {};
    const response = debug?.response || errAny?.response?.data || undefined;
    const status = debug?.status || errAny?.response?.status || undefined;
    const message = error instanceof Error ? error.message : String(error);
    return {
      error: message,
      status,
      response,
      meta,
    };
  };

  try {
    if (provider === "mock") {
      const content = String(asrForm.mockText || "mock text");
      it_traceAsr(params.onTrace, "run", "success", {
        provider,
        mode: "mock",
        textLength: content.length,
        durationMs: Date.now() - start,
      });
      return { ok: true, content };
    }

    if (isVolc) {
      const apiKey = String(asrForm.apiKey || "");
      const secretKey = String(asrForm.secretKey || "");
      if (!apiKey || !secretKey) {
        throw new Error("Missing volc ASR app key/access key.");
      }

      const modeRaw = String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase();
      const mode = modeRaw === "standard" ? "standard" : "flash";
      const baseUrl = String(asrForm.baseUrl || "https://openspeech.bytedance.com");
      const resourceId =
        String(asrForm.resource_id || asrForm.resourceId || "") ||
        (mode === "standard" ? "volc.bigasr.auc" : "volc.bigasr.auc_turbo");
      const modelName = String(asrForm.model_name || asrForm.modelName || "bigmodel");
      const enablePunc = Boolean(asrForm.enable_punc ?? asrForm.enablePunc ?? true);
      const userId = String(asrForm.user_id || asrForm.userId || "it-asr-test");
      const audioUrl = String(asrForm.audio_url || asrForm.audioUrl || "");

      const sampleRate = 16000;
      const durationSec = 1;
      const pcm = new Int16Array(sampleRate * durationSec);
      const wavBuffer = it_pcm16ToWavBuffer(pcm, sampleRate, 1);
      const audioFormat = String(asrForm.audio_format || asrForm.audioFormat || "");
      const audioPayload = audioUrl
        ? { url: audioUrl, format: audioFormat || undefined }
        : {
            data: wavBuffer.toString("base64"),
            format: "wav",
            rate: sampleRate,
            bits: 16,
            channel: 1,
          };

      if (mode === "standard" && !audioUrl) {
        throw new Error("Volc standard mode requires audio_url.");
      }

      const text = await it_callVolcAsr(
        {
          appKey: apiKey,
          accessKey: secretKey,
          baseUrl,
          resourceId,
          modelName,
          enablePunc,
          userId,
          mode,
          timeoutSec: Number(asrForm.timeoutSec ?? 30),
          maxRetries: Number(asrForm.maxRetries ?? 0),
          pollIntervalSec: Number(asrForm.poll_interval_sec ?? 1),
          maxPollSec: Number(asrForm.max_poll_sec ?? 60),
        },
        audioPayload,
      );
      const content = text || "(no asr result, but api reachable)";
      it_traceAsr(params.onTrace, "run", "success", {
        provider,
        mode,
        baseUrl,
        textLength: content.length,
        durationMs: Date.now() - start,
      });
      return { ok: true, content };
    }

    if (provider !== "baidu_vop") {
      throw new Error("Only baidu_vop is supported in this test mode.");
    }

    const apiKey = String(asrForm.apiKey || "");
    const secretKey = String(asrForm.secretKey || "");
    if (!apiKey || !secretKey) {
      throw new Error("Missing ASR apiKey/secretKey.");
    }

    const sampleRate = 16000;
    const durationSec = 1;
    const buffer = Buffer.alloc(sampleRate * durationSec * 2, 0);
    const base64 = buffer.toString("base64");

    const text = await it_callBaiduAsr(
      {
        apiKey,
        secretKey,
        baseUrl: String(asrForm.baseUrl || "https://vop.baidu.com/server_api"),
        devPid: Number(asrForm.devPid ?? 1537),
        language: String(asrForm.language || "zh"),
        timeoutSec: Number(asrForm.timeoutSec ?? 30),
        maxRetries: Number(asrForm.maxRetries ?? 0),
      },
      {
        format: "pcm",
        rate: sampleRate,
        channel: 1,
        cuid: "it-asr-test",
        speech: base64,
        len: buffer.length,
      },
    );
    const content = text || "(no asr result, but api reachable)";
    it_traceAsr(params.onTrace, "run", "success", {
      provider,
      mode: "baidu_vop",
      textLength: content.length,
      durationMs: Date.now() - start,
    });
    return { ok: true, content };
  } catch (error) {
    const meta = isVolc
      ? {
          provider,
          baseUrl: String(asrForm.baseUrl || "https://openspeech.bytedance.com"),
          mode: String(asrForm.mode || asrForm.volc_mode || "flash"),
          resourceId:
            String(asrForm.resource_id || asrForm.resourceId || "") ||
            (String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase() === "standard"
              ? "volc.bigasr.auc"
              : "volc.bigasr.auc_turbo"),
          modelName: String(asrForm.model_name || asrForm.modelName || "bigmodel"),
          audioUrl: String(asrForm.audio_url || asrForm.audioUrl || ""),
        }
      : {
          provider,
          baseUrl: String(asrForm.baseUrl || "https://vop.baidu.com/server_api"),
          language: String(asrForm.language || "zh"),
          devPid: Number(asrForm.devPid ?? 1537),
        };

    it_traceAsr(params.onTrace, "run", "error", {
      provider,
      error: it_errorMessage(error),
      durationMs: Date.now() - start,
    });

    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      raw: buildRawOutput(error, meta),
    };
  }
}
