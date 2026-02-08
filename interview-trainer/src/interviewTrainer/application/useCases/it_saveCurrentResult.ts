import type { ItAnalyzeResponse } from "../../../protocol/interviewTrainer";
import type { ItConfigBundle } from "../services/it_configGateway";
import {
  it_appendAttemptDataAsync,
  it_appendReportAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
  it_storeAudioCopy,
  it_updateReferenceNotesFileAsync,
  it_writeTopicMetaAsync,
} from "../services/it_storageGateway";
import { it_hashText, it_normalizeText } from "../services/it_textGateway";
import {
  it_deriveTopicTitle,
  it_sanitizeTopicTitle,
} from "../services/it_topicTitle";

export type ItSaveCurrentResultPayload = {
  response?: ItAnalyzeResponse;
  questionText?: unknown;
  questionList?: unknown;
  topicTitle?: unknown;
};

function it_saveTrace(
  onTrace: ((message: string, detail?: Record<string, unknown>) => void) | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.(`save_result ${action} ${status}`, {
    event: `application.save_result.${action}`,
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

export async function it_saveCurrentResult(params: {
  payload: ItSaveCurrentResultPayload;
  configBundle: ItConfigBundle;
  requireWorkspaceRoot: () => string;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
}): Promise<{ ok: true; attemptIndex: number; reportPath: string }> {
  const payload = params.payload || {};
  const response = payload.response as ItAnalyzeResponse | undefined;
  if (!response || !response.reportPath || !response.topicDir) {
    throw new Error("No savable result payload.");
  }

  const questionText = String(payload.questionText ?? response.questionText ?? "");
  const questionList = Array.isArray(payload.questionList)
    ? payload.questionList.map((item: unknown) => String(item)).filter(Boolean)
    : Array.isArray(response.questionList)
      ? response.questionList.map((item: unknown) => String(item)).filter(Boolean)
      : [];
  const topicTitle = String(payload.topicTitle || response.evaluation?.topicTitle || "");

  const skillConfig = params.configBundle.skill || {};
  const maxTitleLen = Number(skillConfig.topics?.max_title_len ?? 18);
  let resolvedTitle = topicTitle.trim();
  if (!resolvedTitle) {
    resolvedTitle = it_deriveTopicTitle(
      questionText,
      questionList,
      response.transcript,
      maxTitleLen,
    );
  }
  resolvedTitle = it_sanitizeTopicTitle(resolvedTitle, maxTitleLen);

  const sessionsConfig = {
    sessionsDir: skillConfig.sessions_dir || "sessions",
    allowUnicode: skillConfig.filenames?.allow_unicode ?? true,
    maxSlugLen: skillConfig.filenames?.max_slug_len ?? 16,
    similarityThreshold: Number(skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: skillConfig.topics?.center_subdir || "",
  };

  const onTrace = params.onTrace;
  it_saveTrace(onTrace, "save_current", "start", {
    hasQuestionText: Boolean(questionText.trim()),
    questionCount: questionList.length,
    topicTitle: resolvedTitle,
  });

  try {
    const workspaceRoot = params.requireWorkspaceRoot();
    const topicDir = await it_resolveTopicDirAsync(
      workspaceRoot,
      resolvedTitle,
      questionText,
      questionList,
      sessionsConfig,
    );
    const reportPath = await it_reportPathForTopicAsync(
      topicDir,
      resolvedTitle,
      sessionsConfig,
    );
    const attemptIndex = await it_nextAttemptIndexAsync(reportPath);

    const storedAudioPath =
      topicDir !== response.topicDir && response.audioPath
        ? it_storeAudioCopy(response.audioPath, topicDir, attemptIndex)
        : response.audioPath;

    it_saveTrace(onTrace, "append_report", "start", {
      reportPath,
      attemptIndex,
    });
    await it_appendReportAsync(
      reportPath,
      resolvedTitle,
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
    await it_updateReferenceNotesFileAsync(topicDir, response.evaluation);
    it_saveTrace(onTrace, "append_report", "success", {
      reportPath,
      attemptIndex,
    });

    const attemptData = {
      attemptIndex,
      timestamp: new Date().toISOString(),
      audioPath: storedAudioPath,
      durationSec: response.acoustic.durationSec,
      transcript: response.transcript,
      detailedTranscript: response.detailedTranscript,
      evaluation: response.evaluation,
      notes: response.notes,
      audioSegments: response.audioSegments,
      questionTimings: response.questionTimings,
    };

    it_saveTrace(onTrace, "append_attempt", "start", {
      topicDir,
      attemptIndex,
    });
    await it_appendAttemptDataAsync(topicDir, attemptData);
    it_saveTrace(onTrace, "append_attempt", "success", {
      topicDir,
      attemptIndex,
    });

    const meta = await it_readTopicMetaAsync(topicDir);
    const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
    const normalized = fingerprint || it_normalizeText(questionText || resolvedTitle);
    const now = new Date().toISOString();

    it_saveTrace(onTrace, "write_topic_meta", "start", {
      topicDir,
    });
    await it_writeTopicMetaAsync(topicDir, {
      topicTitle: meta.topicTitle || resolvedTitle,
      questionText: questionText || meta.questionText || "",
      questionList: questionList.length ? questionList : meta.questionList || [],
      questionHash: meta.questionHash || it_hashText(normalized),
      createdAt: meta.createdAt || now,
      updatedAt: now,
      overallScore: response.evaluation.overallScore,
    });
    it_saveTrace(onTrace, "write_topic_meta", "success", {
      topicDir,
      overallScore: response.evaluation.overallScore,
    });

    it_saveTrace(onTrace, "save_current", "success", {
      topicDir,
      reportPath,
      attemptIndex,
    });
    return { ok: true, attemptIndex, reportPath };
  } catch (error) {
    it_saveTrace(onTrace, "save_current", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}
