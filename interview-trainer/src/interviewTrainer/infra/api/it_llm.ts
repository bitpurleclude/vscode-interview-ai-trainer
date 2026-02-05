import { it_callQianfanChat } from "./it_qianfan";
import type { ItLlmConfig, ItLlmMessage } from "./it_llmTypes";
import {
  it_callDoubaoChat,
  it_callDoubaoChatStream,
  it_callDoubaoResponses,
} from "./it_llmDoubao";
import {
  it_callOpenAiCompatibleChat,
  it_callOpenAiCompatibleChatStream,
  it_callOpenAiCompatibleResponses,
  it_callOpenAiCompatibleResponsesStream,
} from "./it_llmOpenAi";
import { it_hasTemplateRuntime, it_withNonce } from "./it_llmHelpers";
import { it_callTemplateChat, it_callTemplateChatStreaming } from "./it_llmTemplate";

export { it_callDoubaoResponses } from "./it_llmDoubao";

export async function it_callLlmChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  const resolvedMessages = cfg.antiRepeat ? it_withNonce(messages) : messages;
  if (it_hasTemplateRuntime(cfg)) {
    return await it_callTemplateChat(cfg, resolvedMessages);
  }
  const provider = cfg.provider || "baidu_qianfan";
  const apiMode = cfg.apiMode || (cfg.useResponses ? "responses" : "chat");
  if (provider === "baidu_qianfan") {
    return it_callQianfanChat(cfg, resolvedMessages);
  }
  if (provider === "volc_doubao") {
    if (apiMode === "responses") {
      const resp = await it_callDoubaoResponses(cfg, resolvedMessages);
      return resp.text;
    }
    return it_callDoubaoChat(cfg, resolvedMessages);
  }
  if (provider === "openai_compatible") {
    if (apiMode === "responses") {
      const resp = await it_callOpenAiCompatibleResponses(cfg, resolvedMessages);
      return resp.text;
    }
    return it_callOpenAiCompatibleChat(cfg, resolvedMessages);
  }
  throw new Error(`Unsupported LLM provider: ${provider}`);
}

export async function it_callLlmChatStreaming(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: {
    onDelta?: (delta: string, full: string) => void;
    stream?: boolean;
  },
): Promise<string> {
  const resolvedMessages = cfg.antiRepeat ? it_withNonce(messages) : messages;
  const streamEnabled = options?.stream ?? cfg.stream ?? true;
  if (it_hasTemplateRuntime(cfg)) {
    return await it_callTemplateChatStreaming(
      cfg,
      resolvedMessages,
      streamEnabled,
      options?.onDelta,
    );
  }
  const provider = cfg.provider || "baidu_qianfan";
  const apiMode = cfg.apiMode || (cfg.useResponses ? "responses" : "chat");
  if (streamEnabled) {
    if (provider === "openai_compatible") {
      if (apiMode === "responses") {
        return it_callOpenAiCompatibleResponsesStream(
          cfg,
          resolvedMessages,
          options?.onDelta,
        );
      }
      return it_callOpenAiCompatibleChatStream(cfg, resolvedMessages, options?.onDelta);
    }
    if (provider === "volc_doubao") {
      const streamCfg: ItLlmConfig =
        apiMode === "responses" ? { ...cfg, useResponses: false, apiMode: "chat" } : cfg;
      return it_callDoubaoChatStream(streamCfg, resolvedMessages, options?.onDelta);
    }
  }
  const nonStreamCfg = cfg.antiRepeat ? { ...cfg, antiRepeat: false } : cfg;
  const text = await it_callLlmChat(nonStreamCfg, resolvedMessages);
  if (options?.onDelta) {
    options.onDelta(text, text);
  }
  return text;
}