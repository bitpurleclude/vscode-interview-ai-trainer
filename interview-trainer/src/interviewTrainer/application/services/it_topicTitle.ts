import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import { it_requestLlmChat } from "../../infra/clients/llmClient";
import { it_extractJson } from "../../domain/analyze/shared";
import {
  it_deriveTopicTitle,
  it_sanitizeTopicTitle,
} from "../../domain/analyze/result";

export { it_deriveTopicTitle, it_sanitizeTopicTitle };

export async function it_generateTopicTitleWithLlm(
  llmConfig: ItLlmConfig | null,
  questionText: string,
  questionList: string[],
  maxLen: number,
): Promise<string | null> {
  if (!llmConfig) {
    return null;
  }

  const material = questionText.trim();
  const questions = questionList.filter((item) => item.trim());
  if (!material && !questions.length) {
    return null;
  }

  const systemPrompt = [
    "Extract a concise topic title and output JSON only.",
    `Title is used as folder name, length <= ${maxLen}, avoid punctuation and quotes.`,
    "If there are multiple questions, summarize one common topic instead of only question one.",
    'Output JSON format: { "title": "..." }',
  ].join("\n");

  const userPrompt = [
    material ? `Background text:\n${material}` : "",
    questions.length ? `Question list:\n${questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  try {
    const content = await it_requestLlmChat(
      {
        ...llmConfig,
        maxRetries: Math.max(0, Number(llmConfig.maxRetries ?? 1)),
      },
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    );

    const parsed = it_extractJson(content);
    const candidate =
      (parsed && (parsed.title || parsed.name || parsed.topic)) ||
      String(content || "").split(/\r?\n/)[0];

    const normalized = it_sanitizeTopicTitle(String(candidate || ""), maxLen);
    return normalized || null;
  } catch {
    return null;
  }
}
