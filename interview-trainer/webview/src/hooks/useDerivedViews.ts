import { useMemo } from "react";
import type {
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItState,
  ItTemplateCategory,
  ItTemplateParamCatalog,
  ItTemplateParamUsage,
} from "../types";

type UseDerivedViewsOptions = {
  config: ItConfigSnapshot | null;
  itState: ItState;
  templateCategory: ItTemplateCategory;
  selectedTemplateId: string;
  questionText: string;
  parsedQuestionList: string[];
  streamingPreviewChars: number;
  analysisResult: ItAnalyzeResponse | null;
};

export function useDerivedViews({
  config,
  itState,
  templateCategory,
  selectedTemplateId,
  questionText,
  parsedQuestionList,
  streamingPreviewChars,
  analysisResult,
}: UseDerivedViewsOptions) {
  const templatesSnapshot = config?.templates;
  const templatesList = useMemo(() => templatesSnapshot?.templates ?? [], [templatesSnapshot]);
  const templatesByCategory = useMemo(
    () => templatesList.filter((template) => template.category === templateCategory),
    [templatesList, templateCategory],
  );
  const selectedTemplate = useMemo(
    () => templatesList.find((item) => item.id === selectedTemplateId) || null,
    [templatesList, selectedTemplateId],
  );
  const templateParamCatalog: ItTemplateParamCatalog | undefined =
    templatesSnapshot?.paramCatalog;
  const templateParamUsage: ItTemplateParamUsage | undefined =
    templatesSnapshot?.paramUsage?.[selectedTemplate?.id || ""];
  const paramCatalogList = useMemo(() => {
    const common = templateParamCatalog?.common ?? [];
    const scoped =
      templateCategory === "llm"
        ? templateParamCatalog?.llm ?? []
        : templateCategory === "asr"
          ? templateParamCatalog?.asr ?? []
          : templateCategory === "embedding"
            ? templateParamCatalog?.embedding ?? []
            : templateCategory === "token"
              ? templateParamCatalog?.token ?? []
            : [];
    return Array.from(new Set([...common, ...scoped]));
  }, [templateParamCatalog, templateCategory]);
  const templateUsageSets = useMemo(
    () => ({
      used: new Set(templateParamUsage?.used ?? []),
      unused: new Set(templateParamUsage?.unused ?? []),
      unknown: new Set(templateParamUsage?.unknown ?? []),
      empty: new Set(templateParamUsage?.empty ?? []),
    }),
    [templateParamUsage],
  );
  const llmTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "llm"),
    [templatesList],
  );
  const asrTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "asr"),
    [templatesList],
  );
  const embeddingTemplates = useMemo(
    () => templatesList.filter((template) => template.category === "embedding"),
    [templatesList],
  );
  const embeddingWarmup = itState.embeddingWarmup;
  const showEmbeddingWarmup = Boolean(embeddingWarmup && embeddingWarmup.status !== "idle");

  const thinkingVisible = useMemo(() => {
    return itState.steps.some(
      (step) =>
        step.status === "running" &&
        ["question", "acoustic", "asr", "notes", "evaluation"].includes(step.id),
    );
  }, [itState]);

  const fallbackQuestions = useMemo(() => {
    const raw = questionText.trim();
    if (!raw) {
      return [];
    }
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const numbered: string[] = [];
    lines.forEach((line) => {
      const match = line.match(/^\d+[\.\、\)\s]+/);
      if (!match) {
        return;
      }
      const trimmed = line.slice(match[0].length).trim();
      if (trimmed) {
        numbered.push(trimmed);
      }
    });
    if (numbered.length) {
      return numbered;
    }
    return [raw];
  }, [questionText]);

  const evaluationStreamQuestions = useMemo(() => {
    const list =
      (analysisResult?.questionList && analysisResult.questionList.length
        ? analysisResult.questionList
        : parsedQuestionList.length
          ? parsedQuestionList
          : fallbackQuestions) || [];
    if (list.length) {
      return list.slice(0, 3);
    }
    return [];
  }, [analysisResult, parsedQuestionList, fallbackQuestions]);

  const retrievalDirs = useMemo(() => {
    if (!config) {
      return [];
    }
    return [
      { key: "notes", label: "笔记", value: config.workspaceDirs.notesDir },
      { key: "prompts", label: "题干材料", value: config.workspaceDirs.promptsDir },
      { key: "rubrics", label: "评分标准", value: config.workspaceDirs.rubricsDir },
      { key: "knowledge", label: "知识库", value: config.workspaceDirs.knowledgeDir },
      { key: "examples", label: "示例答案", value: config.workspaceDirs.examplesDir },
    ];
  }, [config]);

  const transcriptPreview = analysisResult?.transcript || itState.draftTranscript || "";
  const detailedTranscriptPreview =
    analysisResult?.detailedTranscript || itState.draftDetailedTranscript;
  const acousticPreview = analysisResult?.acoustic || itState.draftAcoustic;
  const notesPreview = analysisResult?.notes ?? itState.draftNotes;
  const questionTimingsPreview =
    analysisResult?.questionTimings ?? itState.draftQuestionTimings;
  const questionTimingNotePreview =
    analysisResult?.questionTimingNote ?? itState.draftQuestionTimingNote;
  const evaluationPreview = analysisResult?.evaluation || itState.draftEvaluation || null;
  const retrievalCacheInfo = config?.retrievalCache;
  const corpusCachePath = retrievalCacheInfo?.corpusCacheDir || "";
  const embeddingCachePath = retrievalCacheInfo?.embeddingCacheDir || "";
  const corpusCacheMb = retrievalCacheInfo?.corpusCacheMb;
  const queryCacheSize = retrievalCacheInfo?.queryCacheSize;
  const maxConcurrency = retrievalCacheInfo?.maxConcurrency;
  const hasAnyResult =
    Boolean(analysisResult) ||
    Boolean(itState.draftTranscript) ||
    Boolean(itState.draftDetailedTranscript) ||
    Boolean(itState.draftEvaluation) ||
    Boolean(itState.draftAcoustic) ||
    typeof itState.draftNotes !== "undefined" ||
    Boolean(itState.draftQuestionTimings) ||
    Boolean(itState.draftQuestionTimingNote);
  const hasTranscriptContent = Boolean(
    analysisResult || itState.draftTranscript || itState.draftDetailedTranscript,
  );
  const streamPreviewChars = Math.max(50, streamingPreviewChars || 200);

  return {
    templatesList,
    templatesByCategory,
    selectedTemplate,
    paramCatalogList,
    templateUsageSets,
    llmTemplates,
    asrTemplates,
    embeddingTemplates,
    embeddingWarmup,
    showEmbeddingWarmup,
    thinkingVisible,
    evaluationStreamQuestions,
    retrievalDirs,
    transcriptPreview,
    detailedTranscriptPreview,
    acousticPreview,
    notesPreview,
    questionTimingsPreview,
    questionTimingNotePreview,
    evaluationPreview,
    retrievalCacheInfo,
    corpusCachePath,
    embeddingCachePath,
    corpusCacheMb,
    queryCacheSize,
    maxConcurrency,
    hasAnyResult,
    hasTranscriptContent,
    streamPreviewChars,
  };
}
