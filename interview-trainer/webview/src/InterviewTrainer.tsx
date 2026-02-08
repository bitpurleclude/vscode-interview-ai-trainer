import React, { useState, useEffect, useCallback } from "react";
import { ItState, ItTemplateBindings, ItTemplateCategory } from "./types";
import { on, request } from "./messenger";
import { STRICT_SYSTEM_PROMPT, DEFAULT_DEMO_PROMPT } from "./constants/prompts";
import { DEFAULT_STATE } from "./constants/defaultState";
import { SettingsPage } from "./components/settings/SettingsPage";
import type { SettingsPageProps } from "./components/settings/SettingsPage";
import { InterviewHeader } from "./components/practice/InterviewHeader";
import { InterviewStatus } from "./components/practice/InterviewStatus";
import { PracticeContent } from "./components/practice/PracticeContent";
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
import { useAsrSettings } from "./hooks/useAsrSettings";
import { useLlmSettings } from "./hooks/useLlmSettings";
import { useRetrievalSettings } from "./hooks/useRetrievalSettings";
import { useDerivedViews } from "./hooks/useDerivedViews";
import type { AsrForm, LlmForm } from "./components/settings/settingsTypes";
import "./styles.css";

type ResultTab = "transcript" | "acoustic" | "evaluation" | "history";

const IT_E2E_WEBVIEW_UI_REQUEST = "it/test/webviewUiAutomationRequest";
const IT_E2E_WEBVIEW_UI_ACK = "it/test/webviewUiAutomationAck";
const IT_E2E_WEBVIEW_UI_READY = "it/test/webviewUiAutomationReady";
const IT_E2E_UI_CLICK_DELAY_MS = 80;

type ItE2EUiStep = {
  action: string;
  ok: boolean;
  detail?: string;
};

function it_isE2ETestModeEnabled(): boolean {
  return Boolean((window as any).__itE2ETestMode);
}

function it_delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function it_detectPageFromDom(): "practice" | "settings" | "unknown" {
  if (document.querySelector(".it-settings")) {
    return "settings";
  }
  if (document.querySelector(".it-flow")) {
    return "practice";
  }
  return "unknown";
}

