import axios from "axios";
import { ItQianfanConfig, ItQianfanMessage, it_callQianfanChat } from "./it_qianfan";

export type ItLlmProvider = "baidu_qianfan" | "volc_doubao" | "openai_compatible" | string;
export type ItLlmReasoningEffort = "minimal" | "low" | "medium" | "high";

export interface ItLlmConfig extends ItQianfanConfig {
  provider: ItLlmProvider;
  antiRepeat?: boolean;
  useResponses?: boolean;
  webSearch?: boolean;
  reasoningEffort?: ItLlmReasoningEffort;
  maxOutputTokens?: number;
  reusePrefix?: boolean;
  stream?: boolean;
}

export type ItLlmMessage = ItQianfanMessage;
export type ItLlmResponse = {
  text: string;
  responseId?: string;
  raw?: any;
};

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
  const payload: any = {
    model: cfg.model || "doubao-seed-1-8-251228",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  if (cfg.reasoningEffort) {
    payload.reasoning_effort = cfg.reasoningEffort;
  }
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_completion_tokens = Number(cfg.maxOutputTokens);
  }

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

async function it_callOpenAiCompatibleChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const lower = base.toLowerCase();
  const url = lower.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload: any = {
    model: cfg.model || "gpt-4.1-mini",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_tokens = Number(cfg.maxOutputTokens);
  }

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
        response.data?.choices?.[0]?.text ??
        "";
      return String(text || "");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI compatible chat request failed.");
}

function it_extractStreamDelta(payload: any): string {
  const delta =
    payload?.choices?.[0]?.delta?.content ??
    payload?.choices?.[0]?.message?.content ??
    payload?.choices?.[0]?.text ??
    payload?.output_text ??
    payload?.text ??
    "";
  return typeof delta === "string" ? delta : "";
}

async function it_consumeSseStream(
  stream: NodeJS.ReadableStream,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";
    const flush = (delta: string) => {
      if (!delta) {
        return;
      }
      fullText += delta;
      onDelta?.(delta, fullText);
    };
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (!data) {
          continue;
        }
        if (data === "[DONE]") {
          resolve(fullText);
          return;
        }
        try {
          const payload = JSON.parse(data);
          const delta = it_extractStreamDelta(payload);
          flush(delta);
        } catch {
          // ignore parse errors
        }
      }
    });
    stream.on("end", () => resolve(fullText));
    stream.on("error", (err) => reject(err));
  });
}

async function it_callOpenAiCompatibleChatStream(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  const base = (cfg.baseUrl || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const lower = base.toLowerCase();
  const url = lower.endsWith("/chat/completions") ? base : `${base}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload: any = {
    model: cfg.model || "gpt-4.1-mini",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    stream: true,
  };
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_tokens = Number(cfg.maxOutputTokens);
  }

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
        responseType: "stream",
      });
      return await it_consumeSseStream(response.data, onDelta);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("OpenAI compatible chat stream failed.");
}

async function it_callDoubaoChatStream(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  onDelta?: (delta: string, full: string) => void,
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
  const payload: any = {
    model: cfg.model || "doubao-seed-1-8-251228",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    stream: true,
  };
  if (cfg.reasoningEffort) {
    payload.reasoning_effort = cfg.reasoningEffort;
  }
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_completion_tokens = Number(cfg.maxOutputTokens);
  }

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
        responseType: "stream",
      });
      return await it_consumeSseStream(response.data, onDelta);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Doubao chat stream failed.");
}

function it_buildDoubaoResponsesUrl(base: string): string {
  const trimmed = (base || "").trim().replace(/\/$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.includes("/api/v3/responses") || lower.endsWith("/responses")) {
    return trimmed;
  }
  if (lower.endsWith("/api/v3")) {
    return `${trimmed}/responses`;
  }
  if (lower.endsWith("/api/v3/")) {
    return `${trimmed}responses`;
  }
  return `${trimmed}/api/v3/responses`;
}

function it_toResponsesInput(messages: ItLlmMessage[]): any[] {
  return messages.map((msg) => ({
    role: msg.role,
    content: [
      {
        type: "input_text",
        text: msg.content,
      },
    ],
  }));
}

function it_extractResponseText(data: any): string {
  const direct = data?.output_text ?? data?.outputText ?? data?.text;
  if (direct) {
    return String(direct);
  }
  const outputs = Array.isArray(data?.output) ? data.output : [];
  if (outputs.length) {
    const chunks: string[] = [];
    outputs.forEach((item: any) => {
      if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
      const content = Array.isArray(item?.content) ? item.content : [];
      content.forEach((part: any) => {
        if (part?.text) {
          chunks.push(String(part.text));
        }
      });
    });
    if (chunks.length) {
      return chunks.join("");
    }
  }
  const chatLike =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    data?.choices?.[0]?.text ??
    "";
  return String(chatLike || "");
}

function it_extractResponseId(data: any): string | undefined {
  const id = data?.response_id ?? data?.id;
  return id ? String(id) : undefined;
}

export async function it_callDoubaoResponses(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: {
    previousResponseId?: string;
    reasoningEffort?: ItLlmReasoningEffort;
    maxOutputTokens?: number;
    webSearch?: boolean;
  },
): Promise<ItLlmResponse> {
  const base = (cfg.baseUrl || "https://ark.cn-beijing.volces.com").trim();
  const url = it_buildDoubaoResponsesUrl(base);
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const input = it_toResponsesInput(messages);
  const payload: any = {
    model: cfg.model || "doubao-seed-1-8-251228",
    input,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  const reasoningEffort = options?.reasoningEffort ?? cfg.reasoningEffort;
  if (reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort };
  }
  const maxOutputTokens = options?.maxOutputTokens ?? cfg.maxOutputTokens;
  if (Number.isFinite(maxOutputTokens) && Number(maxOutputTokens) > 0) {
    payload.max_output_tokens = Number(maxOutputTokens);
  }
  if (options?.previousResponseId) {
    payload.previous_response_id = options.previousResponseId;
  }
  const webSearch = options?.webSearch ?? cfg.webSearch;
  if (webSearch) {
    payload.tools = [{ type: "web_search" }];
  }

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
      });
      return {
        text: it_extractResponseText(response.data),
        responseId: it_extractResponseId(response.data),
        raw: response.data,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Doubao responses request failed.");
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
    if (cfg.useResponses) {
      const resp = await it_callDoubaoResponses(cfg, resolvedMessages);
      return resp.text;
    }
    return it_callDoubaoChat(cfg, resolvedMessages);
  }
  if (provider === "openai_compatible") {
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
  const provider = cfg.provider || "baidu_qianfan";
  const streamEnabled = options?.stream ?? cfg.stream ?? true;
  if (streamEnabled) {
    if (provider === "openai_compatible") {
      return it_callOpenAiCompatibleChatStream(cfg, resolvedMessages, options?.onDelta);
    }
    if (provider === "volc_doubao") {
      const streamCfg = cfg.useResponses ? { ...cfg, useResponses: false } : cfg;
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

