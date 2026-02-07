import type { ItUserError } from "../../../protocol/interviewTrainer";

export const IT_ANALYSIS_CANCELED_MESSAGE = "分析已取消";
export const IT_ANALYSIS_FAILED_MESSAGE = "分析失败，请检查配置或 API 响应后重试";
export const IT_ANALYSIS_FAILED_REASON_FALLBACK = "未知错误";
export const IT_ANALYSIS_FAILED_SOLUTION =
  "请检查 API Key/Secret、模板绑定与网络连接后重试";

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
