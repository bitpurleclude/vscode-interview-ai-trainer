import type {
  ItAudioSegment,
  ItQuestionTiming,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../../protocol/interviewTrainer";
import type { ItLlmConfig } from "../../../infra/api/it_llmTypes";
import type { ItAnalyzeDeps } from "./flow_types";
import { it_assignSegmentsWithLlm, it_splitAnswersWithLlm } from "../../services/it_questionsLlm";
import { it_alignAnswerToSegments } from "../../../domain/analyze/questionsSegments";

type SegmentStageInput = {
  deps: ItAnalyzeDeps;
  segmentLlmConfig: ItLlmConfig;
  questionList: string[];
  transcript: string;
  audioSegments: ItAudioSegment[] | undefined;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
};

export type SegmentStageResult = {
  questionTimings: ItQuestionTiming[];
  questionTimingNote?: string;
  questionAnswers?: Array<{ question: string; answer: string }>;
  llmTimingAttempted: boolean;
  llmTimingFailed: boolean;
};

export async function it_runSegmentStage({
  deps,
  segmentLlmConfig,
  questionList,
  transcript,
  audioSegments,
  reportProgress,
}: SegmentStageInput): Promise<SegmentStageResult> {
  let questionTimings: ItQuestionTiming[] = [];
  let questionTimingNote: string | undefined = undefined;
  let questionAnswers: Array<{ question: string; answer: string }> | undefined = undefined;
  let llmTimingAttempted = false;
  let llmTimingFailed = false;

  if (audioSegments && segmentLlmConfig) {
    llmTimingAttempted = true;
    reportProgress("segment", 25, "多题分段 25% · 正在分段", "running");
    const splitAnswers = await it_splitAnswersWithLlm(
      segmentLlmConfig,
      questionList,
      transcript,
      deps.onCorpusTrace,
      deps.onStream ? (update) => deps.onStream?.({ step: "segment", ...update }) : undefined,
    );
    reportProgress("segment", 45, "多题分段 45% · 正在本地对齐", "running");
    if (splitAnswers) {
      questionAnswers = splitAnswers;
      const alignedTimings: ItQuestionTiming[] = [];
      let alignedCount = 0;
      let missingAlignment = false;
      for (let idx = 0; idx < splitAnswers.length; idx += 1) {
        const answerText = splitAnswers[idx].answer.trim();
        if (!answerText) {
          continue;
        }
        const aligned = it_alignAnswerToSegments(answerText, audioSegments);
        if (!aligned) {
          missingAlignment = true;
          continue;
        }
        alignedTimings[idx] = {
          question: splitAnswers[idx].question,
          startSec: aligned.startSec,
          endSec: aligned.endSec,
          durationSec: Math.max(0, aligned.endSec - aligned.startSec),
          note: "LLM逐题对齐",
        };
        alignedCount += 1;
      }
      if (alignedCount) {
        questionTimings = alignedTimings;
      }
      if (missingAlignment) {
        reportProgress("segment", 65, "多题分段 65% · 正在远程对齐", "running");
        const assigned = await it_assignSegmentsWithLlm(
          segmentLlmConfig,
          questionList,
          audioSegments,
          deps.onCorpusTrace,
          deps.onStream ? (update) => deps.onStream?.({ step: "segment", ...update }) : undefined,
        );
        if (assigned) {
          questionTimings = assigned.timings;
          questionAnswers = questionAnswers
            ? questionAnswers.map((item, idx) => ({
                question: item.question,
                answer: item.answer.trim() ? item.answer : assigned.answers[idx]?.answer || "",
              }))
            : assigned.answers;
        } else if (!questionTimings.length) {
          llmTimingFailed = true;
        }
      }
    }
    if (!questionTimings.length) {
      reportProgress("segment", 80, "多题分段 80% · 正在远程兜底", "running");
      const assigned = await it_assignSegmentsWithLlm(
        segmentLlmConfig,
        questionList,
        audioSegments,
        deps.onCorpusTrace,
        deps.onStream ? (update) => deps.onStream?.({ step: "segment", ...update }) : undefined,
      );
      if (assigned) {
        questionTimings = assigned.timings;
        if (!questionAnswers) {
          questionAnswers = assigned.answers;
        }
      } else {
        llmTimingFailed = true;
      }
    }
    if (!questionTimings.length) {
      llmTimingFailed = true;
    }
  } else {
    llmTimingAttempted = true;
    llmTimingFailed = true;
    reportProgress("segment", 100, "多题分段 100% · 缺少转写分段或LLM", "error");
  }

  if (!questionTimings.length && questionList.length && llmTimingFailed) {
    questionTimingNote = "无法计算（LLM分段失败）";
  }
  if (!questionAnswers && questionList.length) {
    questionAnswers = questionList.map((q) => ({
      question: q,
      answer: "",
    }));
  }
  if (questionTimings.length || questionTimingNote) {
    deps.onPartial?.({
      questionTimings: questionTimings.length ? questionTimings : undefined,
      questionTimingNote,
    });
  }

  return {
    questionTimings,
    questionTimingNote,
    questionAnswers,
    llmTimingAttempted,
    llmTimingFailed,
  };
}
