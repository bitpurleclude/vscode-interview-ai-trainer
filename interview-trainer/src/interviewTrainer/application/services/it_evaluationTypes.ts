import type { ItLlmConfig, ItLlmProvider } from "../../infra/api/it_llmTypes";

export interface ItEvaluationConfig extends ItLlmConfig {
  provider: ItLlmProvider | "heuristic";
  language: string;
  dimensions: string[];
  answerMode?: "single" | "two-step";
}
