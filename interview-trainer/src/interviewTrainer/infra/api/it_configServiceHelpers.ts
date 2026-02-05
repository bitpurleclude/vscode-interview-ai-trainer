import type {
  ItApiTemplate,
  ItTemplateCategory,
  ItTemplateRequest,
  ItTemplateResponse,
  ItTemplateStreaming,
} from "../../../protocol/interviewTrainer";

export type ItResolvedApiMode = {
  apiMode?: "chat" | "responses";
  useResponses: boolean;
};

export function it_resolveLlmMode(
  incoming?: Record<string, any>,
  base?: Record<string, any>,
): ItResolvedApiMode {
  const apiModeRaw =
    incoming?.apiMode ?? incoming?.api_mode ?? base?.api_mode ?? base?.apiMode;
  const resolvedApiMode = apiModeRaw
    ? String(apiModeRaw).toLowerCase() === "responses"
      ? "responses"
      : "chat"
    : undefined;
  const resolvedUseResponses =
    resolvedApiMode === "responses"
      ? true
      : resolvedApiMode === "chat"
        ? false
        : Boolean(
            incoming?.useResponses ??
              incoming?.use_responses ??
              base?.use_responses ??
              base?.useResponses ??
              false,
          );
  return { apiMode: resolvedApiMode, useResponses: resolvedUseResponses };
}

export function it_buildTemplateId(category: ItTemplateCategory, rawId: string): string {
  const cleaned = String(rawId || "default").trim() || "default";
  return `${category}:${cleaned}`;
}

export function it_buildTemplateBaseHeaders(): Record<string, string> {
  return {
    Authorization: "Bearer {{apiKey}}",
    "Content-Type": "application/json",
  };
}

export function it_buildOpenAiChatUrl(base: string): string {
  const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  return trimmed.toLowerCase().endsWith("/chat/completions")
    ? trimmed
    : `${trimmed}/chat/completions`;
}

export function it_buildOpenAiResponsesUrl(base: string, responsesPath?: string): string {
  const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const path = String(responsesPath || "").trim();
  if (path) {
    if (/^https?:\/\//i.test(path)) {
      return path.replace(/\/$/, "");
    }
    return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`;
  }
  return trimmed.toLowerCase().endsWith("/responses")
    ? trimmed
    : `${trimmed}/responses`;
}

export function it_buildDoubaoChatUrl(base: string): string {
  const trimmed = (base || "https://ark.cn-beijing.volces.com").trim().replace(/\/$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.includes("/api/v3/chat/completions") || lower.endsWith("/chat/completions")) {
    return trimmed;
  }
  if (lower.endsWith("/api/v3")) {
    return `${trimmed}/chat/completions`;
  }
  if (lower.endsWith("/api/v3/chat")) {
    return `${trimmed}/completions`;
  }
  return `${trimmed}/api/v3/chat/completions`;
}

export function it_buildDoubaoResponsesUrl(base: string): string {
  const trimmed = (base || "https://ark.cn-beijing.volces.com").trim().replace(/\/$/, "");
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

export function it_buildLlmTemplateFromConfig(args: {
  id: string;
  name: string;
  llm: Record<string, any>;
}): ItApiTemplate {
  const { id, name, llm } = args;
  const { apiMode, useResponses } = it_resolveLlmMode(llm, llm);
  const provider = llm.provider || "openai_compatible";
  const mode = apiMode ?? (useResponses ? "responses" : "chat");
  const baseUrl = llm.base_url || llm.baseUrl || "";
  const responsesPath = llm.responses_path ?? llm.responsesPath ?? "";
  const url =
    provider === "volc_doubao"
      ? mode === "responses"
        ? it_buildDoubaoResponsesUrl(baseUrl)
        : it_buildDoubaoChatUrl(baseUrl)
      : mode === "responses"
        ? it_buildOpenAiResponsesUrl(baseUrl, responsesPath)
        : it_buildOpenAiChatUrl(baseUrl);

  const request: ItTemplateRequest = {
    method: "POST",
    url,
    headers: it_buildTemplateBaseHeaders(),
    body:
      mode === "responses"
        ? {
            model: llm.model || "",
            input: "{{input}}",
            instructions: "{{instructions}}",
            stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
            reasoning:
              llm.reasoning_effort || llm.reasoningEffort
                ? { effort: llm.reasoning_effort ?? llm.reasoningEffort }
                : undefined,
          }
        : {
            model: llm.model || "",
            messages: "{{messages}}",
            temperature: Number(llm.temperature ?? 0.8),
            top_p: Number(llm.top_p ?? 0.8),
            stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
          },
  };

  const response: ItTemplateResponse = {
    mode: mode === "responses" ? "sse" : "json",
    textPath: mode === "responses" ? "output_text" : "choices[0].message.content",
  };

  const streaming: ItTemplateStreaming =
    mode === "responses"
      ? { dataPrefix: "data:", deltaPath: "output_text", doneSignals: ["[DONE]"] }
      : {
          dataPrefix: "data:",
          deltaPath: "choices[0].delta.content",
          doneSignals: ["[DONE]"],
        };

  return {
    id: it_buildTemplateId("llm", id),
    name,
    category: "llm",
    request,
    response,
    streaming,
    updatedAt: new Date().toISOString(),
  };
}

export function it_buildAsrTemplateFromConfig(args: {
  id: string;
  name: string;
  asr: Record<string, any>;
}): ItApiTemplate {
  const { id, name, asr } = args;
  const request: ItTemplateRequest = {
    method: "POST",
    url: asr.base_url || asr.baseUrl || "",
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      audio: "{{audioFile}}",
      lang: "{{asr.lang}}",
      dev_pid: "{{asr.dev_pid}}",
    },
    timeoutSec: Number(asr.timeout_sec ?? asr.timeoutSec ?? 120),
  };
  const response: ItTemplateResponse = {
    mode: "json",
    textPath: "result[0]",
  };
  return {
    id: it_buildTemplateId("asr", id),
    name,
    category: "asr",
    request,
    response,
    updatedAt: new Date().toISOString(),
  };
}

export function it_buildEmbeddingTemplateFromConfig(args: {
  id: string;
  name: string;
  vector: Record<string, any>;
}): ItApiTemplate {
  const { id, name, vector } = args;
  const request: ItTemplateRequest = {
    method: "POST",
    url: vector.base_url || vector.baseUrl || "",
    headers: it_buildTemplateBaseHeaders(),
    body: {
      model: vector.model || "",
      input: "{{embeddingInput}}",
    },
    timeoutSec: Number(vector.timeout_sec ?? vector.timeoutSec ?? 30),
  };
  const response: ItTemplateResponse = {
    mode: "json",
    textPath: "data[0].embedding",
  };
  return {
    id: it_buildTemplateId("embedding", id),
    name,
    category: "embedding",
    request,
    response,
    updatedAt: new Date().toISOString(),
  };
}
