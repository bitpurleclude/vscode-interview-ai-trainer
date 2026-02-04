import React, { useState, useEffect } from "react";
import { ItState, ItTemplateBindings, ItTemplateCategory } from "./types";
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
import { useRetrievalSettings } from "./hooks/useRetrievalSettings";
import { useDerivedViews } from "./hooks/useDerivedViews";
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
    parsedQuestionList: inputQuestionList,
    hasQuestion: inputHasQuestion,
    handleQuestionTextChange,
    handleQuestionListChange,
    handleImportQuestions,
    handleParseQuestions,
  } = useQuestionInput({ setItState });

  const [activePage, setActivePage] = useState<"practice" | "settings">("practice");
  const uiLocked = !config;

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
    parsedQuestionList: derivedQuestionList,
    hasQuestion: derivedHasQuestion,
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
  } = useDerivedViews({
    config,
    itState,
    templateCategory,
    selectedTemplateId,
    questionText,
    questionList,
    streamingPreviewChars: streamingSettings.previewChars,
    analysisResult,
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

  const {
    savingRetrieval,
    retrievalSaveMessage,
    clearingEmbeddingCache,
    embeddingCacheMessage,
    clearingCorpusCache,
    corpusCacheMessage,
    handleRetrievalFieldChange,
    handleRetrievalVectorChange,
    handleSaveRetrievalSettings,
    handleClearEmbeddingCache,
    handleClearCorpusCache,
    handleToggleRetrieval,
    handleEnableTraceLogs,
  } = useRetrievalSettings({
    config,
    setConfig,
    retrievalForm,
    setRetrievalForm,
    applyRetrievalToForm,
    setTraceLogEnabled,
  });

  const {
    audioPayload,
    isImporting,
    recordingTime,
    handleStartRecording,
    handleStopRecording,
    handleImportAudio,
  } = useAudioCapture({
    selectedInput,
    hasQuestion: inputHasQuestion,
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
    hasQuestion: derivedHasQuestion,
    questionText,
    parsedQuestionList: derivedQuestionList,
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

  const handleReloadConfig = async () => {
    await reloadConfig();
  };
  const handleOpenSettings = () => {
    request("it/openSettings", undefined);
  };
  const handleSelectSessionsDir = () => {
    request("it/selectSessionsDir", undefined);
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
        hasQuestion={inputHasQuestion}
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
            hasQuestion={inputHasQuestion}
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
            parsedQuestionList={inputQuestionList}
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


