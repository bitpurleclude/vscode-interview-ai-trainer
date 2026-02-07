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

export async function it_handleAnalyze(
  host: ItAnalysisHost,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  try {
    const runId = request.runId || new Date().toISOString();
    it_startAnalysisSession(host, runId);

    const deps = await it_prepareAnalysisRunDeps(host, (partial) =>
      it_applyAnalysisPartial(host, partial),
    );
    const response = await it_runAnalysis(deps, request);

    it_markAnalysisCorpusClean(host);
    it_finishAnalysisSessionSuccess(host, "分析完成，可保存与复盘");
    return response;
  } catch (error) {
    if (it_isAnalysisCanceledError(error)) {
      it_finishAnalysisSessionCanceled(host, IT_ANALYSIS_CANCELED_MESSAGE);
      throw error;
    }

    it_finishAnalysisSessionError(
      host,
      IT_ANALYSIS_FAILED_MESSAGE,
      it_buildAnalysisFailedUserError(error),
    );
    throw error;
  }
}
