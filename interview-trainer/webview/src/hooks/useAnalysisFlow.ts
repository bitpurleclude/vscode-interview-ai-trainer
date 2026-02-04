import { useCallback, useRef, useState } from "react";
import { request } from "../messenger";
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
    if (!audioPayload) return;
    if (!hasQuestion) {
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
    setItState((prev) => ({
      ...prev,
      statusMessage: `已发起分析请求（批次：${runId}）`,
    }));
    const finalQuestionText = questionText.trim();
    const finalQuestionList = parsedQuestionList;
    const normalizedPerQuestionSystem = perQuestionSystemPrompts
      .slice(0, 3)
      .map((item) => item.trim());
    const normalizedPerQuestionDemo = perQuestionDemoPrompts
      .slice(0, 3)
      .map((item) => item.trim());
    const hasPerQuestionSystem = normalizedPerQuestionSystem.some(Boolean);
    const hasPerQuestionDemo = normalizedPerQuestionDemo.some(Boolean);
    const payload: ItAnalyzeRequest = {
      audio: audioPayload,
      questionText: finalQuestionText || undefined,
      questionList: finalQuestionList,
      systemPrompt: customPrompt?.trim() || undefined,
      demoPrompt: demoPrompt?.trim() || undefined,
      perQuestionSystemPrompts: hasPerQuestionSystem ? normalizedPerQuestionSystem : undefined,
      perQuestionDemoPrompts: hasPerQuestionDemo ? normalizedPerQuestionDemo : undefined,
      runId,
    };
    try {
      const response = await request("it/analyzeAudio", payload, { timeoutMs: 5 * 60 * 1000 });
      if (analysisCancelledRef.current || currentRun !== analysisRunRef.current) {
        return;
      }
      if (response?.status === "success") {
        setAnalysisResult(response.content);
        const resolvedText = String(response.content?.questionText || "").trim();
        const resolvedList = Array.isArray(response.content?.questionList)
          ? response.content.questionList.map((item: any) => String(item)).filter(Boolean)
          : [];
        if (resolvedText && resolvedText !== questionText.trim()) {
          setQuestionText(resolvedText);
        }
        if (resolvedList.length) {
          setQuestionList(resolvedList.join("\n"));
          setQuestionParsed(true);
          setQuestionError(false);
        }
        setActiveTab("evaluation");
      } else if (response?.error && String(response.error).includes("分析已停止")) {
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析已停止",
          lastError: undefined,
        }));
      } else {
        setItState((prev) => ({
          ...prev,
          statusMessage: "分析失败，请检查配置或网络",
        }));
      }
    } finally {
      if (!analysisCancelledRef.current && currentRun === analysisRunRef.current) {
        setIsProcessing(false);
      }
    }
  };

  const handleRegenerateDemoAnswer = useCallback(
    async (index: number) => {
      const current = analysisResult?.evaluation?.revisedAnswers?.[index];
      if (!current) return;
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
        } else {
          setItState((prev) => ({
            ...prev,
            statusMessage: response?.error
              ? `示范重生成失败：${response.error}`
              : "示范重生成失败",
          }));
        }
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
    if (!isProcessing) return;
    analysisCancelledRef.current = true;
    setIsProcessing(false);
    setItState((prev) => ({
      ...prev,
      statusMessage: "已请求停止分析",
      lastError: undefined,
    }));
    try {
      await request("it/cancelAnalyze");
    } catch {
      // ignore
    }
  };

  const handleSaveResult = async () => {
    if (!analysisResult) {
      setSaveResultMessage("暂无可保存的结果");
      return;
    }
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
        setSaveResultMessage("结果已写入");
      } else {
        setSaveResultMessage("保存失败，请重试");
      }
    } catch (err) {
      setSaveResultMessage(
        `保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingResult(false);
  };

  const handleLoadHistory = useCallback(async () => {
    const response = await request("it/listHistory", { limit: 30 });
    if (response?.status === "success") {
      setHistoryItems(response.content ?? []);
      setActiveTab("history");
      setActivePage("practice");
    }
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
