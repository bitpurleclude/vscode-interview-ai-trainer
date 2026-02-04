import React, { useMemo, useState, useEffect } from "react";
import {
  ItState,
  ItTemplateBindings,
  ItTemplateCategory,
  ItTemplateParamCatalog,
  ItTemplateParamUsage,
} from "./types";
import { on, request } from "./messenger";
import { STRICT_SYSTEM_PROMPT, DEFAULT_DEMO_PROMPT } from "./constants/prompts";
import { DEFAULT_STATE } from "./constants/defaultState";
import { SettingsPage } from "./components/settings/SettingsPage";
import { InterviewHeader } from "./components/practice/InterviewHeader";
import { InterviewStatus } from "./components/practice/InterviewStatus";
import { PracticeFlow } from "./components/practice/PracticeFlow";
import { ResultsPanel } from "./components/practice/ResultsPanel";
import { formatSeconds } from "./utils/format";
import { buildOutlineTree, renderOutlineTree, renderParagraphs } from "./utils/outline";
import { useStreaming } from "./hooks/useStreaming";
import { useAudioCapture } from "./hooks/useAudioCapture";
import { useAnalysisFlow } from "./hooks/useAnalysisFlow";
import { useConfigSync } from "./hooks/useConfigSync";
import { useQuestionInput } from "./hooks/useQuestionInput";
import { useTemplateEditor } from "./hooks/useTemplateEditor";
import { useTemplateBindings } from "./hooks/useTemplateBindings";
import { useEnvironmentSettings } from "./hooks/useEnvironmentSettings";
import "./styles.css";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";

const InterviewTrainer: React.FC = () => {
  const [itState, setItState] = useState<ItState>(DEFAULT_STATE);
  const [activeTab, setActiveTab] = useState<ResultTab>("transcript");
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
  const [templateBindings, setTemplateBindings] = useState<ItTemplateBindings>({
    llm: {},
    asr: {},
    embedding: {},
  });
  const [templateParamOptions, setTemplateParamOptions] = useState<string[]>([]);
  const [templateSecrets, setTemplateSecrets] = useState<string[]>([]);
  const [showNoteHits, setShowNoteHits] = useState(false);
  const [showDemoPrompt, setShowDemoPrompt] = useState(false);
  const [showNoteUsage, setShowNoteUsage] = useState(false);
  const [showNoteSuggestions, setShowNoteSuggestions] = useState(false);
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
  const [topicTitleMode, setTopicTitleMode] = useState<"llm" | "simple">("llm");
  const [topicTitleLen, setTopicTitleLen] = useState(18);
  const [showRawOutput, setShowRawOutput] = useState(false);
  const {
    config,
    setConfig,
    nativeInputs,
    selectedInput,
    setSelectedInput,
    handleRefreshInputs,
    applyRetrievalToForm,
    reloadConfig,
  } = useConfigSync({
    setItState,
    setCustomPrompt,
    setDemoPrompt,
    setPerQuestionSystemPrompts,
    setPerQuestionDemoPrompts,
    setAnswerMode,
    setTopicTitleMode,
    setTopicTitleLen,
    setStreamingSettings,
    setTemplateBindings,
    setTemplateParamOptions,
    setTemplateSecrets,
    setApiForm,
    setRetrievalForm,
  });

  const {
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
    handleImportQuestions,
    handleParseQuestions,
  } = useQuestionInput({ setItState });

  const [activePage, setActivePage] = useState<"practice" | "settings">("practice");
  const uiLocked = !config;

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

  const {
    templateDraft,
    setTemplateDraft,
    templateJsonDraft,
    setTemplateJsonDraft,
    templateJsonErrors,
    setTemplateJsonErrors,
    templateSaveMessage,
    setTemplateSaveMessage,
    savingTemplate,
    isCreatingTemplate,
    handleCreateTemplate,
    handleDuplicateTemplate,
    handleCancelTemplateDraft,
    handleSaveTemplate,
    handleDeleteTemplate,
    updateTemplateRequest,
    updateTemplateResponse,
    updateTemplateStreaming,
  } = useTemplateEditor({
    templateCategory,
    templatesByCategory,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
    setConfig,
  });

  const {
    templateParamOptions: bindingParamOptions,
    templateParamInput,
    setTemplateParamInput,
    templateSecrets: bindingSecrets,
    secretDraft,
    setSecretDraft,
    secretMessage,
    savingBindings,
    savingParamOptions,
    savingSecret,
    handleSaveBindings,
    handleSaveParamOptions,
    handleAddParamOption,
    handleSaveSecret,
    handleDeleteSecret,
  } = useTemplateBindings({
    templateBindings,
    setTemplateBindings,
    templateParamOptions,
    setTemplateParamOptions,
    templateSecrets,
    setTemplateSecrets,
    setTemplateSaveMessage,
    setConfig,
  });

  const {
    envDraftName,
    setEnvDraftName,
    envMessage,
    savingEnvironment,
    handleSetActiveEnvironment,
    handleCreateEnvironment,
    handleDeleteEnvironment,
    handleApiFieldChange,
    handleSaveLlmParams,
    handleSaveAsrParams,
    savingLlmParams,
    savingAsrParams,
    llmParamsMessage,
    asrParamsMessage,
    handleSavePrompts,
    promptSaveMessage,
    promptSaveScope,
    handleSaveTopicSettings,
    savingTopicSettings,
    topicSaveMessage,
    handleSaveStreamingSettings,
    savingStreamingSettings,
    streamingSaveMessage,
  } = useEnvironmentSettings({
    config,
    setConfig,
    apiForm,
    setApiForm,
    streamingSettings,
    setStreamingSettings,
    customPrompt,
    demoPrompt,
    perQuestionSystemPrompts,
    perQuestionDemoPrompts,
    answerMode,
    topicTitleMode,
    topicTitleLen,
  });

  const thinkingVisible = useMemo(() => {
    return itState.steps.some(
      (step) =>
        step.status === "running" &&
        ["question", "acoustic", "asr", "notes", "evaluation"].includes(step.id),
    );
  }, [itState]);

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
    await reloadConfig();
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
          templateSecrets={bindingSecrets}
          secretDraft={secretDraft}
          setSecretDraft={setSecretDraft}
          savingSecret={savingSecret}
          secretMessage={secretMessage}
          handleSaveSecret={handleSaveSecret}
          handleDeleteSecret={handleDeleteSecret}
          templateParamOptions={bindingParamOptions}
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

