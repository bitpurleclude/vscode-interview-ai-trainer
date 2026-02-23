import { useCallback, useRef, useState } from "react";
import { reportClientTrace, request } from "../messenger";
import {
  it_buildAnalyzePayload,
  it_resolveAnalyzeQuestionsFromResponse,
  it_shouldIgnoreAnalyzeResponse,
} from "./useAnalysisFlow.contract";
import type { ItAnalyzeRequest, ItAnalyzeResponse, ItHistoryItem, ItState } from "../types";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";
type ActivePage = "practice" | "settings";

type UseAnalysisFlowOptions = {
  audioPayload: ItAnalyzeRequest["audio"] | null;
  hasQuestion: boolean;
  questionText: string;
  parsedQuestionList: string[];
  perQuestionSystemPrompts: string[];
  perQuestionDemoPrompts: string[];
  customPrompt: string;
  demoPrompt: string;
  itState: ItState;
  setItState: React.Dispatch<React.SetStateAction<ItState>>;
  setQuestionText: React.Dispatch<React.SetStateAction<string>>;
  setQuestionList: React.Dispatch<React.SetStateAction<string>>;
  setQuestionParsed: React.Dispatch<React.SetStateAction<boolean>>;
  setQuestionError: React.Dispatch<React.SetStateAction<boolean>>;
  setActiveTab: React.Dispatch<React.SetStateAction<ResultTab>>;
  setActivePage: React.Dispatch<React.SetStateAction<ActivePage>>;
  setShowNoteHits: React.Dispatch<React.SetStateAction<boolean>>;
  resetStreams: () => void;
  resetEvaluationStream: (index: number) => void;
};

function traceAnalysisAction(
  action: string,
  status: string,
  detail: Record<string, unknown> = {},
  level: "debug" | "info" | "warn" | "error" = status === "error" ? "error" : "info",
): void {
  reportClientTrace({
    level,
    event: `webview.analysis.${action}`,
    status,
    message: `analysis ${action} ${status}`,
    detail,
  });
}

