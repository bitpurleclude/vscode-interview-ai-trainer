import {
  it_callBaiduAsr,
  it_callVolcAsr,
  it_pcm16ToWavBuffer,
} from "../../application/services/it_infraBridge";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerAsrTestHandler(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testAsr", async (msg) => {
    const asrForm = msg.data?.asr || {};
    const provider = asrForm.provider || "baidu_vop";
    const normalizedProvider = String(provider || "").toLowerCase();
    const isVolc =
      normalizedProvider === "volc_asr" ||
      normalizedProvider === "volcengine_asr" ||
      normalizedProvider === "volc_doubao";
    const buildRawOutput = (
      error: unknown,
      meta: Record<string, any>,
    ): Record<string, any> => {
      const err = error as any;
      const debug = err?.itDebug || err?.debug || {};
      const response = debug?.response || err?.response?.data || undefined;
      const status = debug?.status || err?.response?.status || undefined;
      const message = err instanceof Error ? err.message : String(err);
      return {
        error: message,
        status,
        response,
        meta,
      };
    };

    try {
      if (provider === "mock") {
        return { ok: true, content: asrForm.mockText || "mock 文本" };
      }
      if (isVolc) {
        if (!asrForm.apiKey || !asrForm.secretKey) {
          throw new Error("缺少火山引擎 ASR 的 App Key 或 Access Key。");
        }
        const modeRaw = String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase();
        const mode = modeRaw === "standard" ? "standard" : "flash";
        const baseUrl = asrForm.baseUrl || "https://openspeech.bytedance.com";
        const resourceId =
          asrForm.resource_id ||
          asrForm.resourceId ||
          (mode === "standard" ? "volc.bigasr.auc" : "volc.bigasr.auc_turbo");
        const modelName = asrForm.model_name || asrForm.modelName || "bigmodel";
        const enablePunc = asrForm.enable_punc ?? asrForm.enablePunc ?? true;
        const userId = asrForm.user_id || asrForm.userId || "it-asr-test";
        const audioUrl = asrForm.audio_url || asrForm.audioUrl || "";

        const sampleRate = 16000;
        const durationSec = 1;
        const pcm = new Int16Array(sampleRate * durationSec);
        const wavBuffer = it_pcm16ToWavBuffer(pcm, sampleRate, 1);
        const audioPayload = audioUrl
          ? { url: audioUrl, format: asrForm.audio_format || asrForm.audioFormat }
          : {
              data: wavBuffer.toString("base64"),
              format: "wav",
              rate: sampleRate,
              bits: 16,
              channel: 1,
            };
        if (mode === "standard" && !audioUrl) {
          throw new Error(
            "火山引擎 ASR 标准版需要 audio_url（可访问的音频地址）。请在 provider 配置中设置 audio_url 或切换到 flash 模式。",
          );
        }
        const text = await it_callVolcAsr(
          {
            appKey: asrForm.apiKey,
            accessKey: asrForm.secretKey,
            baseUrl,
            resourceId,
            modelName,
            enablePunc: Boolean(enablePunc),
            userId,
            mode,
            timeoutSec: Number(asrForm.timeoutSec ?? 30),
            maxRetries: Number(asrForm.maxRetries ?? 0),
            pollIntervalSec: Number(asrForm.poll_interval_sec ?? 1),
            maxPollSec: Number(asrForm.max_poll_sec ?? 60),
          },
          audioPayload,
        );
        return { ok: true, content: text || "(无识别结果，接口可用)" };
      }
      if (provider !== "baidu_vop") {
        throw new Error("当前仅支持百度 ASR 测试。");
      }
      if (!asrForm.apiKey || !asrForm.secretKey) {
        throw new Error("缺少 ASR API Key 或 Secret Key。");
      }
      const sampleRate = 16000;
      const durationSec = 1;
      const buffer = Buffer.alloc(sampleRate * durationSec * 2, 0);
      const base64 = buffer.toString("base64");
      const text = await it_callBaiduAsr(
        {
          apiKey: asrForm.apiKey,
          secretKey: asrForm.secretKey,
          baseUrl: asrForm.baseUrl || "https://vop.baidu.com/server_api",
          devPid: Number(asrForm.devPid ?? 1537),
          language: asrForm.language || "zh",
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
      return { ok: true, content: text || "(无识别结果，接口可用)" };
    } catch (error) {
      const meta = isVolc
        ? {
            provider,
            baseUrl: asrForm.baseUrl || "https://openspeech.bytedance.com",
            mode: String(asrForm.mode || asrForm.volc_mode || "flash"),
            resourceId:
              asrForm.resource_id ||
              asrForm.resourceId ||
              (String(asrForm.mode || asrForm.volc_mode || "flash").toLowerCase() ===
              "standard"
                ? "volc.bigasr.auc"
                : "volc.bigasr.auc_turbo"),
            modelName: asrForm.model_name || asrForm.modelName || "bigmodel",
            audioUrl: asrForm.audio_url || asrForm.audioUrl || "",
          }
        : {
            provider,
            baseUrl: asrForm.baseUrl || "https://vop.baidu.com/server_api",
            language: asrForm.language || "zh",
            devPid: Number(asrForm.devPid ?? 1537),
          };
      return {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
        raw: buildRawOutput(error, meta),
      };
    }
  });
}