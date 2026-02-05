import axios from "axios";
import type { ItLlmConfig, ItLlmMessage, ItLlmResponse } from "./it_llmTypes";
import {
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  ItLlmRequestOptions,
} from "./it_requestBuilder";
import { it_consumeSseStream } from "./it_llmStream";
import { it_extractResponseId, it_extractResponseText } from "./it_llmHelpers";

export async function it_callDoubaoChat(
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

export async function it_callDoubaoChatStream(
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