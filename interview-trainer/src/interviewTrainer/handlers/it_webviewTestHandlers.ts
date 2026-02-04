import { it_callLlmChat } from "../api/it_llm";
import type { ItLlmConfig, ItLlmMessage } from "../api/it_llmTypes";
import {
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest,
} from "../api/it_requestBuilder";
import { it_callBaiduAsr } from "../api/it_baidu";
import { it_callVolcAsr } from "../api/it_volc_asr";
import { it_callEmbedding } from "../api/it_embedding";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";
import {
  it_executeTemplate,
  it_renderTemplateRequest,
  it_resolveTemplateById,
} from "../api/it_templateExecutor";

function it_maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = { ...headers };
  Object.keys(masked).forEach((key) => {
    const lower = key.toLowerCase();
    if (lower === "authorization") {
      const value = masked[key] || "";
      masked[key] = value.startsWith("Bearer ") ? "Bearer ***" : "***";
      return;
    }
    if (lower === "x-api-key" || lower === "x-goog-api-key" || lower === "api-key") {
      masked[key] = "***";
    }
  });
  return masked;
}

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_buildTemplateTestVariables(payload: any): Record<string, unknown> {
  const inputText = String(payload?.inputText || "");
  const base: Record<string, unknown> = {};
  if (inputText) {
    base.input = inputText;
    base.embeddingInput = inputText;
    base.messages = [{ role: "user", content: inputText }];
  }
  if (typeof payload?.stream === "boolean") {
    base.stream = payload.stream;
  }
  const extra = it_isPlainObject(payload?.variables) ? payload.variables : {};
  return {
    ...base,
    ...extra,
  };
}

function it_emitLlmTestRequest(
  host: ItWebviewHandlersHost,
  detail: Record<string, unknown>,
): void {
  const stamp = new Date().toISOString();
  host.outputChannel.appendLine(`[${stamp}] LLM test request`);
  try {
    host.outputChannel.appendLine(JSON.stringify(detail, null, 2));
  } catch {
    host.outputChannel.appendLine(String(detail));
  }
  host.outputChannel.show(true);
}

