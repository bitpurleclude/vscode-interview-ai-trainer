import type {
  ItAnalyzeResponse,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import {
  it_appendAttemptDataAsync,
  it_appendReportAsync,
  it_buildQuestionFingerprint,
  it_readTopicMetaAsync,
  it_updateReferenceNotesFileAsync,
  it_writeTopicMetaAsync,
} from "./it_storageGateway";
import { it_hashText, it_normalizeText } from "./it_textGateway";

function it_persistenceTrace(
  onTrace: ((message: string, detail?: Record<string, unknown>) => void) | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.(`persistence ${action} ${status}`, {
    event: `application.persistence.${action}`,
    status,
    ...(detail || {}),
  });
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function it_persistAnalysis(params: {
  questionText: string;
  questionList: string[];
  topicTitle: string;
  topicDir: string;
  reportPath: string;
  attemptIndex: number;
  response: ItAnalyzeResponse;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
  shouldAbort?: () => boolean;
}): Promise<void> {
  const {
    questionText,
    questionList,
    topicTitle,
    topicDir,
    reportPath,
    attemptIndex,
    response,
    reportProgress,
    onTrace,
    shouldAbort,
  } = params;

  const ensureNotAborted = () => {
    if (shouldAbort?.()) {
      throw new Error("分析已停止");
    }
  };

  it_persistenceTrace(onTrace, "persist_analysis", "start", {
    topicDir,
    reportPath,
    attemptIndex,
  });

  try {
    ensureNotAborted();
    reportProgress("report", 30, "report 30% - local", "running");
    it_persistenceTrace(onTrace, "append_report", "start", {
      reportPath,
      attemptIndex,
    });

    ensureNotAborted();
    await it_appendReportAsync(
      reportPath,
      topicTitle,
      questionText || undefined,
      questionList.length ? questionList : undefined,
      attemptIndex,
      response,
      {
        attemptHeading: "Attempt {n}",
        segmentHeading: "Question {n}",
        attemptNote: "Scores are for reference only.",
      },
    );
    ensureNotAborted();
    await it_updateReferenceNotesFileAsync(topicDir, response.evaluation);
    it_persistenceTrace(onTrace, "append_report", "success", {
      reportPath,
      attemptIndex,
    });
    reportProgress("report", 100, "report 100% - local", "success");

    reportProgress("write", 40, "write 40% - local", "running");
    const attemptData = {
      attemptIndex,
      timestamp: new Date().toISOString(),
      audioPath: response.audioPath,
      durationSec: response.acoustic.durationSec,
      transcript: response.transcript,
      detailedTranscript: response.detailedTranscript,
      evaluation: response.evaluation,
      notes: response.notes,
      audioSegments: response.audioSegments,
      questionTimings: response.questionTimings,
    };
    it_persistenceTrace(onTrace, "append_attempt", "start", {
      topicDir,
      attemptIndex,
    });
    ensureNotAborted();
    await it_appendAttemptDataAsync(topicDir, attemptData);
    it_persistenceTrace(onTrace, "append_attempt", "success", {
      topicDir,
      attemptIndex,
    });

    ensureNotAborted();
    it_persistenceTrace(onTrace, "read_topic_meta", "start", {
      topicDir,
    });
    const meta = await it_readTopicMetaAsync(topicDir);
    it_persistenceTrace(onTrace, "read_topic_meta", "success", {
      topicDir,
    });

    const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
    const normalized = fingerprint || it_normalizeText(questionText || topicTitle);
    const now = new Date().toISOString();
    it_persistenceTrace(onTrace, "write_topic_meta", "start", {
      topicDir,
    });
    ensureNotAborted();
    await it_writeTopicMetaAsync(topicDir, {
      topicTitle: meta.topicTitle || topicTitle,
      questionText: questionText || meta.questionText || "",
      questionList: questionList.length ? questionList : meta.questionList || [],
      questionHash: meta.questionHash || it_hashText(normalized),
      createdAt: meta.createdAt || now,
      updatedAt: now,
      overallScore: response.evaluation.overallScore,
    });
    it_persistenceTrace(onTrace, "write_topic_meta", "success", {
      topicDir,
      overallScore: response.evaluation.overallScore,
    });

    reportProgress("write", 100, "write 100% - local", "success");
    it_persistenceTrace(onTrace, "persist_analysis", "success", {
      topicDir,
      reportPath,
      attemptIndex,
    });
  } catch (error) {
    it_persistenceTrace(onTrace, "persist_analysis", "error", {
      topicDir,
      reportPath,
      attemptIndex,
      error: it_errorMessage(error),
    });
    throw error;
  }
}