export function useAnalysisFlow({
  audioPayload,
  hasQuestion,
  questionText,
  parsedQuestionList,
  perQuestionSystemPrompts,
  perQuestionDemoPrompts,
  customPrompt,
  demoPrompt,
  itState,
  setItState,
  setQuestionText,
  setQuestionList,
  setQuestionParsed,
  setQuestionError,
  setActiveTab,
  setActivePage,
  setShowNoteHits,
  resetStreams,
  resetEvaluationStream,
}: UseAnalysisFlowOptions) {
  const [analysisResult, setAnalysisResult] = useState<ItAnalyzeResponse | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  const [saveResultMessage, setSaveResultMessage] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<ItHistoryItem[]>([]);
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(null);
  const analysisRunRef = useRef(0);
  const analysisCancelledRef = useRef(false);

  const handleAnalyze = async () => {
    if (!audioPayload) {
      traceAnalysisAction("run", "ignored", { reason: "missing_audio" }, "warn");
      return;
    }
    if (!hasQuestion) {
      traceAnalysisAction("run", "error", { reason: "missing_question" }, "warn");
      setQuestionError(true);
      setItState((prev) => ({
        ...prev,
        statusMessage: "请先填写题干或导入题干文件后再分析。",
        lastError: {
          type: "question",
          reason: "题干信息缺失",
          solution: "请输入题干文本或导入 txt/md 文件。",
        },
      }));
      return;
    }
    resetStreams();
    setIsProcessing(true);
    setShowNoteHits(false);
    analysisCancelledRef.current = false;
    analysisRunRef.current += 1;
    const currentRun = analysisRunRef.current;
    const runId = new Date().toISOString();
    traceAnalysisAction("run", "start", {
      runId,
      questionCount: parsedQuestionList.length,
      perQuestionPromptCount: perQuestionSystemPrompts.filter((item) => item.trim()).length,
    });
    setItState((prev) => ({
      ...prev,
      statusMessage: `已发起分析请求（批次：${runId}）`,
    }));
    const payload: ItAnalyzeRequest = it_buildAnalyzePayload({
      audio: audioPayload,
      questionText,
      questionList: parsedQuestionList,
      customPrompt,
      demoPrompt,
      perQuestionSystemPrompts,
      perQuestionDemoPrompts,
      runId,
    });
    try {
      const response = await request("it/analyzeAudio", payload, { timeoutMs: 5 * 60 * 1000 });
      if (
        it_shouldIgnoreAnalyzeResponse({
          cancelled: analysisCancelledRef.current,
          runId: currentRun,
          activeRunId: analysisRunRef.current,
        })
      ) {
        traceAnalysisAction("run", "ignored", { runId, reason: "stale_or_cancelled" }, "debug");
        return;
      }
      if (response?.status === "success") {
        setAnalysisResult(response.content);
        const resolved = it_resolveAnalyzeQuestionsFromResponse(response.content);
        const resolvedText = resolved.questionText;
        const resolvedList = resolved.questionList;
        if (resolvedText && resolvedText !== questionText.trim()) {
          setQuestionText(resolvedText);
        }
        if (resolvedList.length) {
          setQuestionList(resolvedList.join("\n"));
          setQuestionParsed(true);
          setQuestionError(false);
        }
        setActiveTab("evaluation");
        traceAnalysisAction("run", "success", {
          runId,
          questionCount: resolvedList.length || parsedQuestionList.length,
        });
      } else if (response?.error && String(response.error).includes("分析已停止")) {
        traceAnalysisAction("run", "canceled", { runId, reason: "cancel_ack" });
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析已停止",
          lastError: undefined,
        }));
      } else {
        traceAnalysisAction(
          "run",
          "error",
          { runId, error: String(response?.error || "unknown_error") },
          "error",
        );
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析失败，请检查配置或网络",
        }));
      }
    } catch (error) {
      traceAnalysisAction(
        "run",
        "error",
        {
          runId,
          error: error instanceof Error ? error.message : String(error),
        },
        "error",
      );
      setItState((prev) => ({
        ...prev,
        statusMessage: "分析失败，请检查配置或网络",
      }));
    } finally {
      if (!analysisCancelledRef.current && currentRun === analysisRunRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const handleRegenerateDemoAnswer = useCallback(
    async (index: number) => {
      const current = analysisResult?.evaluation?.revisedAnswers?.[index];
      if (!current) {
        traceAnalysisAction("regenerate_demo", "ignored", { index, reason: "missing_answer" }, "warn");
        return;
      }
      traceAnalysisAction("regenerate_demo", "start", { index });
      setRegeneratingIndex(index);
      resetEvaluationStream(index);
      try {
        const contextQuestions =
          Array.isArray(analysisResult?.questionList) && analysisResult.questionList.length
            ? analysisResult.questionList
            : parsedQuestionList.length
              ? parsedQuestionList
              : analysisResult?.questionText?.trim()
                ? [analysisResult.questionText.trim()]
                : questionText.trim()
                  ? [questionText.trim()]
                  : [];
        const payload = {
          question: current.question,
          answer: current.original || "",
          questionText: analysisResult?.questionText || questionText.trim(),
          contextQuestions,
          questionIndex: index,
          notes: analysisResult?.notes ?? itState.draftNotes ?? [],
          acoustic: analysisResult?.acoustic ?? itState.draftAcoustic,
          systemPrompt: [customPrompt?.trim(), perQuestionSystemPrompts[index]?.trim()]
            .filter(Boolean)
            .join("\n\n"),
          demoPrompt: [demoPrompt?.trim(), perQuestionDemoPrompts[index]?.trim()]
            .filter(Boolean)
            .join("\n\n"),
        };
        const response = await request("it/regenerateDemoAnswer", payload, {
          timeoutMs: 120_000,
        });
        if (response?.status === "success" && response.content) {
          setAnalysisResult((prev) => {
            if (!prev?.evaluation?.revisedAnswers) return prev;
            const revisedAnswers = [...prev.evaluation.revisedAnswers];
            const previous = revisedAnswers[index];
            const updated = { ...previous, ...response.content };
            if (!updated.original) {
              updated.original = previous?.original || "";
            }
            revisedAnswers[index] = updated;
            return {
              ...prev,
              evaluation: {
                ...prev.evaluation,
                revisedAnswers,
              },
            };
          });
          traceAnalysisAction("regenerate_demo", "success", {
            index,
            hasDemo: Boolean(response.content?.demoAnswer),
          });
        } else {
          traceAnalysisAction(
            "regenerate_demo",
            "error",
            { index, error: String(response?.error || "unknown_error") },
            "error",
          );
          setItState((prev) => ({
            ...prev,
            statusMessage: response?.error
              ? `示范重生成失败：${response.error}`
              : "示范重生成失败",
          }));
        }
      } catch (error) {
        traceAnalysisAction(
          "regenerate_demo",
          "error",
          { index, error: error instanceof Error ? error.message : String(error) },
          "error",
        );
        setItState((prev) => ({
          ...prev,
          statusMessage: "示范重生成失败",
        }));
      } finally {
        setRegeneratingIndex((prev) => (prev === index ? null : prev));
      }
    },
    [
      analysisResult,
      parsedQuestionList,
      questionText,
      customPrompt,
      demoPrompt,
      perQuestionSystemPrompts,
      perQuestionDemoPrompts,
      itState.draftNotes,
      itState.draftAcoustic,
      resetEvaluationStream,
      setItState,
    ],
  );

  const handleCancelAnalyze = async () => {
    if (!isProcessing) {
      traceAnalysisAction("cancel", "ignored", { reason: "not_processing" }, "debug");
      return;
    }
    traceAnalysisAction("cancel", "start", { runId: analysisRunRef.current });
    analysisCancelledRef.current = true;
    setIsProcessing(false);
    setItState((prev) => ({
      ...prev,
      statusMessage: "已请求停止分析",
      lastError: undefined,
    }));
    try {
      await request("it/cancelAnalyze");
      traceAnalysisAction("cancel", "success", { runId: analysisRunRef.current });
    } catch (error) {
      traceAnalysisAction(
        "cancel",
        "error",
        {
          runId: analysisRunRef.current,
          error: error instanceof Error ? error.message : String(error),
        },
        "error",
      );
    }
  };

  const handleSaveResult = async () => {
    if (!analysisResult) {
      traceAnalysisAction("save_result", "ignored", { reason: "missing_result" }, "warn");
      setSaveResultMessage("暂无可保存的结果");
      return;
    }
    traceAnalysisAction("save_result", "start", {
      questionCount: parsedQuestionList.length,
      hasTopicTitle: Boolean(analysisResult.evaluation?.topicTitle),
    });
    setSavingResult(true);
    setSaveResultMessage(null);
    try {
      const resp = await request("it/saveCurrentResult", {
        response: analysisResult,
        questionText: questionText.trim(),
        questionList: parsedQuestionList,
        topicTitle: analysisResult.evaluation?.topicTitle || "",
      });
      if (resp?.status === "success") {
        traceAnalysisAction("save_result", "success", {
          resultPath: String(resp?.content?.filePath || ""),
        });
        setSaveResultMessage("结果已写入");
      } else {
        const errorMessage = String(resp?.error || "unknown_error");
        traceAnalysisAction(
          "save_result",
          "error",
          { error: errorMessage },
          "error",
        );
        setSaveResultMessage(`保存失败：${errorMessage}`);
      }
    } catch (err) {
      traceAnalysisAction(
        "save_result",
        "error",
        { error: err instanceof Error ? err.message : String(err) },
        "error",
      );
      setSaveResultMessage(
        `保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingResult(false);
  };

  const handleLoadHistory = useCallback(async () => {
    traceAnalysisAction("load_history", "start", { limit: 30 });
    const response = await request("it/listHistory", { limit: 30 });
    if (response?.status === "success") {
      const itemCount = Array.isArray(response.content) ? response.content.length : 0;
      traceAnalysisAction("load_history", "success", { itemCount });
      setHistoryItems(response.content ?? []);
      setActiveTab("history");
      setActivePage("practice");
      return;
    }
    traceAnalysisAction(
      "load_history",
      "error",
      { error: String(response?.error || "unknown_error") },
      "error",
    );
  }, [setActivePage, setActiveTab]);

  return {
    analysisResult,
    isProcessing,
    savingResult,
    saveResultMessage,
    historyItems,
    regeneratingIndex,
    handleAnalyze,
    handleRegenerateDemoAnswer,
    handleCancelAnalyze,
    handleSaveResult,
    handleLoadHistory,
  };
}
