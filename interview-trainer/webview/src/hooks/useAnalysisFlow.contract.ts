import type { ItAnalyzeRequest } from "../types";

type BuildAnalyzePayloadInput = {
  audio: ItAnalyzeRequest["audio"];
  questionText: string;
  questionList: string[];
  customPrompt: string;
  demoPrompt: string;
  perQuestionSystemPrompts: string[];
  perQuestionDemoPrompts: string[];
  runId: string;
};

export function it_buildAnalyzePayload(input: BuildAnalyzePayloadInput): ItAnalyzeRequest {
  const normalizedQuestionText = input.questionText.trim();
  const normalizedPerQuestionSystem = input.perQuestionSystemPrompts
    .slice(0, 3)
    .map((item) => item.trim());
  const normalizedPerQuestionDemo = input.perQuestionDemoPrompts
    .slice(0, 3)
    .map((item) => item.trim());
  const hasPerQuestionSystem = normalizedPerQuestionSystem.some(Boolean);
  const hasPerQuestionDemo = normalizedPerQuestionDemo.some(Boolean);

  return {
    audio: input.audio,
    questionText: normalizedQuestionText || undefined,
    questionList: input.questionList,
    systemPrompt: input.customPrompt.trim() || undefined,
    demoPrompt: input.demoPrompt.trim() || undefined,
    perQuestionSystemPrompts: hasPerQuestionSystem ? normalizedPerQuestionSystem : undefined,
    perQuestionDemoPrompts: hasPerQuestionDemo ? normalizedPerQuestionDemo : undefined,
    runId: input.runId,
  };
}

export function it_shouldIgnoreAnalyzeResponse(params: {
  cancelled: boolean;
  runId: number;
  activeRunId: number;
}): boolean {
  return params.cancelled || params.runId !== params.activeRunId;
}

export function it_resolveAnalyzeQuestionsFromResponse(
  content: unknown,
): { questionText: string; questionList: string[] } {
  const payload = content && typeof content === "object" ? (content as Record<string, unknown>) : {};
  const questionText = String(payload.questionText || "").trim();
  const questionList = Array.isArray(payload.questionList)
    ? payload.questionList.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    questionText,
    questionList,
  };
}
