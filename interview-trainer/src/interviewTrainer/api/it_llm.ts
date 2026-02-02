import axios from "axios";
import { ItQianfanConfig, ItQianfanMessage, it_callQianfanChat } from "./it_qianfan";

export type ItLlmProvider = "baidu_qianfan" | "volc_doubao" | string;

export interface ItLlmConfig extends ItQianfanConfig {
  provider: ItLlmProvider;
  antiRepeat?: boolean;
}

export type ItLlmMessage = ItQianfanMessage;

function it_withNonce(messages: ItLlmMessage[]): ItLlmMessage[] {
  const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const next = messages.map((msg) => ({ ...msg }));
  for (let i = next.length - 1; i >= 0; i -= 1) {
    if (next[i].role === "user") {
      next[i] = {
        ...next[i],
        content: `${next[i].content}\n\n[nonce:${nonce}]`,
      };
      return next;
    }
  }
  next.push({ role: "user", content: `[nonce:${nonce}]` });
  return next;
}

async function it_callDoubaoChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  const base = (cfg.baseUrl || "https://ark.cn-beijing.volces.com").trim().replace(/\/$/, "");
  const lower = base.toLowerCase();
  const url =
    lower.includes("/api/v3/chat/completions") || lower.endsWith("/chat/completions")
      ? base
      : lower.endsWith("/api/v3")
        ? `${base}/chat/completions`
        : lower.endsWith("/api/v3/chat")
          ? `${base}/completions`
          : `${base}/api/v3/chat/completions`;
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
  const resolvedMessages = cfg.antiRepeat ? it_withNonce(messages) : messages;
  const provider = cfg.provider || "baidu_qianfan";
  if (provider === "baidu_qianfan") {
    return it_callQianfanChat(cfg, resolvedMessages);
  }
  if (provider === "volc_doubao") {
    return it_callDoubaoChat(cfg, resolvedMessages);
  }
  throw new Error(`不支持的 LLM 提供方: ${provider}`);
}
