import type {
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import type { ItTemplateRuntime } from "../../infra/api/it_templateExecutor";
import { it_parseQuestions } from "../../application/services/it_questionParser";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../../infra/storage/it_questionCache";
import type { ItAnalyzeDeps, ItQuestionState } from "./flow_types";

type QuestionParseStageInput = {
  deps: ItAnalyzeDeps;
  questionText: string;
  questionList: string[];
  questionParseRuntime: ItTemplateRuntime | null;
  questionParseLlmConfig: ItLlmConfig | null;
  cacheRoot: string | undefined;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
};

export type QuestionParseStageResult = {
  questionState: ItQuestionState;
  parsePromise: Promise<void> | null;
};

export function it_prepareQuestionParseStage({
  deps,
  questionText,
  questionList,
  questionParseRuntime,
  questionParseLlmConfig,
  cacheRoot,
  reportProgress,
}: QuestionParseStageInput): QuestionParseStageResult {
  const questionState: ItQuestionState = {
    text: questionText,
    list: questionList.filter((q) => q.trim()),
  };
  const needsQuestionParse = questionState.list.length === 0;
  if (needsQuestionParse && questionState.text && !questionParseRuntime) {
    throw new Error("LLM 模板未绑定：请在设置中绑定题目解析模板。");
  }

  const parseStart = Date.now();
  let parsePromise: Promise<void> | null = null;
  const parseInput = questionState.text;
  if (questionState.list.length) {
    reportProgress(
      "question",
      100,
      `题目已提供 · ${questionState.list.length}题 · 本地`,
      "success",
    );
  } else {
    const cached = cacheRoot ? it_readQuestionParseCache(cacheRoot, parseInput) : null;
    parsePromise = Promise.resolve(cached)
      .then(async (cachedResult) => {
        const cachedResolved = cachedResult ? await cachedResult : null;
        const hasCachedQuestions = Boolean(
          cachedResolved && cachedResolved.questions.length,
        );
        if (hasCachedQuestions) {
          if (cachedResolved?.material) {
            questionState.text = cachedResolved.material;
          }
          questionState.list = cachedResolved?.questions ?? [];
          reportProgress(
            "question",
            100,
            `题目解析 100% · 缓存 · ${questionState.list.length}题`,
            "success",
          );
          return;
        }

        const prefix =
          cachedResolved && (cachedResolved.material || cachedResolved.questions.length)
            ? "题目解析 5% · 缓存未识别，重新解析"
            : "题目解析 5% · 本地";
        reportProgress("question", 5, prefix, "running");
        try {
          const parsed = await it_parseQuestions(
            questionState.text,
            questionParseLlmConfig,
            deps.onStream
              ? (update) => deps.onStream?.({ step: "question", ...update })
              : undefined,
            deps.onCorpusTrace,
          );
          const elapsed = ((Date.now() - parseStart) / 1000).toFixed(1);
          const sourceLabel = parsed.source === "llm" ? "API" : "本地";
          if (parsed.material) {
            questionState.text = parsed.material;
          }
          if (parsed.questions.length) {
            questionState.list = parsed.questions;
          }
          if (cacheRoot && (parsed.material || parsed.questions.length)) {
            await it_writeQuestionParseCache(cacheRoot, parseInput, {
              material: parsed.material || "",
              questions: parsed.questions || [],
              source: parsed.source,
            });
          }
          if (questionState.list.length) {
            reportProgress(
              "question",
              100,
              `题目解析 100% · ${questionState.list.length}题 · ${elapsed}s · ${sourceLabel}`,
              "success",
            );
          } else {
            reportProgress(
              "question",
              100,
              `题目解析完成 · 未识别题目 · ${elapsed}s · ${sourceLabel}`,
              "error",
            );
          }
        } catch {
          reportProgress("question", 100, "题目解析失败，使用原题干", "error");
        }
      })
      .catch(() => {
        reportProgress("question", 100, "题目解析失败，使用原题干", "error");
      });
  }

  return {
    questionState,
    parsePromise,
  };
}
