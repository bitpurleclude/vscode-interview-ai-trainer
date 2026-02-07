import {
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest,
  it_callLlmChat,
  type ItLlmConfig,
  type ItLlmMessage,
  type ItLlmReasoningEffort,
} from "../services/it_llmGateway";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

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

const DEFAULT_TEST_SYSTEM = "You are a health-check assistant. Reply with short confirmation.";

export async function it_testLlm(params: {
  payload: unknown;
  onEmitRequest?: (detail: Record<string, unknown>) => void;
  onFailure?: (error: unknown, detail?: Record<string, unknown>) => void;
}): Promise<{ ok: true; content: string }> {
  const payload = it_asRecord(params.payload);
  const llmForm = it_asRecord(payload.llm);
  const provider = String(llmForm.provider || "baidu_qianfan");
  const defaultBase =
    provider === "volc_doubao"
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
  const defaultModel =
    provider === "volc_doubao"
      ? "doubao-seed-1-8-251228"
      : "ernie-4.5-turbo-128k";


  const rawApiMode = llmForm.apiMode;
  const apiModeValue =
    rawApiMode === "chat" || rawApiMode === "responses"
      ? rawApiMode
      : undefined;
  const rawReasoning = llmForm.reasoningEffort;
  const reasoningEffort =
    rawReasoning === "minimal" ||
    rawReasoning === "low" ||
    rawReasoning === "medium" ||
    rawReasoning === "high" ||
    rawReasoning === "xhigh"
      ? (rawReasoning as ItLlmReasoningEffort)
      : undefined;
  const cfg: ItLlmConfig = {
    provider,
    apiKey: String(llmForm.apiKey || ""),
    baseUrl: String(llmForm.baseUrl || defaultBase),
    model: String(llmForm.model || defaultModel),
    temperature: Number(llmForm.temperature ?? 0.8),
    topP: Number(llmForm.topP ?? 0.8),
    timeoutSec: Number(llmForm.timeoutSec ?? 30),
    maxRetries: Number(llmForm.maxRetries ?? 0),
    antiRepeat: Boolean(llmForm.antiRepeat ?? false),
    useResponses: Boolean(llmForm.useResponses ?? false),
    apiMode: apiModeValue,
    responsesPath: llmForm.responsesPath as string | undefined,
    promptCacheKey: llmForm.promptCacheKey as string | undefined,
    reasoningEffort,
    maxOutputTokens: Number(llmForm.maxOutputTokens ?? 0),
    reusePrefix: Boolean(llmForm.reusePrefix ?? false),
    stream: Boolean(llmForm.stream ?? llmForm.stream_enabled ?? true),
  };

  if (!cfg.apiKey) {
    throw new Error("Missing LLM API key.");
  }

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

  params.onEmitRequest?.(requestDetail);

  try {
    const content = await it_callLlmChat(cfg, messages);
    return { ok: true, content };
  } catch (error) {
    params.onFailure?.(error, {
      config: { ...cfg, apiKey: cfg.apiKey ? "***" : "" },
    });
    throw error;
  }
}
