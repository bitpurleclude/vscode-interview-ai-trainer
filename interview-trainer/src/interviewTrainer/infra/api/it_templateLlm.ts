import type { ItLlmMessage } from "./it_llmTypes";

export function it_splitResponsesMessages(messages: ItLlmMessage[]): {
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
