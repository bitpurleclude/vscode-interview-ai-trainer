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

export async function it_saveCurrentResult(params: {
  payload: ItSaveCurrentResultPayload;
  configBundle: ItConfigBundle;
  requireWorkspaceRoot: () => string;
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
  await it_appendAttemptDataAsync(topicDir, attemptData);

  const meta = await it_readTopicMetaAsync(topicDir);
  const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
  const normalized = fingerprint || it_normalizeText(questionText || resolvedTitle);
  const now = new Date().toISOString();
  await it_writeTopicMetaAsync(topicDir, {
    topicTitle: meta.topicTitle || resolvedTitle,
    questionText: questionText || meta.questionText || "",
    questionList: questionList.length ? questionList : meta.questionList || [],
    questionHash: meta.questionHash || it_hashText(normalized),
    createdAt: meta.createdAt || now,
    updatedAt: now,
    overallScore: response.evaluation.overallScore,
  });

  return { ok: true, attemptIndex, reportPath };
}
