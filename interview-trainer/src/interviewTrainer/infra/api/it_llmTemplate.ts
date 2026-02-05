import { it_executeLlmTemplate } from "./it_templateExecutor";
import type { ItLlmConfig, ItLlmMessage } from "./it_llmTypes";
import { it_buildTemplateVariables } from "./it_llmHelpers";

function it_buildTemplateRuntime(cfg: ItLlmConfig) {
  return {
    template: cfg.template as NonNullable<ItLlmConfig["template"]>,
    environment: cfg.templateEnv || "prod",
    context: cfg.templateContext as NonNullable<ItLlmConfig["templateContext"]>,
  };
}

export async function it_callTemplateChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  return await it_executeLlmTemplate(it_buildTemplateRuntime(cfg), messages, {
    variables: it_buildTemplateVariables(cfg, false),
    maxRetries: cfg.templateMaxRetries ?? cfg.maxRetries,
    timeoutSec: cfg.timeoutSec,
    stream: false,
  });
}

export async function it_callTemplateChatStreaming(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  streamEnabled: boolean,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  const text = await it_executeLlmTemplate(it_buildTemplateRuntime(cfg), messages, {
    variables: it_buildTemplateVariables(cfg, streamEnabled),
    maxRetries: cfg.templateMaxRetries ?? cfg.maxRetries,
    timeoutSec: cfg.timeoutSec,
    stream: streamEnabled,
    onDelta,
  });
  if (onDelta && !streamEnabled) {
    onDelta(text, text);
  }
  return text;
}