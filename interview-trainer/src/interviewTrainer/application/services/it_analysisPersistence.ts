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
  } = params;

  reportProgress("report", 30, "report 30% - local", "running");
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
  await it_updateReferenceNotesFileAsync(topicDir, response.evaluation);
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
  await it_appendAttemptDataAsync(topicDir, attemptData);

  const meta = await it_readTopicMetaAsync(topicDir);
  const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
  const normalized = fingerprint || it_normalizeText(questionText || topicTitle);
  const now = new Date().toISOString();
  await it_writeTopicMetaAsync(topicDir, {
    topicTitle: meta.topicTitle || topicTitle,
    questionText: questionText || meta.questionText || "",
    questionList: questionList.length ? questionList : meta.questionList || [],
    questionHash: meta.questionHash || it_hashText(normalized),
    createdAt: meta.createdAt || now,
    updatedAt: now,
    overallScore: response.evaluation.overallScore,
  });
  reportProgress("write", 100, "write 100% - local", "success");
}
