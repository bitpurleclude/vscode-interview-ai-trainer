import type { ItUserError } from "../../../protocol/interviewTrainer";

export const IT_ANALYSIS_CANCELED_MESSAGE = "?????";
export const IT_ANALYSIS_FAILED_MESSAGE = "????????API???????";
export const IT_ANALYSIS_FAILED_REASON_FALLBACK = "????";
export const IT_ANALYSIS_FAILED_SOLUTION =
  "???API Key/Secret?????????????";

export function it_isAnalysisCanceledError(error: unknown): error is Error {
  return (
    error instanceof Error &&
    typeof error.message === "string" &&
    error.message.includes(IT_ANALYSIS_CANCELED_MESSAGE)
  );
}

export function it_buildAnalysisFailedUserError(error: unknown): ItUserError {
  return {
    type: "analysis",
    reason: error instanceof Error ? error.message : IT_ANALYSIS_FAILED_REASON_FALLBACK,
    solution: IT_ANALYSIS_FAILED_SOLUTION,
  };
}
