import type { ItLlmConfig, ItLlmMessage } from "./it_llmTypes";

export function it_withNonce(messages: ItLlmMessage[]): ItLlmMessage[] {
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

export function it_hasTemplateRuntime(cfg: ItLlmConfig): boolean {
  return Boolean(cfg.template && cfg.templateContext && cfg.templateEnv);
}

export function it_buildTemplateVariables(
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

export function it_extractResponseText(data: any): string {
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

export function it_extractResponseId(data: any): string | undefined {
  const id = data?.response_id ?? data?.id;
  return id ? String(id) : undefined;
}