import { useCallback, useEffect, useMemo, useState } from "react";
import { parseQuestionsRemote } from "../utils/questions";
import type { ItState } from "../types";

type UseQuestionInputOptions = {
  setItState: React.Dispatch<React.SetStateAction<ItState>>;
};

export function useQuestionInput({ setItState }: UseQuestionInputOptions) {
  const [questionText, setQuestionText] = useState("");
  const [questionList, setQuestionList] = useState("");
  const [questionParsed, setQuestionParsed] = useState(false);
  const [questionParsing, setQuestionParsing] = useState(false);
  const [questionError, setQuestionError] = useState(false);

  const parsedQuestionList = useMemo(
    () =>
      questionList
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean),
    [questionList],
  );

  const hasQuestion = useMemo(
    () => questionText.trim().length > 0 || parsedQuestionList.length > 0,
    [questionText, parsedQuestionList],
  );

  useEffect(() => {
    if (questionError && hasQuestion) {
      setQuestionError(false);
    }
  }, [questionError, hasQuestion]);

  const handleQuestionTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setQuestionText(event.target.value);
      if (questionParsed) {
        setQuestionParsed(false);
      }
    },
    [questionParsed],
  );

  const handleQuestionListChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setQuestionList(event.target.value);
      if (questionParsed) {
        setQuestionParsed(false);
      }
    },
    [questionParsed],
  );

  const parseQuestionsFromText = useCallback(
    async (
      rawText: string,
      options: { silent?: boolean; fallbackPrompt?: string } = {},
    ) => {
      const input = rawText.trim();
      const fallbackPrompt = options.fallbackPrompt ?? questionText.trim();
      if (!input) {
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "题干内容为空，无法识别题目。",
            lastError: {
              type: "question",
              reason: "题干内容为空",
              solution: "请粘贴题干或小题列表后再识别。",
            },
          }));
        }
        return {
          questionText: fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      }
      setQuestionParsing(true);
      setQuestionParsed(false);
      if (!options.silent) {
        setItState((prev) => ({
          ...prev,
          statusMessage: "题目识别中，请稍候...",
        }));
      }
      try {
        const remote = await parseQuestionsRemote(input);
        if (remote && remote.questions.length) {
          const nextPrompt = remote.prompt || fallbackPrompt;
          const nextList = remote.questions;
          setQuestionText(nextPrompt);
          setQuestionList(nextList.join("\n"));
          setQuestionParsed(true);
          setQuestionError(false);
          if (!options.silent) {
            setItState((prev) => ({
              ...prev,
              statusMessage: `题目已识别，识别${nextList.length}题（${remote.source}）。`,
            }));
          }
          return {
            questionText: nextPrompt,
            questionList: nextList,
            recognized: true,
          };
        }
        if (remote?.prompt && !questionText.trim()) {
          setQuestionText(remote.prompt);
        }
        setQuestionParsed(false);
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "未识别到题目，请手动拆分。",
          }));
        }
        return {
          questionText: remote?.prompt || fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      } catch (err) {
        setQuestionParsed(false);
        if (!options.silent) {
          setItState((prev) => ({
            ...prev,
            statusMessage: "题目识别失败，请检查配置或网络。",
            lastError: {
              type: "question",
              reason: err instanceof Error ? err.message : String(err),
              solution: "请检查网络或 LLM 配置后重试。",
            },
          }));
        }
        return {
          questionText: fallbackPrompt,
          questionList: parsedQuestionList,
          recognized: false,
        };
      } finally {
        setQuestionParsing(false);
      }
    },
    [parsedQuestionList, questionText, setItState],
  );

  const handleImportQuestions = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        setQuestionText(text.trim());
        setQuestionList("");
        setQuestionParsed(false);
        setQuestionError(false);
        setItState((prev) => ({
          ...prev,
          statusMessage: `已导入题干：${file.name}（未解析，开始分析时识别）`,
        }));
      } catch (err) {
        setItState((prev) => ({
          ...prev,
          statusMessage: "题干文件读取失败，请检查文件编码或格式。",
          lastError: {
            type: "question",
            reason: err instanceof Error ? err.message : String(err),
            solution: "请使用 UTF-8 编码的 txt 或 md 文件重试。",
          },
        }));
      } finally {
        event.target.value = "";
      }
    },
    [setItState],
  );

  const buildQuestionParseInput = useCallback(() => {
    const text = questionText.trim();
    const list = questionList.trim();
    if (text && list) {
      return `${text}\n\n${list}`;
    }
    return text || list;
  }, [questionText, questionList]);

  const handleParseQuestions = useCallback(async () => {
    const merged = buildQuestionParseInput();
    await parseQuestionsFromText(merged, {
      fallbackPrompt: questionText.trim(),
    });
  }, [buildQuestionParseInput, parseQuestionsFromText, questionText]);

  return {
    questionText,
    setQuestionText,
    questionList,
    setQuestionList,
    questionParsed,
    setQuestionParsed,
    questionParsing,
    questionError,
    setQuestionError,
    parsedQuestionList,
    hasQuestion,
    handleQuestionTextChange,
    handleQuestionListChange,
    parseQuestionsFromText,
    handleImportQuestions,
    handleParseQuestions,
  };
}