export function it_registerTestHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testLlm", async (msg) => {
    const payload = msg.data || {};
    const llmForm = payload.llm || {};
    const provider = llmForm.provider || "baidu_qianfan";
    const defaultBase =
      provider === "volc_doubao"
        ? "https://ark.cn-beijing.volces.com"
        : "https://qianfan.baidubce.com/v2";
    const defaultModel =
      provider === "volc_doubao"
        ? "doubao-seed-1-8-251228"
        : "ernie-4.5-turbo-128k";

    const cfg: ItLlmConfig = {
      provider,
      apiKey: llmForm.apiKey || "",
      baseUrl: llmForm.baseUrl || defaultBase,
      model: llmForm.model || defaultModel,
      temperature: Number(llmForm.temperature ?? 0.8),
      topP: Number(llmForm.topP ?? 0.8),
      timeoutSec: Number(llmForm.timeoutSec ?? 30),
      maxRetries: Number(llmForm.maxRetries ?? 0),
      antiRepeat: Boolean(llmForm.antiRepeat ?? false),
      useResponses: Boolean(llmForm.useResponses ?? false),
      apiMode: llmForm.apiMode,
      responsesPath: llmForm.responsesPath,
      toolsPreset: llmForm.toolsPreset,
      tools: llmForm.tools,
      include: llmForm.include,
      store: typeof llmForm.store === "boolean" ? llmForm.store : undefined,
      promptCacheKey: llmForm.promptCacheKey,
      webSearch: Boolean(llmForm.webSearch ?? false),
      reasoningEffort: llmForm.reasoningEffort,
      maxOutputTokens: Number(llmForm.maxOutputTokens ?? 0),
      reusePrefix: Boolean(llmForm.reusePrefix ?? false),
      stream: Boolean(llmForm.stream ?? llmForm.stream_enabled ?? true),
    };
    if (!cfg.apiKey) {
      throw new Error("缺少 LLM API Key");
    }
    try {
      const messages: ItLlmMessage[] = [
        { role: "system", content: "你是健康检查助手，请用12个字内回复“接口可用”" },
        { role: "user", content: "ping" },
      ];
      const apiMode = cfg.apiMode || (cfg.useResponses ? "responses" : "chat");
      let requestDetail: Record<string, unknown> | null = null;
      if (provider === "openai_compatible") {
        const spec =
          apiMode === "responses"
            ? it_buildOpenAiResponsesRequest(cfg, messages, undefined, false)
            : it_buildOpenAiChatRequest(cfg, messages, false);
        requestDetail = {
          url: spec.url,
          headers: it_maskHeaders(spec.headers),
          payload: spec.payload,
        };
      } else if (provider === "volc_doubao") {
        const spec =
          apiMode === "responses"
            ? it_buildDoubaoResponsesRequest(cfg, messages)
            : it_buildDoubaoChatRequest(cfg, messages, false);
        requestDetail = {
          url: spec.url,
          headers: it_maskHeaders(spec.headers),
          payload: spec.payload,
        };
      } else {
        requestDetail = {
          provider,
          baseUrl: cfg.baseUrl,
          model: cfg.model,
          messages,
        };
      }
      it_emitLlmTestRequest(host, requestDetail);
      const content = await it_callLlmChat(cfg, messages);
      return { ok: true, content };
    } catch (error) {
      host.logLlmTestFailure(error, {
        config: { ...cfg, apiKey: cfg.apiKey ? "***" : "" },
      });
      throw error;
    }
  });
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
        const enablePunc =
          asrForm.enable_punc ?? asrForm.enablePunc ?? true;
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
  host.webviewProtocol.on("it/testEmbedding", async (msg) => {
    const embedForm = msg.data?.embedding || {};
    const provider = embedForm.provider || "volc_doubao";
    const cfg = {
      provider,
      apiKey: embedForm.apiKey || "",
      baseUrl: embedForm.baseUrl || "",
      model: embedForm.model || "",
      timeoutSec: Number(embedForm.timeoutSec ?? 30),
      maxRetries: Number(embedForm.maxRetries ?? 0),
    };
    if (!cfg.apiKey) {
      throw new Error("缺少 Embedding API Key");
    }
    if (!cfg.baseUrl || !cfg.model) {
      throw new Error("请填写 Embedding Base URL 与模型");
    }
    try {
      const vectors = await it_callEmbedding(cfg, ["embedding test"]);
      const length = vectors?.[0]?.length || 0;
      return { ok: true, length };
    } catch (error) {
      host.logEmbeddingTestFailure(error);
      throw error;
    }
  });

  host.webviewProtocol.on("it/testTemplateDryRun", async (msg) => {
    const payload = msg.data || {};
    const templateId = String(payload.templateId || "").trim();
    if (!templateId) {
      throw new Error("缺少模板 ID");
    }
    host.configBundle = host.configService.loadBundle();
    const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const environment =
      payload.environment ||
      host.configBundle.api?.active?.environment ||
      "prod";
    const template = it_resolveTemplateById(templatesConfig, environment, templateId);
    if (!template) {
      throw new Error("模板不存在或未加载");
    }
    const runtime = { template, environment, context: host.context };
    const variables = it_buildTemplateTestVariables(payload);
    const requestPreview = await it_renderTemplateRequest({
      runtime,
      variables,
      maskSecrets: true,
    });
    return {
      request: {
        ...requestPreview,
        headers: it_maskHeaders(requestPreview.headers),
      },
      missing: requestPreview.missing,
    };
  });

  host.webviewProtocol.on("it/testTemplateLive", async (msg) => {
    const payload = msg.data || {};
    const templateId = String(payload.templateId || "").trim();
    if (!templateId) {
      throw new Error("缺少模板 ID");
    }
    host.configBundle = host.configService.loadBundle();
    const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const environment =
      payload.environment ||
      host.configBundle.api?.active?.environment ||
      "prod";
    const template = it_resolveTemplateById(templatesConfig, environment, templateId);
    if (!template) {
      throw new Error("模板不存在或未加载");
    }
    const runtime = { template, environment, context: host.context };
    const variables = it_buildTemplateTestVariables(payload);
    const preview = await it_renderTemplateRequest({ runtime, variables });
    if (preview.missing.length) {
      throw new Error(`模板变量缺失: ${preview.missing.join(", ")}`);
    }
    const runId = String(payload.runId || "");
    const result = await it_executeTemplate({
      runtime,
      variables,
      onDelta: (delta, full) => {
        host.webviewProtocol.send("it/templateTestDelta", {
          runId,
          delta,
          full,
        });
      },
    });
    return {
      runId,
      result,
    };
  });
}
