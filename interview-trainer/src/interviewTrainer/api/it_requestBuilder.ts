import { ItLlmConfig, ItLlmMessage, ItLlmReasoningEffort } from "./it_llmTypes";
import { it_resolveToolsPreset } from "./it_toolsPresets";

export interface ItLlmRequestSpec {
  url: string;
  headers: Record<string, string>;
  payload: any;
}

export interface ItLlmRequestOptions {
  previousResponseId?: string;
  reasoningEffort?: ItLlmReasoningEffort;
  maxOutputTokens?: number;
  webSearch?: boolean;
}

function it_buildHeaders(cfg: ItLlmConfig): Record<string, string> {
  return {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
}

function it_buildOpenAiChatUrl(base: string): string {
  const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const lower = trimmed.toLowerCase();
  return lower.endsWith("/chat/completions") ? trimmed : `${trimmed}/chat/completions`;
}

function it_buildDoubaoChatUrl(base: string): string {
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

function it_buildDoubaoResponsesUrl(base: string): string {
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

function it_buildOpenAiResponsesUrl(base: string, responsesPath?: string): string {
  const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
  const path = String(responsesPath || "").trim();
  if (path) {
    if (/^https?:\/\//i.test(path)) {
      return path.replace(/\/$/, "");
    }
    return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`;
  }
  if (trimmed.toLowerCase().endsWith("/responses")) {
    return trimmed;
  }
  return `${trimmed}/responses`;
}

function it_splitResponsesMessages(messages: ItLlmMessage[]): {
  instructions?: string;
  input: any[];
} {
  const instructions: string[] = [];
  const input: any[] = [];
  messages.forEach((msg) => {
    if (msg.role === "system") {
      instructions.push(String(msg.content || ""));
      return;
    }
    input.push({
      type: "message",
      role: msg.role,
      content: [
        {
          type: "input_text",
          text: msg.content,
        },
      ],
    });
  });
  const joined = instructions.map((item) => item.trim()).filter(Boolean).join("\n\n");
  return {
    instructions: joined || undefined,
    input,
  };
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

function it_buildOpenAiResponsesPayload(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
  stream?: boolean,
): any {
  const { instructions, input } = it_splitResponsesMessages(messages);
  const payload: any = {
    model: cfg.model || "gpt-4.1-mini",
    input,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  if (instructions) {
    payload.instructions = instructions;
  }
  if (stream) {
    payload.stream = true;
  }
  const reasoningEffort =
    options?.reasoningEffort ?? cfg.reasoningEffort ?? ("xhigh" as ItLlmReasoningEffort);
  if (reasoningEffort) {
    payload.reasoning = { effort: reasoningEffort, summary: "auto" };
  }
  // Do not send max_output_tokens for openai_compatible responses endpoints.
  if (options?.previousResponseId) {
    payload.previous_response_id = options.previousResponseId;
  }
  const presetTools = cfg.tools && cfg.tools.length ? cfg.tools : it_resolveToolsPreset(cfg.toolsPreset);
  const webSearch = options?.webSearch ?? cfg.webSearch;
  if (presetTools && presetTools.length) {
    payload.tools = presetTools;
    payload.tool_choice = "auto";
    payload.parallel_tool_calls = true;
    payload.include = cfg.include && cfg.include.length ? cfg.include : ["reasoning.encrypted_content"];
    if (typeof cfg.store === "boolean") {
      payload.store = cfg.store;
    } else {
      payload.store = false;
    }
  } else if (webSearch) {
    payload.tools = [{ type: "web_search" }];
  }
  if (cfg.promptCacheKey) {
    payload.prompt_cache_key = cfg.promptCacheKey;
  }
  return payload;
}

function it_buildDoubaoResponsesPayload(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
): any {
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
  return payload;
}

export function it_buildOpenAiChatRequest(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  stream?: boolean,
): ItLlmRequestSpec {
  const payload: any = {
    model: cfg.model || "gpt-4.1-mini",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  if (stream) {
    payload.stream = true;
  }
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_tokens = Number(cfg.maxOutputTokens);
  }
  return {
    url: it_buildOpenAiChatUrl(cfg.baseUrl),
    headers: it_buildHeaders(cfg),
    payload,
  };
}

export function it_buildDoubaoChatRequest(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  stream?: boolean,
): ItLlmRequestSpec {
  const payload: any = {
    model: cfg.model || "doubao-seed-1-8-251228",
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
  };
  if (stream) {
    payload.stream = true;
  }
  if (cfg.reasoningEffort) {
    payload.reasoning_effort = cfg.reasoningEffort;
  }
  if (Number.isFinite(cfg.maxOutputTokens) && Number(cfg.maxOutputTokens) > 0) {
    payload.max_completion_tokens = Number(cfg.maxOutputTokens);
  }
  return {
    url: it_buildDoubaoChatUrl(cfg.baseUrl),
    headers: it_buildHeaders(cfg),
    payload,
  };
}

export function it_buildOpenAiResponsesRequest(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
  stream?: boolean,
): ItLlmRequestSpec {
  return {
    url: it_buildOpenAiResponsesUrl(cfg.baseUrl, cfg.responsesPath),
    headers: it_buildHeaders(cfg),
    payload: it_buildOpenAiResponsesPayload(cfg, messages, options, stream),
  };
}

export function it_buildDoubaoResponsesRequest(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: ItLlmRequestOptions,
): ItLlmRequestSpec {
  return {
    url: it_buildDoubaoResponsesUrl(cfg.baseUrl),
    headers: it_buildHeaders(cfg),
    payload: it_buildDoubaoResponsesPayload(cfg, messages, options),
  };
}
