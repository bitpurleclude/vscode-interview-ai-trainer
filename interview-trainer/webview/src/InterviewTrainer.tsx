import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  ItApiTemplate,
  ItConfigSnapshot,
  ItState,
  ItTemplateBindings,
  ItTemplateCategory,
  ItTemplateParamCatalog,
  ItTemplateParamUsage,
} from "./types";
import { on, request } from "./messenger";
import { STRICT_SYSTEM_PROMPT, DEFAULT_DEMO_PROMPT } from "./constants/prompts";
import { SettingsPage } from "./components/settings/SettingsPage";
import { InterviewHeader } from "./components/practice/InterviewHeader";
import { InterviewStatus } from "./components/practice/InterviewStatus";
import { PracticeFlow } from "./components/practice/PracticeFlow";
import { ResultsPanel } from "./components/practice/ResultsPanel";
import { formatSeconds } from "./utils/format";
import { buildOutlineTree, renderOutlineTree, renderParagraphs } from "./utils/outline";
import { cloneTemplate, formatJson, parseJson } from "./utils/template";
import { parseQuestionsRemote } from "./utils/questions";
import { useStreaming } from "./hooks/useStreaming";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAnalysisFlow } from "./hooks/useAnalysisFlow";
import "./styles.css";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";

const DEFAULT_STATE: ItState = {
  statusMessage: "等待开始面试训练",
  overallProgress: 0,
  recordingState: "idle",
  draftTranscript: undefined,
  draftDetailedTranscript: undefined,
  draftAcoustic: undefined,
  draftNotes: undefined,
  draftQuestionTimings: undefined,
  draftQuestionTimingNote: undefined,
  draftEvaluation: undefined,
  embeddingWarmup: {
    status: "idle",
    progress: 0,
    total: 0,
    done: 0,
  },
  steps: [
    { id: "init", status: "success", progress: 100 },
    { id: "question", status: "pending", progress: 0 },
    { id: "recording", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "segment", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ],
};

const InterviewTrainer: React.FC = () => {
  const [itState, setItState] = useState<ItState>(DEFAULT_STATE);
  const [config, setConfig] = useState<ItConfigSnapshot | null>(null);
  const [activeTab, setActiveTab] = useState<ResultTab>("transcript");
  const [questionText, setQuestionText] = useState("");
  const [questionList, setQuestionList] = useState("");
  const [questionParsed, setQuestionParsed] = useState(false);
  const [questionParsing, setQuestionParsing] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(STRICT_SYSTEM_PROMPT);
  const [demoPrompt, setDemoPrompt] = useState(DEFAULT_DEMO_PROMPT);
  const [answerMode, setAnswerMode] = useState<"single" | "two-step">("two-step");
  const [perQuestionSystemPrompts, setPerQuestionSystemPrompts] = useState<string[]>(
    ["", "", ""],
  );
  const [perQuestionDemoPrompts, setPerQuestionDemoPrompts] = useState<string[]>(
    ["", "", ""],
  );
  const [streamingSettings, setStreamingSettings] = useState({
    enabled: true,
    autoCollapse: true,
    previewChars: 200,
  });
  const {
    stepStreams,
    evaluationStreams,
    resetStreams,
    resetEvaluationStream,
    handleToggleStepStream,
    handleToggleEvaluationStream,
  } = useStreaming({
    enabled: streamingSettings.enabled,
    autoCollapse: streamingSettings.autoCollapse,
    previewChars: streamingSettings.previewChars,
  });
  const [templateCategory, setTemplateCategory] = useState<ItTemplateCategory>("llm");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [templateDraft, setTemplateDraft] = useState<ItApiTemplate | null>(null);
  const [templateDraftOrigin, setTemplateDraftOrigin] = useState<string | null>(null);
  const [isCreatingTemplate, setIsCreatingTemplate] = useState(false);
  const [templateJsonDraft, setTemplateJsonDraft] = useState({
    headers: "{\n  \"Content-Type\": \"application/json\"\n}",
    query: "{}",
    body: "{}",
  });
  const [templateJsonErrors, setTemplateJsonErrors] = useState<
    Partial<Record<"headers" | "query" | "body", string>>
  >({});
  const [templateSaveMessage, setTemplateSaveMessage] = useState<string | null>(null);
  const [templateBindings, setTemplateBindings] = useState<ItTemplateBindings>({
    llm: {},
    asr: {},
    embedding: {},
  });
  const [templateParamOptions, setTemplateParamOptions] = useState<string[]>([]);
  const [templateParamInput, setTemplateParamInput] = useState("");
  const [templateSecrets, setTemplateSecrets] = useState<string[]>([]);
  const [secretDraft, setSecretDraft] = useState({ name: "", value: "" });
  const [secretMessage, setSecretMessage] = useState<string | null>(null);
  const [envDraftName, setEnvDraftName] = useState("");
  const [envMessage, setEnvMessage] = useState<string | null>(null);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [savingBindings, setSavingBindings] = useState(false);
  const [savingParamOptions, setSavingParamOptions] = useState(false);
  const [savingSecret, setSavingSecret] = useState(false);
  const [savingEnvironment, setSavingEnvironment] = useState(false);
  const [savingLlmParams, setSavingLlmParams] = useState(false);
  const [savingAsrParams, setSavingAsrParams] = useState(false);
  const [llmParamsMessage, setLlmParamsMessage] = useState<string | null>(null);
  const [asrParamsMessage, setAsrParamsMessage] = useState<string | null>(null);
  const [showNoteHits, setShowNoteHits] = useState(false);
  const [showDemoPrompt, setShowDemoPrompt] = useState(false);
  const [showNoteUsage, setShowNoteUsage] = useState(false);
  const [showNoteSuggestions, setShowNoteSuggestions] = useState(false);
  const [nativeInputs, setNativeInputs] = useState<string[]>([]);
  const [selectedInput, setSelectedInput] = useState<string>("");
  const [apiForm, setApiForm] = useState({
    llm: {
      model: "",
      reasoningEffort: "",
      webSearch: false,
      stream: true,
      timeoutSec: 60,
      maxRetries: 1,
      antiRepeat: false,
      reusePrefix: false,
    },
    asr: {
      language: "zh",
      devPid: 1537,
      maxChunkSec: 50,
      maxConcurrency: 1,
      timeoutSec: 120,
      maxRetries: 1,
    },
  });
  const [retrievalForm, setRetrievalForm] = useState({
    mode: "vector",
    topK: 5,
    topKNotes: 5,
    topKKnowledge: 5,
    topKRubrics: 5,
    topKExamples: 5,
    maxConcurrency: 3,
    embeddingMaxConcurrency: 1,
    minScore: 0.2,
    vector: {
      batchSize: 16,
      queryMaxChars: 1500,
    },
  });
  const [savingRetrieval, setSavingRetrieval] = useState(false);
  const [retrievalSaveMessage, setRetrievalSaveMessage] = useState<string | null>(null);
  const [clearingEmbeddingCache, setClearingEmbeddingCache] = useState(false);
  const [embeddingCacheMessage, setEmbeddingCacheMessage] = useState<string | null>(
    null,
  );
  const [clearingCorpusCache, setClearingCorpusCache] = useState(false);
  const [corpusCacheMessage, setCorpusCacheMessage] = useState<string | null>(null);
  const [traceLogEnabled, setTraceLogEnabled] = useState(false);
  const [promptSaveMessage, setPromptSaveMessage] = useState<string | null>(null);
  const [promptSaveScope, setPromptSaveScope] = useState<
    "evaluation" | "demo" | "per-question" | null
  >(null);
  const [topicTitleMode, setTopicTitleMode] = useState<"llm" | "simple">("llm");
  const [topicTitleLen, setTopicTitleLen] = useState(18);
  const [savingTopicSettings, setSavingTopicSettings] = useState(false);
  const [topicSaveMessage, setTopicSaveMessage] = useState<string | null>(null);
  const [savingStreamingSettings, setSavingStreamingSettings] = useState(false);
  const [streamingSaveMessage, setStreamingSaveMessage] = useState<string | null>(
    null,
  );
  const [showRawOutput, setShowRawOutput] = useState(false);
  const applyProfileToForm = useCallback((cfg: ItConfigSnapshot | null) => {
    if (!cfg) return;
    setApiForm((prev) => ({
      ...prev,
      llm: {
        ...prev.llm,
        model: cfg.llm?.model || "",
        reasoningEffort: cfg.llm?.reasoningEffort || "",
        webSearch: Boolean(cfg.llm?.webSearch ?? false),
        stream: Boolean(cfg.llm?.stream ?? true),
        timeoutSec: Number(cfg.llm?.timeoutSec ?? 60),
        maxRetries: Number(cfg.llm?.maxRetries ?? 1),
        antiRepeat: Boolean(cfg.llm?.antiRepeat ?? false),
        reusePrefix: Boolean(cfg.llm?.reusePrefix ?? false),
      },
      asr: {
        ...prev.asr,
        language: cfg.asr?.language || "zh",
        devPid: Number(cfg.asr?.devPid ?? 1537),
        maxChunkSec: Number(cfg.asr?.maxChunkSec ?? 50),
        maxConcurrency: Number(cfg.asr?.maxConcurrency ?? 1),
        timeoutSec: Number(cfg.asr?.timeoutSec ?? 120),
        maxRetries: Number(cfg.asr?.maxRetries ?? 1),
      },
    }));
  }, []);
  const applyRetrievalToForm = useCallback((cfg: ItConfigSnapshot | null) => {
    if (!cfg) return;
    const retrieval = cfg.retrieval || ({} as ItConfigSnapshot["retrieval"]);
    const vector = retrieval.vector || ({} as ItConfigSnapshot["retrieval"]["vector"]);
    setRetrievalForm({
      mode: retrieval.mode || "vector",
      topK: Number(retrieval.topK ?? 5),
      topKNotes: Number(retrieval.topKNotes ?? retrieval.topK ?? 5),
      topKKnowledge: Number(retrieval.topKKnowledge ?? retrieval.topK ?? 5),
      topKRubrics: Number(retrieval.topKRubrics ?? retrieval.topK ?? 5),
      topKExamples: Number(retrieval.topKExamples ?? retrieval.topK ?? 5),
      maxConcurrency: Number(retrieval.maxConcurrency ?? 3),
      embeddingMaxConcurrency: Number(retrieval.embeddingMaxConcurrency ?? 1),
      minScore: Number(retrieval.minScore ?? 0.2),
      vector: {
        batchSize: Number(vector.batchSize ?? 16),
        queryMaxChars: Number(vector.queryMaxChars ?? 1500),
      },
    });
  }, []);
  const [activePage, setActivePage] = useState<"practice" | "settings">("practice");
  const [questionError, setQuestionError] = useState(false);
  const uiLocked = !config;
  const templatesSnapshot = config?.templates;
  const templatesList = useMemo(
    () => templatesSnapshot?.templates ?? [],
    [templatesSnapshot],
  );
  const templatesByCategory = useMemo(
    () =>
      templatesList.filter((template) => template.category === templateCategory),
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

  useEffect(() => {
    (window as any).__itReady = true;
    request("it/getState", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setItState(resp.content);
      }
    });
    request("it/getConfig", undefined).then((resp) => {
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        applyProfileToForm(resp.content);
        applyRetrievalToForm(resp.content);
        setCustomPrompt(
          resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
        );
        setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(
          resp.content.prompts?.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
        );
        setPerQuestionDemoPrompts(
          resp.content.prompts?.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
        );
      } else {
        // fallback to unlock UI even if后端出错
        const fallbackConfig: ItConfigSnapshot = {
          activeEnvironment: "prod",
          envList: ["prod"],
          llmProvider: "baidu_qianfan",
          asrProvider: "baidu_vop",
          acousticProvider: "api",
          llmProfiles: {},
          asrProfiles: {},
          providerProfiles: {},
          prompts: {
            evaluationPrompt: STRICT_SYSTEM_PROMPT,
            demoPrompt: DEFAULT_DEMO_PROMPT,
            perQuestionSystemPrompts: ["", "", ""],
            perQuestionDemoPrompts: ["", "", ""],
          },
          llmTasks: {
            questionParse: "",
            segment: "",
            evaluation: "",
          },
          llm: {
            provider: "baidu_qianfan",
            baseUrl: "https://qianfan.baidubce.com/v2",
            model: "ernie-4.5-turbo-128k",
            apiKey: "",
            temperature: 0.8,
            topP: 0.8,
            timeoutSec: 60,
            maxRetries: 1,
            useResponses: false,
            apiMode: "chat",
            responsesPath: "/v1/responses",
            toolsPreset: "",
            webSearch: false,
            reasoningEffort: "medium",
            maxOutputTokens: 800,
            reusePrefix: false,
            stream: true,
          },
          templates: {
            templates: [],
            bindings: { llm: {}, asr: {}, embedding: {} },
            paramCatalog: {
              common: ["apiKey", "secretKey", "timeoutSec", "stream"],
              llm: [
                "model",
                "messages",
                "input",
                "instructions",
                "temperature",
                "topP",
                "reasoningEffort",
                "maxOutputTokens",
                "webSearch",
                "reusePrefix",
              ],
              asr: ["audioFile", "asr.lang", "asr.dev_pid"],
              embedding: ["embeddingInput", "model"],
            },
            paramUsage: {},
            paramOptions: { reasoningEffort: ["low", "medium", "high", "xhigh"] },
            secretNames: [],
          },
          asr: {
            provider: "baidu_vop",
            baseUrl: "https://vop.baidu.com/server_api",
            apiKey: "",
            secretKey: "",
            language: "zh",
            devPid: 1537,
            mockText: "",
            maxChunkSec: 50,
            maxConcurrency: 1,
            timeoutSec: 120,
            maxRetries: 1,
          },
          sessionsDir: "sessions",
          retrievalEnabled: true,
          retrieval: {
            mode: "vector",
            topK: 5,
            minScore: 0.2,
            embeddingProvider: "volc_doubao",
            vector: {
              provider: "volc_doubao",
              baseUrl: "https://ark.cn-beijing.volces.com",
              apiKey: "",
              model: "doubao-embedding",
              timeoutSec: 30,
              maxRetries: 1,
              batchSize: 16,
              queryMaxChars: 1500,
            },
          },
          workspaceDirs: {
            notesDir: "inputs/notes",
            promptsDir: "inputs/prompts/guangdong",
            rubricsDir: "inputs/rubrics",
            knowledgeDir: "inputs/knowledge",
            examplesDir: "inputs/examples",
          },
        };
        setConfig(fallbackConfig);
        setCustomPrompt(STRICT_SYSTEM_PROMPT);
        setDemoPrompt(DEFAULT_DEMO_PROMPT);
        setPerQuestionSystemPrompts(["", "", ""]);
        setPerQuestionDemoPrompts(["", "", ""]);
        setItState((prev) => ({
          ...prev,
          statusMessage: "配置加载失败，已使用默认配置",
        }));
      }
    });
    request("it/listNativeInputs", undefined).then((resp) => {
      if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
        setNativeInputs(resp.content.inputs);
        setSelectedInput(resp.content.inputs[0] || "");
      }
    });
  }, []);

  useEffect(() => {
    if (!config) return;
    applyProfileToForm(config);
    applyRetrievalToForm(config);
    if (config.prompts) {
      setCustomPrompt(config.prompts.evaluationPrompt ?? STRICT_SYSTEM_PROMPT);
      setDemoPrompt(config.prompts.demoPrompt ?? DEFAULT_DEMO_PROMPT);
      setPerQuestionSystemPrompts(
        config.prompts.perQuestionSystemPrompts?.slice(0, 3) ?? ["", "", ""],
      );
      setPerQuestionDemoPrompts(
        config.prompts.perQuestionDemoPrompts?.slice(0, 3) ?? ["", "", ""],
      );
    }
    const nextAnswerMode = String(config.evaluation?.answerMode || "two-step");
    setAnswerMode(nextAnswerMode === "single" ? "single" : "two-step");
    const nextTitleMode = String(config.topics?.titleMode || "llm");
    setTopicTitleMode(nextTitleMode === "simple" ? "simple" : "llm");
    const nextTitleLen = Number(config.topics?.maxTitleLen ?? 18);
    setTopicTitleLen(Number.isFinite(nextTitleLen) ? nextTitleLen : 18);
    if (config.streaming) {
      const nextPreview = Number(config.streaming.previewChars ?? 200);
      setStreamingSettings({
        enabled: config.streaming.enabled !== false,
        autoCollapse: config.streaming.autoCollapse !== false,
        previewChars: Number.isFinite(nextPreview) ? Math.max(50, nextPreview) : 200,
      });
    }
    if (config.templates) {
      setTemplateBindings(config.templates.bindings || { llm: {}, asr: {}, embedding: {} });
      setTemplateParamOptions(
        config.templates.paramOptions?.reasoningEffort ?? ["low", "medium", "high", "xhigh"],
      );
      setTemplateSecrets(config.templates.secretNames ?? []);
    }
  }, [config, applyProfileToForm, applyRetrievalToForm]);

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!templatesByCategory.length) {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    if (!selectedTemplateId || !templatesByCategory.some((item) => item.id === selectedTemplateId)) {
      setSelectedTemplateId(templatesByCategory[0].id);
    }
  }, [templatesByCategory, selectedTemplateId, isCreatingTemplate]);

  useEffect(() => {
    if (isCreatingTemplate) {
      return;
    }
    if (!selectedTemplate) {
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
      return;
    }
    setTemplateDraft(cloneTemplate(selectedTemplate));
    setTemplateDraftOrigin(selectedTemplate.id);
    setTemplateJsonDraft({
      headers: formatJson(selectedTemplate.request?.headers, "{}"),
      query: formatJson(selectedTemplate.request?.query, "{}"),
      body: formatJson(selectedTemplate.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
  }, [selectedTemplate, isCreatingTemplate]);

  useEffect(() => {
    const disposeState = on("it/stateUpdate", (data) => {
      setItState(data);
    });
    const disposeConfig = on("it/configUpdate", (data) => {
      setConfig(data);
    });
    return () => {
      disposeState();
      disposeConfig();
    };
  }, []);




  const thinkingVisible = useMemo(() => {
    return itState.steps.some(
      (step) =>
        step.status === "running" &&
        ["question", "acoustic", "asr", "notes", "evaluation"].includes(step.id),
    );
  }, [itState]);

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
  const {
    audioPayload,
    isImporting,
    recordingTime,
    handleStartRecording,
    handleStopRecording,
    handleImportAudio,
  } = useAudioCapture({
    selectedInput,
    hasQuestion,
    setItState,
  });

  const {
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
  } = useAnalysisFlow({
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
  });

  useEffect(() => {
    setShowRawOutput(false);
  }, [analysisResult]);

  const evaluationStreamQuestions = useMemo(() => {
    const list =
      (analysisResult?.questionList && analysisResult.questionList.length
        ? analysisResult.questionList
        : parsedQuestionList) || [];
    if (list.length) {
      return list.slice(0, 3);
    }
    const fallback = questionText.trim();
    return fallback ? [fallback] : [];
  }, [analysisResult, parsedQuestionList, questionText]);
  const buildQuestionParseInput = useCallback(() => {
    const text = questionText.trim();
    const list = questionList.trim();
    if (text && list) {
      return `${text}\n\n${list}`;
    }
    return text || list;
  }, [questionText, questionList]);
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
  const streamPreviewChars = Math.max(50, streamingSettings.previewChars || 200);

  useEffect(() => {
    if (questionError && hasQuestion) {
      setQuestionError(false);
    }
  }, [questionError, hasQuestion]);

  const handleQuestionTextChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestionText(event.target.value);
    if (questionParsed) {
      setQuestionParsed(false);
    }
  };

  const handleQuestionListChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setQuestionList(event.target.value);
    if (questionParsed) {
      setQuestionParsed(false);
    }
  };

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
    [parsedQuestionList, questionText],
  );





  const handleImportQuestions = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
  };





  const updateTemplateRequest = useCallback(
    (patch: Partial<ItApiTemplate["request"]>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              request: {
                ...(prev.request || { method: "POST", url: "" }),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const updateTemplateResponse = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["response"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              response: {
                ...(prev.response || { mode: "json" }),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const updateTemplateStreaming = useCallback(
    (patch: Partial<NonNullable<ItApiTemplate["streaming"]>>) => {
      setTemplateDraft((prev) =>
        prev
          ? {
              ...prev,
              streaming: {
                ...(prev.streaming || {}),
                ...patch,
              },
            }
          : prev,
      );
    },
    [],
  );
  const handleCreateTemplate = useCallback(() => {
    const next = buildDefaultTemplate(templateCategory);
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: formatJson(next.request?.headers, "{}"),
      query: formatJson(next.request?.query, "{}"),
      body: formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [buildDefaultTemplate, templateCategory]);
  const handleDuplicateTemplate = useCallback(() => {
    if (!selectedTemplate) {
      return;
    }
    const next = cloneTemplate(selectedTemplate);
    next.id = "";
    next.name = `${next.name || selectedTemplate.id}-copy`;
    next.updatedAt = new Date().toISOString();
    setIsCreatingTemplate(true);
    setSelectedTemplateId("");
    setTemplateDraft(next);
    setTemplateDraftOrigin(null);
    setTemplateJsonDraft({
      headers: formatJson(next.request?.headers, "{}"),
      query: formatJson(next.request?.query, "{}"),
      body: formatJson(next.request?.body, "{}"),
    });
    setTemplateJsonErrors({});
    setTemplateSaveMessage(null);
  }, [selectedTemplate]);
  const handleCancelTemplateDraft = useCallback(() => {
    setIsCreatingTemplate(false);
    setTemplateSaveMessage(null);
    if (templatesByCategory.length) {
      setSelectedTemplateId(templatesByCategory[0].id);
    } else {
      setSelectedTemplateId("");
      setTemplateDraft(null);
      setTemplateDraftOrigin(null);
    }
  }, [templatesByCategory]);
  const handleSaveTemplate = async () => {
    if (!templateDraft) {
      return;
    }
    const id = String(templateDraft.id || "").trim();
    if (!id) {
      setTemplateSaveMessage("请填写模板 ID。");
      return;
    }
    const headersParsed = parseJson(templateJsonDraft.headers);
    const queryParsed = parseJson(templateJsonDraft.query);
    const bodyParsed = parseJson(templateJsonDraft.body);
    const errors: Partial<Record<"headers" | "query" | "body", string>> = {};
    if (!headersParsed.ok) {
      errors.headers = headersParsed.error;
    }
    if (!queryParsed.ok) {
      errors.query = queryParsed.error;
    }
    if (!bodyParsed.ok) {
      errors.body = bodyParsed.error;
    }
    setTemplateJsonErrors(errors);
    if (Object.keys(errors).length) {
      setTemplateSaveMessage("模板 JSON 格式错误，请修正后再保存。");
      return;
    }
    const responseMode = templateDraft.response?.mode || "json";
    const nextTemplate: ItApiTemplate = {
      ...templateDraft,
      id,
      name: String(templateDraft.name || id).trim() || id,
      request: {
        ...(templateDraft.request || { method: "POST", url: "" }),
        headers: headersParsed.ok ? headersParsed.value : undefined,
        query: queryParsed.ok ? queryParsed.value : undefined,
        body: bodyParsed.ok ? bodyParsed.value : undefined,
      },
      response: {
        mode: responseMode,
        textPath: templateDraft.response?.textPath || undefined,
        jsonPath: templateDraft.response?.jsonPath || undefined,
        errorPath: templateDraft.response?.errorPath || undefined,
        statusPath: templateDraft.response?.statusPath || undefined,
        doneSignal: templateDraft.response?.doneSignal || undefined,
      },
      streaming:
        responseMode === "sse"
          ? {
              eventDelimiter: templateDraft.streaming?.eventDelimiter || undefined,
              dataPrefix: templateDraft.streaming?.dataPrefix || undefined,
              deltaPath: templateDraft.streaming?.deltaPath || undefined,
              doneSignals:
                templateDraft.streaming?.doneSignals &&
                templateDraft.streaming.doneSignals.filter(Boolean).length
                  ? templateDraft.streaming.doneSignals.filter(Boolean)
                  : undefined,
              heartbeatPattern: templateDraft.streaming?.heartbeatPattern || undefined,
            }
          : undefined,
      updatedAt: new Date().toISOString(),
    };
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/saveTemplate", { template: nextTemplate });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setIsCreatingTemplate(false);
        setSelectedTemplateId(nextTemplate.id);
        setTemplateSaveMessage("模板已保存。");
      } else {
        setTemplateSaveMessage("模板保存失败，请检查输入。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `模板保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTemplate(false);
  };
  const handleDeleteTemplate = async () => {
    const templateId = selectedTemplate?.id || "";
    if (!templateId) {
      return;
    }
    const confirmed = window.confirm(`确认删除模板 ${templateId}？`);
    if (!confirmed) {
      return;
    }
    setSavingTemplate(true);
    setTemplateSaveMessage(null);
    try {
      const resp = await request("it/deleteTemplate", { templateId });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("模板已删除。");
      } else {
        setTemplateSaveMessage("删除失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `删除失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingTemplate(false);
  };
  const handleSaveTemplateBindings = async () => {
    setSavingBindings(true);
    try {
      const resp = await request("it/saveTemplateBindings", { bindings: templateBindings });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("绑定已保存。");
      } else {
        setTemplateSaveMessage("绑定保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `绑定保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingBindings(false);
  };
  const handleSaveParamOptions = async () => {
    setSavingParamOptions(true);
    try {
      const options = Array.from(new Set(templateParamOptions.map((item) => String(item).trim())))
        .filter(Boolean);
      const resp = await request("it/saveTemplateParamOptions", {
        options: { reasoning_effort: options },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setTemplateSaveMessage("参数选项已保存。");
      } else {
        setTemplateSaveMessage("参数选项保存失败，请重试。");
      }
    } catch (err) {
      setTemplateSaveMessage(
        `参数选项保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingParamOptions(false);
  };
  const handleAddParamOption = () => {
    const raw = templateParamInput.trim();
    if (!raw) {
      return;
    }
    if (!templateParamOptions.includes(raw)) {
      setTemplateParamOptions((prev) => [...prev, raw]);
    }
    setTemplateParamInput("");
  };
  const handleSaveSecret = async () => {
    const name = secretDraft.name.trim();
    if (!name) {
      setSecretMessage("请填写密钥名称。");
      return;
    }
    setSavingSecret(true);
    setSecretMessage(null);
    try {
      const resp = await request("it/saveTemplateSecret", {
        name,
        value: secretDraft.value,
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setSecretMessage("密钥已保存。");
        setSecretDraft({ name: "", value: "" });
      } else {
        setSecretMessage("密钥保存失败，请重试。");
      }
    } catch (err) {
      setSecretMessage(`密钥保存失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingSecret(false);
  };
  const handleDeleteSecret = async (name: string) => {
    const confirmed = window.confirm(`确认删除密钥 ${name}？`);
    if (!confirmed) {
      return;
    }
    setSavingSecret(true);
    setSecretMessage(null);
    try {
      const resp = await request("it/deleteTemplateSecret", { name });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setSecretMessage("密钥已删除。");
      } else {
        setSecretMessage("密钥删除失败，请重试。");
      }
    } catch (err) {
      setSecretMessage(`密钥删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingSecret(false);
  };
  const handleSetActiveEnvironment = async (environment: string) => {
    if (!environment) {
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/setActiveEnvironment", { environment });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvMessage(`已切换到 ${environment}`);
      } else {
        setEnvMessage("环境切换失败。");
      }
    } catch (err) {
      setEnvMessage(`环境切换失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleCreateEnvironment = async (cloneFrom?: string) => {
    const environment = envDraftName.trim();
    if (!environment) {
      setEnvMessage("请填写环境名称。");
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/createTemplateEnvironment", {
        environment,
        cloneFrom: cloneFrom || "",
      });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvDraftName("");
        setEnvMessage("环境已创建并切换。");
      } else {
        setEnvMessage("环境创建失败。");
      }
    } catch (err) {
      setEnvMessage(`环境创建失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleDeleteEnvironment = async (environment: string) => {
    if (!environment) {
      return;
    }
    const confirmed = window.confirm(`确认删除环境 ${environment}？`);
    if (!confirmed) {
      return;
    }
    setSavingEnvironment(true);
    setEnvMessage(null);
    try {
      const resp = await request("it/deleteTemplateEnvironment", { environment });
      if (resp?.status === "success" && resp.content) {
        setConfig(resp.content);
        setEnvMessage("环境已删除。");
      } else {
        setEnvMessage("环境删除失败。");
      }
    } catch (err) {
      setEnvMessage(`环境删除失败：${err instanceof Error ? err.message : String(err)}`);
    }
    setSavingEnvironment(false);
  };
  const handleSaveLlmParams = async () => {
    setSavingLlmParams(true);
    setLlmParamsMessage(null);
    try {
      const reasoningEffort = String(apiForm.llm.reasoningEffort || "").trim();
      const resp = await request("it/updateApiSettings", {
        environment: config?.activeEnvironment,
        llm: {
          model: apiForm.llm.model,
          reasoningEffort: reasoningEffort || undefined,
          timeoutSec: Number(apiForm.llm.timeoutSec),
          maxRetries: Number(apiForm.llm.maxRetries),
          antiRepeat: Boolean(apiForm.llm.antiRepeat),
          webSearch: Boolean(apiForm.llm.webSearch),
          reusePrefix: Boolean(apiForm.llm.reusePrefix),
          stream: Boolean(apiForm.llm.stream),
        },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setLlmParamsMessage("LLM 参数已保存。");
      } else {
        setLlmParamsMessage("LLM 参数保存失败，请重试。");
      }
    } catch (err) {
      setLlmParamsMessage(
        `LLM 参数保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingLlmParams(false);
  };
  const handleSaveAsrParams = async () => {
    setSavingAsrParams(true);
    setAsrParamsMessage(null);
    try {
      const resp = await request("it/updateApiSettings", {
        environment: config?.activeEnvironment,
        asr: {
          language: apiForm.asr.language,
          devPid: Number(apiForm.asr.devPid),
          maxChunkSec: Number(apiForm.asr.maxChunkSec),
          maxConcurrency: Number(apiForm.asr.maxConcurrency),
          timeoutSec: Number(apiForm.asr.timeoutSec),
          maxRetries: Number(apiForm.asr.maxRetries),
        },
      });
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
        }
        setAsrParamsMessage("ASR 参数已保存。");
      } else {
        setAsrParamsMessage("ASR 参数保存失败，请重试。");
      }
    } catch (err) {
      setAsrParamsMessage(
        `ASR 参数保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingAsrParams(false);
  };
  const handleRetrievalFieldChange = (
    key:
      | "mode"
      | "topK"
      | "topKNotes"
      | "topKKnowledge"
      | "topKRubrics"
      | "topKExamples"
      | "maxConcurrency"
      | "embeddingMaxConcurrency"
      | "minScore",
    value: any,
  ) => {
    setRetrievalForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  };
  const handleRetrievalVectorChange = (key: keyof typeof retrievalForm.vector, value: any) => {
    setRetrievalForm((prev) => ({
      ...prev,
      vector: {
        ...prev.vector,
        [key]: value,
      },
    }));
  };
  const handleSaveRetrievalSettings = async () => {
    setSavingRetrieval(true);
    setRetrievalSaveMessage(null);
    try {
      const payload = {
        retrieval: {
          enabled: config?.retrievalEnabled ?? true,
          mode: retrievalForm.mode,
          topK: Number(retrievalForm.topK),
          topKNotes: Number(retrievalForm.topKNotes),
          topKKnowledge: Number(retrievalForm.topKKnowledge),
          topKRubrics: Number(retrievalForm.topKRubrics),
          topKExamples: Number(retrievalForm.topKExamples),
          maxConcurrency: Number(retrievalForm.maxConcurrency),
          embeddingMaxConcurrency: Number(retrievalForm.embeddingMaxConcurrency),
          minScore: Number(retrievalForm.minScore),
          vector: {
            batchSize: Number(retrievalForm.vector.batchSize),
            queryMaxChars: Number(retrievalForm.vector.queryMaxChars),
          },
        },
      };
      const resp = await request("it/updateRetrievalSettings", payload);
      if (resp?.status === "success") {
        if (resp.content) {
          setConfig(resp.content);
          applyRetrievalToForm(resp.content);
        }
        setRetrievalSaveMessage("检索配置已保存。");
      } else {
        setRetrievalSaveMessage("检索配置保存失败，请检查输入。");
      }
    } catch (err) {
      setRetrievalSaveMessage(
        `检索配置保存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setSavingRetrieval(false);
  };
  const handleClearEmbeddingCache = async () => {
    setClearingEmbeddingCache(true);
    setEmbeddingCacheMessage(null);
    try {
      const resp = await request("it/clearEmbeddingCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setEmbeddingCacheMessage(cleared ? "已清理缓存" : "缓存为空，无需清理");
      } else {
        setEmbeddingCacheMessage("清理缓存失败，请重试。");
      }
    } catch (err) {
      setEmbeddingCacheMessage(
        `清理缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingEmbeddingCache(false);
  };
  const handleEnableTraceLogs = async () => {
    try {
      const resp = await request("it/enableTraceLogs", {});
      if (resp?.status === "success") {
        setTraceLogEnabled(true);
      }
    } catch {
      // ignore
    }
  };
  const handleClearCorpusCache = async () => {
    setClearingCorpusCache(true);
    setCorpusCacheMessage(null);
    try {
      const resp = await request("it/clearCorpusCache", undefined);
      if (resp?.status === "success") {
        const cleared = Boolean(resp.content?.cleared);
        setCorpusCacheMessage(cleared ? "已清理语料缓存" : "语料缓存为空");
      } else {
        setCorpusCacheMessage("清理语料缓存失败，请重试。");
      }
    } catch (err) {
      setCorpusCacheMessage(
        `清理语料缓存失败：${err instanceof Error ? err.message : String(err)}`,
      );
    }
    setClearingCorpusCache(false);
  };
  const handleReloadConfig = async () => {
    const resp = await request("it/getConfig", undefined);
    if (resp?.status === "success" && resp.content) {
      setConfig(resp.content);
      applyProfileToForm(resp.content);
      applyRetrievalToForm(resp.content);
      setCustomPrompt(
        resp.content.prompts?.evaluationPrompt ?? STRICT_SYSTEM_PROMPT,
      );
      setDemoPrompt(resp.content.prompts?.demoPrompt ?? DEFAULT_DEMO_PROMPT);
    }
  };
  const handleOpenSettings = () => {
    request("it/openSettings", undefined);
  };
  const handleSelectSessionsDir = () => {
    request("it/selectSessionsDir", undefined);
  };
  const handleToggleRetrieval = async (enabled: boolean) => {
    await request("it/setRetrievalEnabled", { enabled });
  };
  const handleSelectWorkspaceDir = async (kind: string) => {
    await request("it/selectWorkspaceDir", { kind });
  };
  const handleRefreshInputs = async () => {
    const resp = await request("it/listNativeInputs", { refresh: true });
    if (resp?.status === "success" && Array.isArray(resp.content?.inputs)) {
      const inputs = resp.content.inputs;
      setNativeInputs(inputs);
      if (inputs.length && !inputs.includes(selectedInput)) {
        setSelectedInput(inputs[0] || "");
      }
      return;
    }
    setItState((prev) => ({
      ...prev,
      statusMessage: "刷新输入设备失败，请确认 ffmpeg 可用且麦克风权限已授权。",
    }));
  };
  const handleParseQuestions = async () => {
    const merged = buildQuestionParseInput();
    await parseQuestionsFromText(merged, {
      fallbackPrompt: questionText.trim(),
    });
  };
  const handleToggleNoteHits = () => {
    setShowNoteHits((prev) => !prev);
  };
  const handleToggleDemoPrompt = () => {
    setShowDemoPrompt((prev) => !prev);
  };
  const handleToggleRawOutput = () => {
    setShowRawOutput((prev) => !prev);
  };
  const handleToggleNoteUsage = () => {
    setShowNoteUsage((prev) => !prev);
  };
  const handleToggleNoteSuggestions = () => {
    setShowNoteSuggestions((prev) => !prev);
  };
  const handleOpenReport = (path: string) => {
    request("openFile", { path });
  };

  useEffect(() => {
    const disposeHistory = on("it/showHistory", () => {
      void handleLoadHistory();
    });
    const disposeSettings = on("it/showSettings", () => {
      setActivePage("settings");
    });
    return () => {
      disposeHistory();
      disposeSettings();
    };
  }, [handleLoadHistory]);

  return (
    <div className="it-root">
      <InterviewHeader
        activePage={activePage}
        onSetActivePage={setActivePage}
        uiLocked={uiLocked}
        recordingState={itState.recordingState}
        isProcessing={isProcessing}
        isImporting={isImporting}
        hasAudio={Boolean(audioPayload)}
        hasQuestion={hasQuestion}
        savingResult={savingResult}
        onStartRecording={handleStartRecording}
        onStopRecording={handleStopRecording}
        onImportAudio={handleImportAudio}
        onImportQuestions={handleImportQuestions}
        onAnalyze={handleAnalyze}
        onCancelAnalyze={handleCancelAnalyze}
        onSaveResult={handleSaveResult}
        onLoadHistory={handleLoadHistory}
      />

      <InterviewStatus
        uiLocked={uiLocked}
        statusMessage={itState.statusMessage}
        saveResultMessage={saveResultMessage}
        recordingState={itState.recordingState}
        recordingTime={recordingTime}
        lastError={itState.lastError}
        formatSeconds={formatSeconds}
        onOpenMicSettings={() => request("it/openMicSettings", undefined)}
      />

      {activePage === "practice" && (
        <>
          <PracticeFlow
            steps={itState.steps}
            stepStreams={stepStreams}
            evaluationStreams={evaluationStreams}
            evaluationStreamQuestions={evaluationStreamQuestions}
            streamingEnabled={streamingSettings.enabled}
            previewChars={streamPreviewChars}
            onToggleStepStream={handleToggleStepStream}
            onToggleEvaluationStream={handleToggleEvaluationStream}
            overallProgress={itState.overallProgress}
            audioPayload={audioPayload}
            thinkingVisible={thinkingVisible}
            questionText={questionText}
            questionList={questionList}
            questionError={questionError}
            questionParsing={questionParsing}
            questionParsed={questionParsed}
            hasQuestion={hasQuestion}
            onQuestionTextChange={handleQuestionTextChange}
            onQuestionListChange={handleQuestionListChange}
            onParseQuestions={handleParseQuestions}
            uiLocked={uiLocked}
            notesPreview={notesPreview}
            showNoteHits={showNoteHits}
            onToggleNoteHits={handleToggleNoteHits}
            retrievalEnabled={config?.retrievalEnabled !== false}
          />
          <ResultsPanel
            activeTab={activeTab}
            onSetActiveTab={setActiveTab}
            hasAnyResult={hasAnyResult}
            hasTranscriptContent={hasTranscriptContent}
            transcriptPreview={transcriptPreview}
            detailedTranscriptPreview={detailedTranscriptPreview}
            acousticPreview={acousticPreview}
            questionText={questionText}
            parsedQuestionList={parsedQuestionList}
            questionTimingsPreview={questionTimingsPreview}
            questionTimingNotePreview={questionTimingNotePreview}
            evaluationPreview={evaluationPreview}
            uiLocked={uiLocked}
            isProcessing={isProcessing}
            regeneratingIndex={regeneratingIndex}
            onRegenerateDemoAnswer={handleRegenerateDemoAnswer}
            showDemoPrompt={showDemoPrompt}
            onToggleDemoPrompt={handleToggleDemoPrompt}
            showRawOutput={showRawOutput}
            onToggleRawOutput={handleToggleRawOutput}
            showNoteUsage={showNoteUsage}
            onToggleNoteUsage={handleToggleNoteUsage}
            showNoteSuggestions={showNoteSuggestions}
            onToggleNoteSuggestions={handleToggleNoteSuggestions}
            historyItems={historyItems}
            onOpenReport={handleOpenReport}
            formatSeconds={formatSeconds}
            renderParagraphs={renderParagraphs}
            buildOutlineTree={buildOutlineTree}
            renderOutlineTree={renderOutlineTree}
          />
        </>
      )}

      {activePage === "settings" && (
        <SettingsPage
          uiLocked={uiLocked}
          config={config}
          streamingSettings={streamingSettings}
          setStreamingSettings={setStreamingSettings}
          savingStreamingSettings={savingStreamingSettings}
          streamingSaveMessage={streamingSaveMessage}
          handleSaveStreamingSettings={handleSaveStreamingSettings}
          envDraftName={envDraftName}
          setEnvDraftName={setEnvDraftName}
          envMessage={envMessage}
          savingEnvironment={savingEnvironment}
          handleSetActiveEnvironment={handleSetActiveEnvironment}
          handleCreateEnvironment={handleCreateEnvironment}
          handleDeleteEnvironment={handleDeleteEnvironment}
          handleReloadConfig={handleReloadConfig}
          handleOpenSettings={handleOpenSettings}
          handleSelectSessionsDir={handleSelectSessionsDir}
          traceLogEnabled={traceLogEnabled}
          handleEnableTraceLogs={handleEnableTraceLogs}
          templateCategory={templateCategory}
          setTemplateCategory={setTemplateCategory}
          templatesByCategory={templatesByCategory}
          selectedTemplateId={selectedTemplateId}
          setSelectedTemplateId={setSelectedTemplateId}
          selectedTemplate={selectedTemplate}
          templateDraft={templateDraft}
          setTemplateDraft={setTemplateDraft}
          templateJsonDraft={templateJsonDraft}
          setTemplateJsonDraft={setTemplateJsonDraft}
          templateJsonErrors={templateJsonErrors}
          setTemplateJsonErrors={setTemplateJsonErrors}
          templateSaveMessage={templateSaveMessage}
          savingTemplate={savingTemplate}
          isCreatingTemplate={isCreatingTemplate}
          handleCreateTemplate={handleCreateTemplate}
          handleDuplicateTemplate={handleDuplicateTemplate}
          handleDeleteTemplate={handleDeleteTemplate}
          handleCancelTemplateDraft={handleCancelTemplateDraft}
          handleSaveTemplate={handleSaveTemplate}
          updateTemplateRequest={updateTemplateRequest}
          updateTemplateResponse={updateTemplateResponse}
          updateTemplateStreaming={updateTemplateStreaming}
          paramCatalogList={paramCatalogList}
          templateUsageSets={templateUsageSets}
          templateSecrets={templateSecrets}
          secretDraft={secretDraft}
          setSecretDraft={setSecretDraft}
          savingSecret={savingSecret}
          secretMessage={secretMessage}
          handleSaveSecret={handleSaveSecret}
          handleDeleteSecret={handleDeleteSecret}
          templateParamOptions={templateParamOptions}
          templateParamInput={templateParamInput}
          setTemplateParamInput={setTemplateParamInput}
          savingParamOptions={savingParamOptions}
          handleAddParamOption={handleAddParamOption}
          handleSaveParamOptions={handleSaveParamOptions}
          templateBindings={templateBindings}
          setTemplateBindings={setTemplateBindings}
          llmTemplates={llmTemplates}
          asrTemplates={asrTemplates}
          embeddingTemplates={embeddingTemplates}
          savingBindings={savingBindings}
          handleSaveBindings={handleSaveBindings}
          apiForm={apiForm}
          handleApiFieldChange={handleApiFieldChange}
          llmParamsMessage={llmParamsMessage}
          savingLlmParams={savingLlmParams}
          handleSaveLlmParams={handleSaveLlmParams}
          asrParamsMessage={asrParamsMessage}
          savingAsrParams={savingAsrParams}
          handleSaveAsrParams={handleSaveAsrParams}
          customPrompt={customPrompt}
          setCustomPrompt={setCustomPrompt}
          demoPrompt={demoPrompt}
          setDemoPrompt={setDemoPrompt}
          answerMode={answerMode}
          setAnswerMode={setAnswerMode}
          perQuestionSystemPrompts={perQuestionSystemPrompts}
          setPerQuestionSystemPrompts={setPerQuestionSystemPrompts}
          perQuestionDemoPrompts={perQuestionDemoPrompts}
          setPerQuestionDemoPrompts={setPerQuestionDemoPrompts}
          promptSaveMessage={promptSaveMessage}
          promptSaveScope={promptSaveScope}
          handleSavePrompts={handleSavePrompts}
          nativeInputs={nativeInputs}
          selectedInput={selectedInput}
          setSelectedInput={setSelectedInput}
          handleRefreshInputs={handleRefreshInputs}
          retrievalEnabled={config?.retrievalEnabled ?? true}
          retrievalForm={retrievalForm}
          handleRetrievalFieldChange={handleRetrievalFieldChange}
          handleRetrievalVectorChange={handleRetrievalVectorChange}
          savingRetrieval={savingRetrieval}
          retrievalSaveMessage={retrievalSaveMessage}
          handleSaveRetrievalSettings={handleSaveRetrievalSettings}
          clearingEmbeddingCache={clearingEmbeddingCache}
          embeddingCacheMessage={embeddingCacheMessage}
          handleClearEmbeddingCache={handleClearEmbeddingCache}
          clearingCorpusCache={clearingCorpusCache}
          corpusCacheMessage={corpusCacheMessage}
          handleClearCorpusCache={handleClearCorpusCache}
          showEmbeddingWarmup={showEmbeddingWarmup}
          embeddingWarmup={embeddingWarmup}
          retrievalCacheInfo={retrievalCacheInfo}
          corpusCachePath={corpusCachePath}
          embeddingCachePath={embeddingCachePath}
          corpusCacheMb={corpusCacheMb}
          queryCacheSize={queryCacheSize}
          sessionsDir={config?.sessionsDir || "sessions"}
          maxConcurrency={maxConcurrency}
          topicTitleMode={topicTitleMode}
          setTopicTitleMode={setTopicTitleMode}
          topicTitleLen={topicTitleLen}
          setTopicTitleLen={setTopicTitleLen}
          savingTopicSettings={savingTopicSettings}
          handleSaveTopicSettings={handleSaveTopicSettings}
          topicSaveMessage={topicSaveMessage}
          retrievalDirs={retrievalDirs}
          handleSelectWorkspaceDir={handleSelectWorkspaceDir}
        />
      )}

    </div>
  );
};

export default InterviewTrainer;
