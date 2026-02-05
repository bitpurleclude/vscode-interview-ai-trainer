import type { ItLlmConfig, ItLlmMessage } from "../api/it_llmTypes";
import { it_callLlmChat, it_callLlmChatStreaming } from "../api/it_llm";

export async function it_requestLlmChat(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
): Promise<string> {
  return it_callLlmChat(cfg, messages);
}

export async function it_requestLlmChatStreaming(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  options?: {
    onDelta?: (delta: string, full: string) => void;
    stream?: boolean;
  },
): Promise<string> {
  return it_callLlmChatStreaming(cfg, messages, options);
}
