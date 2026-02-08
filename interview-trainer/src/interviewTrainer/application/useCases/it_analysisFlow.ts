import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
} from "../../../protocol/interviewTrainer";
import { it_runAnalysis } from "../flows/analyze/flow";
import {
  it_applyAnalysisPartial,
  it_finishAnalysisSessionCanceled,
  it_finishAnalysisSessionError,
  it_finishAnalysisSessionSuccess,
  it_markAnalysisCorpusClean,
  it_startAnalysisSession,
} from "../services/it_analysisSessionState";
import { it_prepareAnalysisRunDeps } from "../services/it_analysisRunConfig";
import {
  IT_ANALYSIS_CANCELED_MESSAGE,
  IT_ANALYSIS_FAILED_MESSAGE,
  it_buildAnalysisFailedUserError,
  it_isAnalysisCanceledError,
} from "../services/it_analysisErrors";
import type { ItAnalysisUseCasePort } from "../services/it_analysisHostPorts";

export type ItAnalysisHost = ItAnalysisUseCasePort;

type ItAnalysisTraceLevel = "debug" | "info" | "warn" | "error";

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceAnalyzeRun(
  host: ItAnalysisHost,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItAnalysisTraceLevel = "info",
): void {
  host.logCorpusTrace(`analysis ${action} ${status}`, {
    event: `application.analysis_run.${action}`,
    status,
    level,
    module: "it_analysisFlow",
    ...(detail || {}),
  });
}

export async function it_handleAnalyze(
  host: ItAnalysisHost,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  const runId = request.runId || new Date().toISOString();
  const startedAt = Date.now();
  it_traceAnalyzeRun(
    host,
    "handle",
    "start",
    {
      runId,
      questionTextLength: String(request.questionText || "").length,
      questionCount: Array.isArray(request.questionList) ? request.questionList.length : 0,
      audioFormat: request.audio?.format || "",
      audioByteLength: Number(request.audio?.byteLength || 0),
    },
    "debug",
  );

  try {
    it_startAnalysisSession(host, runId);

    const depsStartedAt = Date.now();
    const deps = await it_prepareAnalysisRunDeps(host, (partial) =>
      it_applyAnalysisPartial(host, partial),
    );
    it_traceAnalyzeRun(
      host,
      "prepare_deps",
      "success",
      {
        runId,
        durationMs: Date.now() - depsStartedAt,
      },
      "debug",
    );

    const analysisStartedAt = Date.now();
    const response = await it_runAnalysis(deps, request);

    it_markAnalysisCorpusClean(host);
    it_finishAnalysisSessionSuccess(host, "分析完成，可保存与复盘");

    it_traceAnalyzeRun(
      host,
      "handle",
      "success",
      {
        runId,
        durationMs: Date.now() - startedAt,
        analysisDurationMs: Date.now() - analysisStartedAt,
        reportPath: response.reportPath || "",
        topicDir: response.topicDir || "",
        questionCount: Array.isArray(response.questionList) ? response.questionList.length : 0,
      },
    );

    return response;
  } catch (error) {
    const elapsedMs = Date.now() - startedAt;
    if (it_isAnalysisCanceledError(error)) {
      it_finishAnalysisSessionCanceled(host, IT_ANALYSIS_CANCELED_MESSAGE);
      it_traceAnalyzeRun(
        host,
        "handle",
        "canceled",
        {
          runId,
          durationMs: elapsedMs,
          errorCode: "analysis_canceled",
          error: it_errorMessage(error),
        },
        "warn",
      );
      throw error;
    }

    it_finishAnalysisSessionError(
      host,
      IT_ANALYSIS_FAILED_MESSAGE,
      it_buildAnalysisFailedUserError(error),
    );
    it_traceAnalyzeRun(
      host,
      "handle",
      "error",
      {
        runId,
        durationMs: elapsedMs,
        errorCode: "analysis_failed",
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}
