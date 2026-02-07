import type { ItLlmConfig, ItLlmProvider } from "./it_llmGateway";

export interface ItEvaluationConfig extends ItLlmConfig {
  provider: ItLlmProvider | "heuristic";
  language: string;
  dimensions: string[];
  answerMode?: "single" | "two-step";
}