function it_clickUiElement(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  const disabled = "disabled" in element && Boolean((element as HTMLButtonElement).disabled);
  if (disabled) {
    throw new Error(`Element is disabled: ${selector}`);
  }
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

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
  const [asrForm, setAsrForm] = useState<AsrForm>({
    language: "zh",
    devPid: 1537,
    maxChunkSec: 50,
    maxConcurrency: 1,
    timeoutSec: 120,
    maxRetries: 1,
    mockText: "",
  });
  const [llmForm, setLlmForm] = useState<LlmForm>({
    timeoutSec: 60,
    maxRetries: 1,
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
    hasQuestion: inputHasQuestion,
    questionText,
    parsedQuestionList: inputQuestionList,
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
    parsedQuestionList: inputQuestionList,
    streamingPreviewChars: streamingSettings.previewChars,
    analysisResult,
  });

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

  const tokenStore = config?.templates?.tokenStore;
  const handleRefreshToken = useCallback(async (name: string) => {
    await request("it/refreshToken", { name });
  }, []);
  const handleRefreshAllTokens = useCallback(async () => {
    await request("it/refreshAllTokens");
  }, []);
  const handleToggleTokenAutoRefresh = useCallback(async (enabled: boolean) => {
    await request("it/setTokenAutoRefresh", { enabled });
  }, []);

  const {
    envDraftName,
    setEnvDraftName,
    envMessage,
    savingEnvironment,
    handleSetActiveEnvironment,
    handleCreateEnvironment,
    handleDeleteEnvironment,
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
    savingAsr,
    asrSaveMessage,
    handleSaveAsrSettings,
  } = useAsrSettings({
    config,
    setConfig,
    asrForm,
    setAsrForm,
  });

  const {
    savingLlm,
    llmSaveMessage,
    handleSaveLlmSettings,
  } = useLlmSettings({
    config,
    setConfig,
    llmForm,
    setLlmForm,
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

  useEffect(() => {
    if (!it_isE2ETestModeEnabled()) {
      return;
    }

    void request(
      IT_E2E_WEBVIEW_UI_READY,
      { ready: true, ts: Date.now() },
      { timeoutMs: 5_000 },
    );

    const disposeUiAutomation = on(IT_E2E_WEBVIEW_UI_REQUEST, (payload) => {
      const runId = String(payload?.runId || "");
      const steps: ItE2EUiStep[] = [];

      const sendAck = async (status: "success" | "error", error?: string) => {
        await request(
          IT_E2E_WEBVIEW_UI_ACK,
          {
            runId,
            status,
            error,
            activePage: it_detectPageFromDom(),
            steps,
          },
          { timeoutMs: 10_000 },
        );
      };

      void (async () => {
        if (!runId) {
          await sendAck("error", "Missing runId in UI automation request");
          return;
        }

        try {
          it_clickUiElement("[data-testid='it-tab-settings']");
          await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
          const settingsPage = it_detectPageFromDom();
          steps.push({
            action: "open-settings-tab",
            ok: settingsPage === "settings",
            detail: `page=${settingsPage}`,
          });
          if (settingsPage !== "settings") {
            throw new Error(`Expected settings page, got ${settingsPage}`);
          }

          it_clickUiElement("[data-testid='it-tab-practice']");
          await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
          const practicePage = it_detectPageFromDom();
          steps.push({
            action: "return-practice-tab",
            ok: practicePage === "practice",
            detail: `page=${practicePage}`,
          });
          if (practicePage !== "practice") {
            throw new Error(`Expected practice page, got ${practicePage}`);
          }

          it_clickUiElement("[data-testid='it-action-history']");
          steps.push({ action: "click-history-button", ok: true });

          await sendAck("success");
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          steps.push({ action: "ui-click-flow", ok: false, detail: message });
          await sendAck("error", message);
        }
      })();
    });

    return () => {
      disposeUiAutomation();
    };
  }, []);

  const practiceProps = {
    steps: itState.steps,
    stepStreams,
    evaluationStreams,
    evaluationStreamQuestions,
    streamingEnabled: streamingSettings.enabled,
    previewChars: streamPreviewChars,
    onToggleStepStream: handleToggleStepStream,
    onToggleEvaluationStream: handleToggleEvaluationStream,
    overallProgress: itState.overallProgress,
    audioPayload,
    thinkingVisible,
    questionText,
    questionList,
    questionError,
    questionParsing,
    questionParsed,
    hasQuestion: inputHasQuestion,
    onQuestionTextChange: handleQuestionTextChange,
    onQuestionListChange: handleQuestionListChange,
    onParseQuestions: handleParseQuestions,
    uiLocked,
    notesPreview,
    showNoteHits,
    onToggleNoteHits: handleToggleNoteHits,
    retrievalEnabled: config?.retrievalEnabled !== false,
  };

  const resultsProps = {
    activeTab,
    onSetActiveTab: setActiveTab,
    hasAnyResult,
    hasTranscriptContent,
    transcriptPreview,
    detailedTranscriptPreview,
    acousticPreview,
    questionText,
    parsedQuestionList: inputQuestionList,
    questionTimingsPreview,
    questionTimingNotePreview,
    evaluationPreview,
    uiLocked,
    isProcessing,
    regeneratingIndex,
    onRegenerateDemoAnswer: handleRegenerateDemoAnswer,
    showDemoPrompt,
    onToggleDemoPrompt: handleToggleDemoPrompt,
    showRawOutput,
    onToggleRawOutput: handleToggleRawOutput,
    showNoteUsage,
    onToggleNoteUsage: handleToggleNoteUsage,
    showNoteSuggestions,
    onToggleNoteSuggestions: handleToggleNoteSuggestions,
    historyItems,
    onOpenReport: handleOpenReport,
    formatSeconds,
    renderParagraphs,
    buildOutlineTree,
    renderOutlineTree,
  };

  const settingsProps: SettingsPageProps = {
    uiLocked,
    config,
    streamingSettings,
    setStreamingSettings,
    savingStreamingSettings,
    streamingSaveMessage,
    handleSaveStreamingSettings,
    envDraftName,
    setEnvDraftName,
    envMessage,
    savingEnvironment,
    handleSetActiveEnvironment,
    handleCreateEnvironment,
    handleDeleteEnvironment,
    handleReloadConfig,
    handleOpenSettings,
    handleSelectSessionsDir,
    traceLogEnabled,
    handleEnableTraceLogs,
    asrForm,
    setAsrForm,
    savingAsr,
    asrSaveMessage,
    handleSaveAsrSettings,
    llmForm,
    setLlmForm,
    savingLlm,
    llmSaveMessage,
    handleSaveLlmSettings,
    templateCategory,
    setTemplateCategory,
    templatesByCategory,
    selectedTemplateId,
    setSelectedTemplateId,
    selectedTemplate,
    templateDraft,
    setTemplateDraft,
    templateJsonDraft,
    setTemplateJsonDraft,
    templateJsonErrors,
    setTemplateJsonErrors,
    templateSaveMessage,
    savingTemplate,
    isCreatingTemplate,
    handleCreateTemplate,
    handleDuplicateTemplate,
    handleDeleteTemplate,
    handleCancelTemplateDraft,
    handleSaveTemplate,
    updateTemplateRequest,
    updateTemplateResponse,
    updateTemplateStreaming,
    paramCatalogList,
    templateUsageSets,
    templateSecrets: bindingSecrets,
    secretDraft,
    setSecretDraft,
    savingSecret,
    secretMessage,
    handleSaveSecret,
    handleDeleteSecret,
    templateParamOptions: bindingParamOptions,
    templateParamInput,
    setTemplateParamInput,
    savingParamOptions,
    handleAddParamOption,
    handleSaveParamOptions,
    tokenStore,
    handleRefreshToken,
    handleRefreshAllTokens,
    handleToggleTokenAutoRefresh,
    templateBindings,
    setTemplateBindings,
    llmTemplates,
    asrTemplates,
    embeddingTemplates,
    savingBindings,
    handleSaveBindings,
    customPrompt,
    setCustomPrompt,
    demoPrompt,
    setDemoPrompt,
    answerMode,
    setAnswerMode,
    perQuestionSystemPrompts,
    setPerQuestionSystemPrompts,
    perQuestionDemoPrompts,
    setPerQuestionDemoPrompts,
    promptSaveMessage,
    promptSaveScope,
    handleSavePrompts,
    nativeInputs,
    selectedInput,
    setSelectedInput,
    handleRefreshInputs,
    retrievalEnabled: config?.retrievalEnabled ?? true,
    handleToggleRetrieval,
    retrievalForm,
    handleRetrievalFieldChange,
    handleRetrievalVectorChange,
    savingRetrieval,
    retrievalSaveMessage,
    handleSaveRetrievalSettings,
    clearingEmbeddingCache,
    embeddingCacheMessage,
    handleClearEmbeddingCache,
    clearingCorpusCache,
    corpusCacheMessage,
    handleClearCorpusCache,
    showEmbeddingWarmup,
    embeddingWarmup,
    retrievalCacheInfo,
    corpusCachePath,
    embeddingCachePath,
    corpusCacheMb,
    queryCacheSize,
    sessionsDir: config?.sessionsDir || "sessions",
    maxConcurrency,
    topicTitleMode,
    setTopicTitleMode,
    topicTitleLen,
    setTopicTitleLen,
    savingTopicSettings,
    handleSaveTopicSettings,
    topicSaveMessage,
    retrievalDirs,
    handleSelectWorkspaceDir,
  };

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
        <PracticeContent practiceProps={practiceProps} resultsProps={resultsProps} />
      )}

      {activePage === "settings" && <SettingsPage {...settingsProps} />}

    </div>
  );
};

export default InterviewTrainer;



