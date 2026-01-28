import axios from "axios";
import { ItQianfanConfig, ItQianfanMessage, it_callQianfanChat } from "./it_qianfan";

export type ItLlmProvider = "baidu_qianfan" | "volc_doubao" | string;

export interface ItLlmConfig extends ItQianfanConfig {
  provider: ItLlmProvider;
}

export type ItLlmMessage = ItQianfanMessage;

async function it_callDoubaoChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  const base = cfg.baseUrl || "https://ark.cn-beijing.volces.com";
  const url = `${base.replace(/\/$/, "")}/api/v3/chat/completions`;
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = {
    model: cfg.model || "doubao-1-5-pro-32k-250115",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
      });
      const text =
        response.data?.choices?.[0]?.message?.content ??
        response.data?.choices?.[0]?.delta?.content ??
        "";
      return String(text || "");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Doubao chat request failed.");
}

export async function it_callLlmChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  const provider = cfg.provider || "baidu_qianfan";
  if (provider === "baidu_qianfan") {
    return it_callQianfanChat(cfg, messages);
  }
  if (provider === "volc_doubao") {
    return it_callDoubaoChat(cfg, messages);
  }
  throw new Error(`不支持的 LLM 提供方: ${provider}`);
}
