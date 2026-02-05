import axios from "axios";
import { it_callQianfanChat } from "./it_qianfan";
import { it_executeLlmTemplate } from "./it_templateExecutor";
import { ItLlmConfig, ItLlmMessage, ItLlmResponse } from "./it_llmTypes";
import {
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest,
  ItLlmRequestOptions,
} from "./it_requestBuilder";

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
  const { url, headers, payload } = it_buildDoubaoChatRequest(cfg, messages, false);

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
  const { url, headers, payload } = it_buildOpenAiChatRequest(cfg, messages, false);

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

function it_hasTemplateRuntime(cfg: ItLlmConfig): boolean {
  return Boolean(cfg.template && cfg.templateContext && cfg.templateEnv);
}

function it_buildTemplateVariables(
  cfg: ItLlmConfig,
  streamEnabled: boolean,
): Record<string, unknown> {
  return {
    temperature: cfg.temperature,
    topP: cfg.topP,
    reasoningEffort: cfg.reasoningEffort,
    maxOutputTokens: cfg.maxOutputTokens,
    reusePrefix: cfg.reusePrefix,
    stream: streamEnabled,
    promptCacheKey: cfg.promptCacheKey,
    ...(cfg.templateVars || {}),
  };
}

function it_extractStreamDelta(payload: any): string {
  const eventType = payload?.type;
  if (typeof eventType === "string") {
    if (eventType.includes("output_text.delta") && typeof payload?.delta === "string") {
      return payload.delta;
    }
    if (eventType.includes("output_text.done")) {
      return "";
    }
  }
  const delta =
    payload?.delta ??
    payload?.output_text?.delta ??
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
  const { url, headers, payload } = it_buildOpenAiChatRequest(cfg, messages, true);

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
  const { url, headers, payload } = it_buildDoubaoChatRequest(cfg, messages, true);

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

async function it_callOpenAiCompatibleResponses(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
): Promise<ItLlmResponse> {
  const { url, headers, payload } = it_buildOpenAiResponsesRequest(
    cfg,
    messages,
    options,
    false,
  );

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
    : new Error("OpenAI compatible responses request failed.");
}

async function it_callOpenAiCompatibleResponsesStream(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  onDelta?: (delta: string, full: string) => void,
  options?: ItLlmRequestOptions,
): Promise<string> {
  const { url, headers, payload } = it_buildOpenAiResponsesRequest(
    cfg,
    messages,
    options,
    true,
  );

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
    : new Error("OpenAI compatible responses stream failed.");
}

export async function it_callDoubaoResponses(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
): Promise<ItLlmResponse> {
  const { url, headers, payload } = it_buildDoubaoResponsesRequest(cfg, messages, options);

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
  if (it_hasTemplateRuntime(cfg)) {
    return await it_executeLlmTemplate(
      {
        template: cfg.template as NonNullable<ItLlmConfig["template"]>,
        environment: cfg.templateEnv || "prod",
        context: cfg.templateContext as NonNullable<ItLlmConfig["templateContext"]>,
      },
      resolvedMessages,
      {
        variables: it_buildTemplateVariables(cfg, false),
        maxRetries: cfg.templateMaxRetries ?? cfg.maxRetries,
        timeoutSec: cfg.timeoutSec,
        stream: false,
      },
    );
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
    const text = await it_executeLlmTemplate(
      {
        template: cfg.template as NonNullable<ItLlmConfig["template"]>,
        environment: cfg.templateEnv || "prod",
        context: cfg.templateContext as NonNullable<ItLlmConfig["templateContext"]>,
      },
      resolvedMessages,
      {
        variables: it_buildTemplateVariables(cfg, streamEnabled),
        maxRetries: cfg.templateMaxRetries ?? cfg.maxRetries,
        timeoutSec: cfg.timeoutSec,
        stream: streamEnabled,
        onDelta: options?.onDelta,
      },
    );
    if (options?.onDelta && !streamEnabled) {
      options.onDelta(text, text);
    }
    return text;
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

