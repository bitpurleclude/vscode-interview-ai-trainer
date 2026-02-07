import {
  it_callLlmChat,
  type ItLlmConfig,
  type ItLlmMessage,
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest,
} from "../../application/services/it_llmGateway";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";
import { it_emitLlmTestRequest, it_maskHeaders } from "./it_webviewTestHelpers";

const DEFAULT_TEST_SYSTEM = "你是健康检查助手，请用12个字内回复“接口可用”。";

export function it_registerLlmTestHandler(host: ItWebviewHandlersHost): void {
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
      promptCacheKey: llmForm.promptCacheKey,
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
        { role: "system", content: DEFAULT_TEST_SYSTEM },
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
}