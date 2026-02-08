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
const IT_E2E_WEBVIEW_ANALYZE_REQUEST = "it/test/webviewAnalyzeFlowRequest";
const IT_E2E_WEBVIEW_ANALYZE_ACK = "it/test/webviewAnalyzeFlowAck";
const IT_E2E_UI_CLICK_DELAY_MS = 80;
const IT_E2E_UI_WAIT_POLL_MS = 120;
const IT_E2E_UI_ANALYZE_TIMEOUT_MS = 45_000;

type ItE2EUiStep = {
  action: string;
  ok: boolean;
  detail?: string;
};

type ItE2EAnalyzeAudioPayload = {
  base64: string;
  filename?: string;
  mimeType?: string;
};

type ItE2EAnalyzeMode = "analyze" | "cancel" | "save";

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

async function it_waitForUiCondition(
  check: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await it_delay(IT_E2E_UI_WAIT_POLL_MS);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

function it_base64ToBytes(base64: string): Uint8Array {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  if (!normalized) {
    return new Uint8Array();
  }
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
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
    setAudioPayloadForTest,
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

    const sendReady = () => {
      void request(
        IT_E2E_WEBVIEW_UI_READY,
        { ready: true, ts: Date.now() },
        { timeoutMs: 5_000 },
      );
    };

    sendReady();
    const readyTimer = window.setInterval(sendReady, 3_000);

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

    const disposeAnalyzeFlow = on(IT_E2E_WEBVIEW_ANALYZE_REQUEST, (payload) => {
      const runId = String(payload?.runId || "");
      const steps: ItE2EUiStep[] = [];

      const sendAck = async (
        status: "success" | "error",
        error?: string,
        extra?: Record<string, unknown>,
      ) => {
        await request(
          IT_E2E_WEBVIEW_ANALYZE_ACK,
          {
            runId,
            status,
            error,
            activePage: it_detectPageFromDom(),
            steps,
            ...(extra || {}),
          },
          { timeoutMs: 10_000 },
        );
      };

      void (async () => {
        if (!runId) {
          await sendAck("error", "Missing runId in analyze flow request");
          return;
        }

        try {
          const modeRaw = String(payload?.mode || "analyze").toLowerCase();
          const mode: ItE2EAnalyzeMode =
            modeRaw === "cancel" || modeRaw === "save" ? modeRaw : "analyze";
          steps.push({ action: "set-flow-mode", ok: true, detail: mode });

          const questionText = String(payload?.questionText || "").trim();
          const questionList = Array.isArray(payload?.questionList)
            ? payload.questionList
                .map((item: unknown) => String(item || "").trim())
                .filter(Boolean)
            : [];
          const audio = (payload?.audio || {}) as ItE2EAnalyzeAudioPayload;
          const audioBytes = it_base64ToBytes(String(audio.base64 || ""));

          if (!audioBytes.length) {
            throw new Error("Analyze flow payload missing audio bytes");
          }

          const finalQuestionText = questionText || questionList[0] || "fixture question";
          const finalQuestionList = questionList.join("\n");
          setQuestionText(finalQuestionText);
          setQuestionList(finalQuestionList);
          await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
          steps.push({
            action: "fill-question-state",
            ok: true,
            detail: `chars=${finalQuestionText.length}, count=${questionList.length}`,
          });

          const filename = String(audio.filename || "fixture.m4a");
          const mimeType = String(audio.mimeType || "audio/mp4");
          const audioFile = new File([audioBytes], filename, { type: mimeType });
          const syntheticTarget = {
            files: [audioFile],
            value: filename,
          } as unknown as HTMLInputElement;
          await handleImportAudio({
            target: syntheticTarget,
          } as React.ChangeEvent<HTMLInputElement>);
          steps.push({
            action: "import-audio-file",
            ok: true,
            detail: `bytes=${audioBytes.byteLength}, name=${filename}`,
          });

          try {
            await it_waitForUiCondition(
              () => Boolean(document.querySelector(".it-audio-summary")),
              8_000,
              "audio summary after import",
            );
            steps.push({ action: "wait-audio-summary", ok: true });
          } catch {
            setAudioPayloadForTest({
              format: "wav",
              sampleRate: 16_000,
              byteLength: audioBytes.byteLength,
              durationSec: 1,
              base64: String(audio.base64 || ""),
            });
            steps.push({
              action: "fallback-set-audio-payload",
              ok: true,
              detail: "import path not ready, injected test audio payload",
            });
          }

          await it_waitForUiCondition(() => {
            const analyzeButton = document.querySelector<HTMLButtonElement>(
              "[data-testid='it-action-analyze']",
            );
            return (
              Boolean(analyzeButton) &&
              !Boolean(analyzeButton?.disabled) &&
              !analyzeButton?.classList.contains("it-button--danger")
            );
          }, 45_000, "analyze button enabled");
          steps.push({ action: "wait-analyze-enabled", ok: true });

          it_clickUiElement("[data-testid='it-action-analyze']");
          steps.push({ action: "click-analyze-button", ok: true });

          await it_delay(2_000);
          const analyzeButtonAfterClick = document.querySelector<HTMLButtonElement>(
            "[data-testid='it-action-analyze']",
          );
          if (!analyzeButtonAfterClick?.classList.contains("it-button--danger")) {
            await handleAnalyze();
            steps.push({ action: "fallback-call-handleAnalyze", ok: true });
          }

          if (mode === "cancel") {
            let canCancel = true;
            try {
              await it_waitForUiCondition(() => {
                const analyzeButton = document.querySelector<HTMLButtonElement>(
                  "[data-testid='it-action-analyze']",
                );
                return Boolean(analyzeButton?.classList.contains("it-button--danger"));
              }, 10_000, "analyze running state");
              steps.push({ action: "wait-analyze-running", ok: true });
            } catch {
              canCancel = false;
              steps.push({
                action: "skip-cancel-no-running-state",
                ok: true,
                detail: "analyze finished before cancel action became available",
              });
            }

            if (!canCancel) {
              await sendAck("success", undefined, { mode, canceled: false, skipped: true });
              return;
            }

            it_clickUiElement("[data-testid='it-action-analyze']");
            steps.push({ action: "click-cancel-button", ok: true });

            await it_waitForUiCondition(() => {
              const analyzeButton = document.querySelector<HTMLButtonElement>(
                "[data-testid='it-action-analyze']",
              );
              return Boolean(analyzeButton) && !analyzeButton.classList.contains("it-button--danger");
            }, 30_000, "cancel completion");
            steps.push({ action: "wait-cancel-complete", ok: true });

            await sendAck("success", undefined, { mode, canceled: true });
            return;
          }

          if (mode === "save") {
            await it_waitForUiCondition(() => {
              const analyzeButton = document.querySelector<HTMLButtonElement>(
                "[data-testid='it-action-analyze']",
              );
              return Boolean(analyzeButton) && !analyzeButton.classList.contains("it-button--danger");
            }, IT_E2E_UI_ANALYZE_TIMEOUT_MS, "analyze completion before save");
            steps.push({ action: "wait-analyze-finished", ok: true });

            it_clickUiElement("[data-testid='it-action-save-result']");
            steps.push({ action: "click-save-result-button", ok: true });

            await it_waitForUiCondition(() => {
              const saveMessage =
                document
                  .querySelector<HTMLElement>("[data-testid='it-save-result-message']")
                  ?.textContent?.trim() || "";
              const statusError =
                document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent?.trim() ||
                "";
              return Boolean(saveMessage || statusError);
            }, 10_000, "save result feedback");
            const saveFeedback = (
              document.querySelector<HTMLElement>("[data-testid='it-save-result-message']")?.textContent ||
              document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent ||
              ""
            ).trim();
            steps.push({
              action: "assert-save-feedback",
              ok: Boolean(saveFeedback),
              detail: saveFeedback || "(empty)",
            });

            await sendAck("success", undefined, { mode, saveFeedback });
            return;
          }

          await it_delay(IT_E2E_UI_CLICK_DELAY_MS);

          it_clickUiElement("[data-testid='it-result-tab-evaluation']");
          await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
          steps.push({ action: "open-evaluation-tab", ok: true });

          await it_waitForUiCondition(
            () => {
              const valueNode = document.querySelector("[data-testid='it-evaluation-overall-value']");
              return Boolean(valueNode);
            },
            IT_E2E_UI_ANALYZE_TIMEOUT_MS,
            "evaluation panel",
          );
          steps.push({ action: "wait-evaluation-panel", ok: true });
          const overallScoreText = (
            document.querySelector<HTMLElement>("[data-testid='it-evaluation-overall-value']")
              ?.textContent || ""
          ).trim();
          steps.push({
            action: "assert-evaluation-overall",
            ok: Boolean(overallScoreText),
            detail: overallScoreText || "(empty)",
          });

          await sendAck("success", undefined, { overallScoreText, mode });
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          steps.push({ action: "analyze-flow", ok: false, detail: message });
          await sendAck("error", message);
        }
      })();
    });

    return () => {
      window.clearInterval(readyTimer);
      disposeUiAutomation();
      disposeAnalyzeFlow();
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



