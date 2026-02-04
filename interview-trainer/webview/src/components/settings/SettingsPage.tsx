import React from "react";
import {
  ItApiTemplate,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItTemplateBindings,
  ItTemplateCategory,
} from "../../types";
import { request } from "../../messenger";

type StreamingSettings = {
  enabled: boolean;
  autoCollapse: boolean;
  previewChars: number;
};

type TemplateJsonDraft = {
  headers: string;
  query: string;
  body: string;
};

type TemplateJsonErrors = Partial<Record<"headers" | "query" | "body", string>>;

type TemplateUsageSets = {
  used: Set<string>;
  unused: Set<string>;
  unknown: Set<string>;
  empty: Set<string>;
};

type ApiForm = {
  llm: {
    model: string;
    reasoningEffort: string;
    webSearch: boolean;
    stream: boolean;
    timeoutSec: number;
    maxRetries: number;
    antiRepeat: boolean;
    reusePrefix: boolean;
  };
  asr: {
    language: string;
    devPid: number;
    maxChunkSec: number;
    maxConcurrency: number;
    timeoutSec: number;
    maxRetries: number;
  };
};

type RetrievalForm = {
  mode: string;
  topK: number;
  topKNotes: number;
  topKKnowledge: number;
  topKRubrics: number;
  topKExamples: number;
  maxConcurrency: number;
  embeddingMaxConcurrency: number;
  minScore: number;
  vector: {
    batchSize: number;
    queryMaxChars: number;
  };
};

type SecretDraft = {
  name: string;
  value: string;
};

type RetrievalDir = {
  key: string;
  label: string;
  value: string;
};

type SettingsPageProps = {
  uiLocked: boolean;
  config: ItConfigSnapshot | null;
  streamingSettings: StreamingSettings;
  setStreamingSettings: React.Dispatch<React.SetStateAction<StreamingSettings>>;
  savingStreamingSettings: boolean;
  streamingSaveMessage: string | null;
  handleSaveStreamingSettings: () => void;
  envDraftName: string;
  setEnvDraftName: React.Dispatch<React.SetStateAction<string>>;
  envMessage: string | null;
  savingEnvironment: boolean;
  handleSetActiveEnvironment: (env: string) => void;
  handleCreateEnvironment: (copyFrom?: string) => void;
  handleDeleteEnvironment: (env: string) => void;
  handleReloadConfig: () => void;
  traceLogEnabled: boolean;
  handleEnableTraceLogs: () => void;
  templateCategory: ItTemplateCategory;
  setTemplateCategory: (category: ItTemplateCategory) => void;
  templatesByCategory: ItApiTemplate[];
  selectedTemplateId: string;
  setSelectedTemplateId: React.Dispatch<React.SetStateAction<string>>;
  selectedTemplate: ItApiTemplate | null;
  templateDraft: ItApiTemplate | null;
  setTemplateDraft: React.Dispatch<React.SetStateAction<ItApiTemplate | null>>;
  templateJsonDraft: TemplateJsonDraft;
  setTemplateJsonDraft: React.Dispatch<React.SetStateAction<TemplateJsonDraft>>;
  templateJsonErrors: TemplateJsonErrors;
  templateSaveMessage: string | null;
  savingTemplate: boolean;
  isCreatingTemplate: boolean;
  handleCreateTemplate: () => void;
  handleDuplicateTemplate: () => void;
  handleDeleteTemplate: () => void;
  handleCancelTemplateDraft: () => void;
  handleSaveTemplate: () => void;
  updateTemplateRequest: (payload: Partial<ItApiTemplate["request"]>) => void;
  updateTemplateResponse: (payload: Partial<ItApiTemplate["response"]>) => void;
  updateTemplateStreaming: (payload: Partial<ItApiTemplate["streaming"]>) => void;
  paramCatalogList: string[];
  templateUsageSets: TemplateUsageSets;
  templateSecrets: string[];
  secretDraft: SecretDraft;
  setSecretDraft: React.Dispatch<React.SetStateAction<SecretDraft>>;
  savingSecret: boolean;
  secretMessage: string | null;
  handleSaveSecret: () => void;
  handleDeleteSecret: (name: string) => void;
  templateParamOptions: string[];
  templateParamInput: string;
  setTemplateParamInput: React.Dispatch<React.SetStateAction<string>>;
  savingParamOptions: boolean;
  handleAddParamOption: () => void;
  handleSaveParamOptions: () => void;
  templateBindings: ItTemplateBindings;
  setTemplateBindings: React.Dispatch<React.SetStateAction<ItTemplateBindings>>;
  llmTemplates: ItApiTemplate[];
  asrTemplates: ItApiTemplate[];
  embeddingTemplates: ItApiTemplate[];
  savingBindings: boolean;
  handleSaveBindings: () => void;
  apiForm: ApiForm;
  handleApiFieldChange: (
    section: "llm" | "asr",
    field: string,
    value: string | number | boolean,
  ) => void;
  llmParamsMessage: string | null;
  savingLlmParams: boolean;
  handleSaveLlmParams: () => void;
  asrParamsMessage: string | null;
  savingAsrParams: boolean;
  handleSaveAsrParams: () => void;
  customPrompt: string;
  setCustomPrompt: React.Dispatch<React.SetStateAction<string>>;
  demoPrompt: string;
  setDemoPrompt: React.Dispatch<React.SetStateAction<string>>;
  answerMode: "single" | "two-step";
  setAnswerMode: React.Dispatch<React.SetStateAction<"single" | "two-step">>;
  perQuestionSystemPrompts: string[];
  setPerQuestionSystemPrompts: React.Dispatch<React.SetStateAction<string[]>>;
  perQuestionDemoPrompts: string[];
  setPerQuestionDemoPrompts: React.Dispatch<React.SetStateAction<string[]>>;
  promptSaveMessage: string | null;
  promptSaveScope: "evaluation" | "demo" | "per-question" | null;
  handleSavePrompts: (scope: "evaluation" | "demo" | "per-question") => void;
  nativeInputs: string[];
  selectedInput: string;
  setSelectedInput: React.Dispatch<React.SetStateAction<string>>;
  handleRefreshInputs: () => void;
  retrievalForm: RetrievalForm;
  handleRetrievalFieldChange: (field: string, value: string | number | boolean) => void;
  handleRetrievalVectorChange: (field: "batchSize" | "queryMaxChars", value: number) => void;
  savingRetrieval: boolean;
  retrievalSaveMessage: string | null;
  handleSaveRetrievalSettings: () => void;
  clearingEmbeddingCache: boolean;
  embeddingCacheMessage: string | null;
  handleClearEmbeddingCache: () => void;
  clearingCorpusCache: boolean;
  corpusCacheMessage: string | null;
  handleClearCorpusCache: () => void;
  showEmbeddingWarmup: boolean;
  embeddingWarmup: ItEmbeddingWarmupState | undefined;
  retrievalCacheInfo: ItConfigSnapshot["retrievalCache"] | undefined;
  corpusCachePath: string;
  embeddingCachePath: string;
  corpusCacheMb: number | undefined;
  queryCacheSize: number | undefined;
  maxConcurrency: number | undefined;
  topicTitleMode: "llm" | "simple";
  setTopicTitleMode: React.Dispatch<React.SetStateAction<"llm" | "simple">>;
  topicTitleLen: number;
  setTopicTitleLen: React.Dispatch<React.SetStateAction<number>>;
  savingTopicSettings: boolean;
  handleSaveTopicSettings: () => void;
  topicSaveMessage: string | null;
  retrievalDirs: RetrievalDir[];
  handleSelectWorkspaceDir: (key: string) => void;
};

const TEMPLATE_CATEGORY_TABS: Array<{
  key: ItTemplateCategory;
  label: string;
  enabled: boolean;
}> = [
  { key: "llm", label: "LLM", enabled: true },
  { key: "asr", label: "ASR", enabled: true },
  { key: "embedding", label: "Embedding", enabled: true },
  { key: "tts", label: "TTS", enabled: false },
  { key: "vision", label: "Vision", enabled: false },
  { key: "tools", label: "Tools", enabled: false },
];

const TEMPLATE_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];
const TEMPLATE_RESPONSE_MODES = [
  { value: "json", label: "JSON" },
  { value: "sse", label: "SSE" },
  { value: "ndjson", label: "NDJSON" },
  { value: "websocket", label: "WebSocket" },
  { value: "binary", label: "Binary" },
];

export const SettingsPage: React.FC<SettingsPageProps> = (props) => {
  const {
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
    traceLogEnabled,
    handleEnableTraceLogs,
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
    templateSecrets,
    secretDraft,
    setSecretDraft,
    savingSecret,
    secretMessage,
    handleSaveSecret,
    handleDeleteSecret,
    templateParamOptions,
    templateParamInput,
    setTemplateParamInput,
    savingParamOptions,
    handleAddParamOption,
    handleSaveParamOptions,
    templateBindings,
    setTemplateBindings,
    llmTemplates,
    asrTemplates,
    embeddingTemplates,
    savingBindings,
    handleSaveBindings,
    apiForm,
    handleApiFieldChange,
    llmParamsMessage,
    savingLlmParams,
    handleSaveLlmParams,
    asrParamsMessage,
    savingAsrParams,
    handleSaveAsrParams,
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
  } = props;

  return (
        <div className="it-settings">
          <div className="it-settings__grid">
            <div className="it-settings__section it-settings__section--full">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">全局/环境</div>
                  <div className="it-settings__desc">环境切换、保存目录与实时输出</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={handleReloadConfig}
                  >
                    重载配置
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    onClick={() => request("it/openSettings", undefined)}
                  >
                    查看配置
                  </button>
                </div>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 64 }}>环境</div>
                <select
                  className="it-select"
                  value={config?.activeEnvironment || "prod"}
                  disabled={uiLocked || savingEnvironment}
                  onChange={(event) => handleSetActiveEnvironment(event.target.value)}
                >
                  {(config?.envList && config.envList.length
                    ? config.envList
                    : ["prod"]
                  ).map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
                <div style={{ minWidth: 80 }}>新环境</div>
                <input
                  className="it-input"
                  value={envDraftName}
                  onChange={(event) => setEnvDraftName(event.target.value)}
                  placeholder="prod / test / dev"
                />
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingEnvironment}
                  onClick={() => handleCreateEnvironment()}
                >
                  创建并切换
                </button>
                <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || savingEnvironment}
                    onClick={() =>
                      handleCreateEnvironment(config?.activeEnvironment || "prod")
                    }
                  >
                    复制当前
                  </button>
                <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || savingEnvironment}
                    onClick={() =>
                      handleDeleteEnvironment(config?.activeEnvironment || "prod")
                    }
                  >
                  删除环境
                </button>
              </div>
              {envMessage && <div className="it-settings__hint">{envMessage}</div>}
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>保存目录</div>
                <div className="it-settings__meta" style={{ flex: 1 }}>
                  {config?.sessionsDir || "sessions"}
                </div>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked}
                  onClick={() => request("it/selectSessionsDir", undefined)}
                >
                  选择保存目录
                </button>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>实时输出</div>
                <label className="it-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(streamingSettings.enabled)}
                    onChange={(event) =>
                      setStreamingSettings((prev) => ({
                        ...prev,
                        enabled: event.target.checked,
                      }))
                    }
                  />
                  <span>启用</span>
                </label>
                <div style={{ minWidth: 80 }}>自动折叠</div>
                <label className="it-toggle">
                  <input
                    type="checkbox"
                    checked={Boolean(streamingSettings.autoCollapse)}
                    onChange={(event) =>
                      setStreamingSettings((prev) => ({
                        ...prev,
                        autoCollapse: event.target.checked,
                      }))
                    }
                  />
                  <span>启用</span>
                </label>
                <div style={{ minWidth: 80 }}>预览字数</div>
                <input
                  className="it-input"
                  type="number"
                  min={50}
                  value={streamingSettings.previewChars}
                  onChange={(event) =>
                    setStreamingSettings((prev) => ({
                      ...prev,
                      previewChars: Number(event.target.value),
                    }))
                  }
                />
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingStreamingSettings}
                  onClick={handleSaveStreamingSettings}
                >
                  {savingStreamingSettings ? "保存中..." : "保存设置"}
                </button>
              </div>
              {streamingSaveMessage && (
                <div className="it-settings__hint">{streamingSaveMessage}</div>
              )}
              <div className="it-settings__actions">
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || traceLogEnabled}
                  onClick={handleEnableTraceLogs}
                >
                  {traceLogEnabled ? "日志已开启" : "开启日志输出"}
                </button>
              </div>
            </div>

            <div className="it-settings__section it-settings__section--full">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">API 模板管理</div>
                  <div className="it-settings__desc">模板化接入，支持多厂商 API 与多任务绑定</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={handleCreateTemplate}
                  >
                    新建模板
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || !selectedTemplate}
                    onClick={handleDuplicateTemplate}
                  >
                    复制模板
                  </button>
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked || !selectedTemplate}
                    onClick={handleDeleteTemplate}
                  >
                    删除模板
                  </button>
                </div>
              </div>
              <div className="it-template__tabs">
                {TEMPLATE_CATEGORY_TABS.map((item) => (
                  <button
                    key={item.key}
                    className={`it-chip ${templateCategory === item.key ? "active" : ""} ${
                      item.enabled ? "" : "disabled"
                    }`}
                    disabled={!item.enabled}
                    onClick={() => setTemplateCategory(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              <div className="it-template">
                <div className="it-template__list">
                  <div className="it-template__list-header">
                    <div className="it-template__list-title">模板列表</div>
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked}
                      onClick={handleCreateTemplate}
                    >
                      新建
                    </button>
                  </div>
                  <div className="it-template__list-body">
                    {templatesByCategory.length ? (
                      templatesByCategory.map((item) => (
                        <button
                          key={item.id}
                          className={`it-template__list-item ${
                            selectedTemplateId === item.id ? "active" : ""
                          }`}
                          type="button"
                          onClick={() => setSelectedTemplateId(item.id)}
                        >
                          <div className="it-template__list-name">{item.name || item.id}</div>
                          <div className="it-template__list-meta">{item.id}</div>
                        </button>
                      ))
                    ) : (
                      <div className="it-placeholder">暂无模板，请新建。</div>
                    )}
                  </div>
                </div>

                <div className="it-template__editor">
                  {templateDraft ? (
                    (() => {
                      const responseMode = templateDraft.response?.mode || "json";
                      const doneSignalsText = (
                        templateDraft.streaming?.doneSignals || []
                      ).join(", ");
                      return (
                        <>
                          <div className="it-input-row it-input-row--nowrap">
                            <div style={{ minWidth: 70 }}>模板 ID</div>
                            <input
                              className="it-input"
                              value={templateDraft.id}
                              onChange={(event) =>
                                setTemplateDraft((prev) =>
                                  prev ? { ...prev, id: event.target.value } : prev,
                                )
                              }
                            />
                            <div style={{ minWidth: 60 }}>名称</div>
                            <input
                              className="it-input"
                              value={templateDraft.name || ""}
                              onChange={(event) =>
                                setTemplateDraft((prev) =>
                                  prev ? { ...prev, name: event.target.value } : prev,
                                )
                              }
                            />
                          </div>
                          <div className="it-input-row it-input-row--nowrap">
                            <div style={{ minWidth: 70 }}>分类</div>
                            <select
                              className="it-select"
                              value={templateDraft.category}
                              onChange={(event) => {
                                const next = event.target.value as ItTemplateCategory;
                                setTemplateDraft((prev) =>
                                  prev ? { ...prev, category: next } : prev,
                                );
                                setTemplateCategory(next);
                              }}
                            >
                              {TEMPLATE_CATEGORY_TABS.map((tab) => (
                                <option key={tab.key} value={tab.key} disabled={!tab.enabled}>
                                  {tab.label}
                                </option>
                              ))}
                            </select>
                            <div style={{ minWidth: 80 }}>解析模式</div>
                            <select
                              className="it-select"
                              value={responseMode}
                              onChange={(event) => {
                                const next = event.target.value;
                                updateTemplateResponse({ mode: next as any });
                                if (next === "sse") {
                                  updateTemplateStreaming({
                                    eventDelimiter:
                                      templateDraft.streaming?.eventDelimiter || "\n\n",
                                    dataPrefix: templateDraft.streaming?.dataPrefix || "data:",
                                    deltaPath: templateDraft.streaming?.deltaPath || "",
                                    doneSignals:
                                      templateDraft.streaming?.doneSignals &&
                                      templateDraft.streaming.doneSignals.length
                                        ? templateDraft.streaming.doneSignals
                                        : ["[DONE]"],
                                  });
                                  updateTemplateRequest({ stream: true });
                                }
                              }}
                            >
                              {TEMPLATE_RESPONSE_MODES.map((mode) => (
                                <option key={mode.value} value={mode.value}>
                                  {mode.label}
                                </option>
                              ))}
                            </select>
                            <div style={{ minWidth: 70 }}>Method</div>
                            <select
                              className="it-select"
                              value={templateDraft.request?.method || "POST"}
                              onChange={(event) =>
                                updateTemplateRequest({ method: event.target.value })
                              }
                            >
                              {TEMPLATE_METHODS.map((method) => (
                                <option key={method} value={method}>
                                  {method}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="it-input-row">
                            <div style={{ minWidth: 70 }}>URL</div>
                            <input
                              className="it-input"
                              value={templateDraft.request?.url || ""}
                              onChange={(event) =>
                                updateTemplateRequest({ url: event.target.value })
                              }
                            />
                          </div>
                          <div className="it-input-row">
                            <div style={{ minWidth: 70 }}>Stream</div>
                            <label className="it-toggle">
                              <input
                                type="checkbox"
                                checked={Boolean(templateDraft.request?.stream)}
                                onChange={(event) =>
                                  updateTemplateRequest({ stream: event.target.checked })
                                }
                              />
                              <span>请求 stream</span>
                            </label>
                          </div>
                          <div className="it-template__json-grid">
                            <div className="it-template__json-block">
                              <div className="it-settings__title">Headers (JSON)</div>
                              <textarea
                                className="it-textarea it-template__textarea"
                                value={templateJsonDraft.headers}
                                onChange={(event) => {
                                  setTemplateJsonDraft((prev) => ({
                                    ...prev,
                                    headers: event.target.value,
                                  }));
                                  setTemplateJsonErrors((prev) => ({ ...prev, headers: undefined }));
                                }}
                              />
                              {templateJsonErrors.headers && (
                                <div className="it-settings__hint it-settings__hint--error">
                                  {templateJsonErrors.headers}
                                </div>
                              )}
                            </div>
                            <div className="it-template__json-block">
                              <div className="it-settings__title">Query (JSON)</div>
                              <textarea
                                className="it-textarea it-template__textarea"
                                value={templateJsonDraft.query}
                                onChange={(event) => {
                                  setTemplateJsonDraft((prev) => ({
                                    ...prev,
                                    query: event.target.value,
                                  }));
                                  setTemplateJsonErrors((prev) => ({ ...prev, query: undefined }));
                                }}
                              />
                              {templateJsonErrors.query && (
                                <div className="it-settings__hint it-settings__hint--error">
                                  {templateJsonErrors.query}
                                </div>
                              )}
                            </div>
                            <div className="it-template__json-block">
                              <div className="it-settings__title">Body (JSON)</div>
                              <textarea
                                className="it-textarea it-template__textarea"
                                value={templateJsonDraft.body}
                                onChange={(event) => {
                                  setTemplateJsonDraft((prev) => ({
                                    ...prev,
                                    body: event.target.value,
                                  }));
                                  setTemplateJsonErrors((prev) => ({ ...prev, body: undefined }));
                                }}
                              />
                              {templateJsonErrors.body && (
                                <div className="it-settings__hint it-settings__hint--error">
                                  {templateJsonErrors.body}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="it-input-row it-input-row--nowrap">
                            <div style={{ minWidth: 90 }}>textPath</div>
                            <input
                              className="it-input"
                              value={templateDraft.response?.textPath || ""}
                              onChange={(event) =>
                                updateTemplateResponse({ textPath: event.target.value })
                              }
                            />
                            <div style={{ minWidth: 90 }}>jsonPath</div>
                            <input
                              className="it-input"
                              value={templateDraft.response?.jsonPath || ""}
                              onChange={(event) =>
                                updateTemplateResponse({ jsonPath: event.target.value })
                              }
                            />
                          </div>
                          <div className="it-input-row it-input-row--nowrap">
                            <div style={{ minWidth: 90 }}>errorPath</div>
                            <input
                              className="it-input"
                              value={templateDraft.response?.errorPath || ""}
                              onChange={(event) =>
                                updateTemplateResponse({ errorPath: event.target.value })
                              }
                            />
                            <div style={{ minWidth: 90 }}>statusPath</div>
                            <input
                              className="it-input"
                              value={templateDraft.response?.statusPath || ""}
                              onChange={(event) =>
                                updateTemplateResponse({ statusPath: event.target.value })
                              }
                            />
                          </div>
                          <div className="it-input-row">
                            <div style={{ minWidth: 90 }}>doneSignal</div>
                            <input
                              className="it-input"
                              value={templateDraft.response?.doneSignal || ""}
                              onChange={(event) =>
                                updateTemplateResponse({ doneSignal: event.target.value })
                              }
                            />
                          </div>
                          {responseMode === "sse" && (
                            <div className="it-template__stream-grid">
                              <div className="it-input-row">
                                <div style={{ minWidth: 110 }}>eventDelimiter</div>
                                <input
                                  className="it-input"
                                  value={templateDraft.streaming?.eventDelimiter || ""}
                                  onChange={(event) =>
                                    updateTemplateStreaming({
                                      eventDelimiter: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="it-input-row">
                                <div style={{ minWidth: 110 }}>dataPrefix</div>
                                <input
                                  className="it-input"
                                  value={templateDraft.streaming?.dataPrefix || ""}
                                  onChange={(event) =>
                                    updateTemplateStreaming({
                                      dataPrefix: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="it-input-row">
                                <div style={{ minWidth: 110 }}>deltaPath</div>
                                <input
                                  className="it-input"
                                  value={templateDraft.streaming?.deltaPath || ""}
                                  onChange={(event) =>
                                    updateTemplateStreaming({
                                      deltaPath: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="it-input-row">
                                <div style={{ minWidth: 110 }}>doneSignals</div>
                                <input
                                  className="it-input"
                                  value={doneSignalsText}
                                  onChange={(event) =>
                                    updateTemplateStreaming({
                                      doneSignals: event.target.value
                                        .split(/[,|\n]/)
                                        .map((item) => item.trim())
                                        .filter(Boolean),
                                    })
                                  }
                                />
                              </div>
                              <div className="it-input-row">
                                <div style={{ minWidth: 110 }}>heartbeatPattern</div>
                                <input
                                  className="it-input"
                                  value={templateDraft.streaming?.heartbeatPattern || ""}
                                  onChange={(event) =>
                                    updateTemplateStreaming({
                                      heartbeatPattern: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                          )}
                          <div className="it-settings__actions">
                            <button
                              className="it-button it-button--primary it-button--compact"
                              disabled={uiLocked || savingTemplate}
                              onClick={handleSaveTemplate}
                            >
                              {savingTemplate ? "保存中..." : "保存模板"}
                            </button>
                            {isCreatingTemplate && (
                              <button
                                className="it-button it-button--secondary it-button--compact"
                                disabled={uiLocked || savingTemplate}
                                onClick={handleCancelTemplateDraft}
                              >
                                取消
                              </button>
                            )}
                          </div>
                          {templateSaveMessage && (
                            <div className="it-settings__hint">{templateSaveMessage}</div>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <div className="it-placeholder">选择或新建模板后编辑。</div>
                  )}
                </div>

                <div className="it-template__sidebar">
                  <div className="it-template__panel">
                    <div className="it-template__panel-title">可引用变量</div>
                    <div className="it-template__param-list">
                      {paramCatalogList.length ? (
                        paramCatalogList.map((name) => {
                          let status = "unused";
                          if (templateUsageSets.used.has(name)) {
                            status = "used";
                          } else if (templateUsageSets.empty.has(name)) {
                            status = "empty";
                          } else if (templateUsageSets.unknown.has(name)) {
                            status = "unknown";
                          } else if (templateUsageSets.unused.has(name)) {
                            status = "unused";
                          }
                          return (
                            <div
                              key={name}
                              className={`it-template__param-item ${status}`}
                            >
                              <span>{`{{${name}}}`}</span>
                              <span className="it-template__param-status">
                                {status === "used"
                                  ? "已引用"
                                  : status === "empty"
                                    ? "空值"
                                    : status === "unknown"
                                      ? "未定义"
                                      : "未引用"}
                              </span>
                            </div>
                          );
                        })
                      ) : (
                        <div className="it-placeholder">暂无变量清单</div>
                      )}
                    </div>
                    {templateUsageSets.unknown.size > 0 && (
                      <div className="it-template__param-extra">
                        未定义变量：
                        {Array.from(templateUsageSets.unknown).join(", ")}
                      </div>
                    )}
                    {templateUsageSets.empty.size > 0 && (
                      <div className="it-template__param-extra">
                        空值变量：
                        {Array.from(templateUsageSets.empty).join(", ")}
                      </div>
                    )}
                  </div>

                  <div className="it-template__panel">
                    <div className="it-template__panel-title">密钥库</div>
                    <div className="it-template__secret-list">
                      {templateSecrets.length ? (
                        templateSecrets.map((name) => (
                          <div key={name} className="it-template__secret-item">
                            <span>{name}</span>
                            <button
                              className="it-button it-button--secondary it-button--compact"
                              disabled={uiLocked || savingSecret}
                              onClick={() => handleDeleteSecret(name)}
                            >
                              删除
                            </button>
                          </div>
                        ))
                      ) : (
                        <div className="it-settings__hint">暂无密钥</div>
                      )}
                    </div>
                    <div className="it-input-row it-input-row--nowrap">
                      <input
                        className="it-input"
                        placeholder="名称"
                        value={secretDraft.name}
                        onChange={(event) =>
                          setSecretDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                      />
                      <input
                        className="it-input"
                        placeholder="密钥"
                        type="password"
                        value={secretDraft.value}
                        onChange={(event) =>
                          setSecretDraft((prev) => ({ ...prev, value: event.target.value }))
                        }
                      />
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || savingSecret}
                        onClick={handleSaveSecret}
                      >
                        {savingSecret ? "保存中..." : "保存"}
                      </button>
                    </div>
                    {secretMessage && (
                      <div className="it-settings__hint">{secretMessage}</div>
                    )}
                  </div>

                  <div className="it-template__panel">
                    <div className="it-template__panel-title">reasoning.effort 选项</div>
                    <div className="it-template__chips">
                      {templateParamOptions.length ? (
                        templateParamOptions.map((item) => (
                          <span key={item} className="it-chip it-chip--outline">
                            {item}
                          </span>
                        ))
                      ) : (
                        <span className="it-settings__hint">暂无选项</span>
                      )}
                    </div>
                    <div className="it-input-row it-input-row--nowrap">
                      <input
                        className="it-input"
                        placeholder="新增选项"
                        value={templateParamInput}
                        onChange={(event) => setTemplateParamInput(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            handleAddParamOption();
                          }
                        }}
                      />
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked}
                        onClick={handleAddParamOption}
                      >
                        添加
                      </button>
                      <button
                        className="it-button it-button--secondary it-button--compact"
                        disabled={uiLocked || savingParamOptions}
                        onClick={handleSaveParamOptions}
                      >
                        {savingParamOptions ? "保存中..." : "保存"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="it-template__test">
                <button className="it-button it-button--secondary it-button--compact" disabled>
                  Dry-run
                </button>
                <button className="it-button it-button--secondary it-button--compact" disabled>
                  Live
                </button>
                <span className="it-settings__hint">模板测试接口待接入后启用。</span>
              </div>
            </div>

            <div className="it-settings__section it-settings__section--full">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">绑定与本地策略</div>
                  <div className="it-settings__desc">
                    仅模板引用才发送参数；未引用参数不发送
                  </div>
                </div>
              </div>
              <div className="it-template__cards">
                <div className="it-template__card">
                  <div className="it-settings__title">任务绑定</div>
                  <div className="it-settings__desc">解析/分段/评价仅可选 LLM 模板</div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>题目解析</div>
                    <select
                      className="it-select"
                      value={templateBindings.llm?.questionParse || ""}
                      onChange={(event) =>
                        setTemplateBindings((prev) => ({
                          ...prev,
                          llm: {
                            ...(prev.llm || {}),
                            questionParse: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">未绑定</option>
                      {llmTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>多题分段</div>
                    <select
                      className="it-select"
                      value={templateBindings.llm?.segment || ""}
                      onChange={(event) =>
                        setTemplateBindings((prev) => ({
                          ...prev,
                          llm: {
                            ...(prev.llm || {}),
                            segment: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">未绑定</option>
                      {llmTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>面试评价</div>
                    <select
                      className="it-select"
                      value={templateBindings.llm?.evaluation || ""}
                      onChange={(event) =>
                        setTemplateBindings((prev) => ({
                          ...prev,
                          llm: {
                            ...(prev.llm || {}),
                            evaluation: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">未绑定</option>
                      {llmTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>ASR 转写</div>
                    <select
                      className="it-select"
                      value={templateBindings.asr?.transcription || ""}
                      onChange={(event) =>
                        setTemplateBindings((prev) => ({
                          ...prev,
                          asr: {
                            ...(prev.asr || {}),
                            transcription: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">未绑定</option>
                      {asrTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>Embedding</div>
                    <select
                      className="it-select"
                      value={templateBindings.embedding?.retrieval || ""}
                      onChange={(event) =>
                        setTemplateBindings((prev) => ({
                          ...prev,
                          embedding: {
                            ...(prev.embedding || {}),
                            retrieval: event.target.value,
                          },
                        }))
                      }
                    >
                      <option value="">未绑定</option>
                      {embeddingTemplates.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name || item.id}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="it-settings__actions">
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked || savingBindings}
                      onClick={handleSaveTemplateBindings}
                    >
                      {savingBindings ? "保存中..." : "保存绑定"}
                    </button>
                  </div>
                </div>

                <div className="it-template__card">
                  <div className="it-settings__title">LLM 模板参数</div>
                  <div className="it-settings__desc">仅模板引用才发送</div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>Model</div>
                    <input
                      className="it-input"
                      value={apiForm.llm.model}
                      onChange={(event) =>
                        handleApiFieldChange("llm", "model", event.target.value)
                      }
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 110 }}>reasoning.effort</div>
                    <input
                      className="it-input"
                      list="it-reasoning-effort-list"
                      value={apiForm.llm.reasoningEffort || ""}
                      onChange={(event) =>
                        handleApiFieldChange("llm", "reasoningEffort", event.target.value)
                      }
                    />
                    <datalist id="it-reasoning-effort-list">
                      {templateParamOptions.map((item) => (
                        <option key={item} value={item} />
                      ))}
                    </datalist>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>web_search</div>
                    <label className="it-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(apiForm.llm.webSearch)}
                        onChange={(event) =>
                          handleApiFieldChange("llm", "webSearch", event.target.checked)
                        }
                      />
                      <span>启用</span>
                    </label>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>stream</div>
                    <label className="it-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(apiForm.llm.stream)}
                        onChange={(event) =>
                          handleApiFieldChange("llm", "stream", event.target.checked)
                        }
                      />
                      <span>启用</span>
                    </label>
                  </div>
                  <div className="it-settings__desc">本地策略（不发送）</div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>超时(s)</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.llm.timeoutSec}
                      onChange={(event) =>
                        handleApiFieldChange("llm", "timeoutSec", Number(event.target.value))
                      }
                    />
                    <div style={{ minWidth: 70 }}>重试</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.llm.maxRetries}
                      onChange={(event) =>
                        handleApiFieldChange("llm", "maxRetries", Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>防重复</div>
                    <label className="it-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(apiForm.llm.antiRepeat)}
                        onChange={(event) =>
                          handleApiFieldChange("llm", "antiRepeat", event.target.checked)
                        }
                      />
                      <span>启用</span>
                    </label>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>前缀复用</div>
                    <label className="it-toggle">
                      <input
                        type="checkbox"
                        checked={Boolean(apiForm.llm.reusePrefix)}
                        onChange={(event) =>
                          handleApiFieldChange("llm", "reusePrefix", event.target.checked)
                        }
                      />
                      <span>启用</span>
                    </label>
                  </div>
                  <div className="it-settings__actions">
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked || savingLlmParams}
                      onClick={handleSaveLlmParams}
                    >
                      {savingLlmParams ? "保存中..." : "保存 LLM 参数"}
                    </button>
                  </div>
                  {llmParamsMessage && (
                    <div className="it-settings__hint">{llmParamsMessage}</div>
                  )}
                </div>

                <div className="it-template__card">
                  <div className="it-settings__title">ASR 参数</div>
                  <div className="it-settings__desc">本地策略（不发送）</div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>分片(s)</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.asr.maxChunkSec}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "maxChunkSec", Number(event.target.value))
                      }
                    />
                    <div style={{ minWidth: 70 }}>并发</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.asr.maxConcurrency}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "maxConcurrency", Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>超时(s)</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.asr.timeoutSec}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "timeoutSec", Number(event.target.value))
                      }
                    />
                    <div style={{ minWidth: 70 }}>重试</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.asr.maxRetries}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "maxRetries", Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="it-settings__desc">可选发送参数（仅模板引用）</div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>语言</div>
                    <input
                      className="it-input"
                      value={apiForm.asr.language}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "language", event.target.value)
                      }
                    />
                    <div style={{ minWidth: 70 }}>dev_pid</div>
                    <input
                      className="it-input"
                      type="number"
                      value={apiForm.asr.devPid}
                      onChange={(event) =>
                        handleApiFieldChange("asr", "devPid", Number(event.target.value))
                      }
                    />
                  </div>
                  <div className="it-settings__actions">
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked || savingAsrParams}
                      onClick={handleSaveAsrParams}
                    >
                      {savingAsrParams ? "保存中..." : "保存 ASR 参数"}
                    </button>
                  </div>
                  {asrParamsMessage && (
                    <div className="it-settings__hint">{asrParamsMessage}</div>
                  )}
                </div>
              </div>
            </div>
<div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">评分提示词</div>
                  <div className="it-settings__desc">严格高标准，不输出安慰语</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("evaluation")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <textarea
                className="it-textarea it-textarea--prompt"
                value={customPrompt}
                onChange={(event) => setCustomPrompt(event.target.value)}
              />
              {promptSaveScope === "evaluation" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">示范答案提示词</div>
                  <div className="it-settings__desc">控制总时长≤10分钟，公务员思维、结构清晰</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("demo")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <textarea
                className="it-textarea it-textarea--prompt"
                value={demoPrompt}
                onChange={(event) => setDemoPrompt(event.target.value)}
              />
              <div className="it-input-row">
                <div style={{ minWidth: 120 }}>示范生成方式</div>
                <select
                  className="it-select"
                  value={answerMode}
                  onChange={(event) =>
                    setAnswerMode(event.target.value === "single" ? "single" : "two-step")
                  }
                >
                  <option value="two-step">两步法：先提纲后整篇</option>
                  <option value="single">单次：提纲+整篇一次输出</option>
                </select>
              </div>
              <div className="it-settings__hint">
                两步法会额外调用一次 LLM，成本与耗时更高，但更稳定。
              </div>
              {promptSaveScope === "demo" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">每题独立提示词（最多3题）</div>
                  <div className="it-settings__desc">持久化保存，逐题覆盖总体提示词</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={() => handleSavePrompts("per-question")}
                  >
                    保存提示词
                  </button>
                </div>
              </div>
              <div className="it-question-prompts">
                {[0, 1, 2].map((idx) => (
                  <div key={idx} className="it-question-prompts__item">
                    <div className="it-question-prompts__title">第 {idx + 1} 题</div>
                    <div className="it-question-prompts__pair">
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        placeholder="本题评分提示词（可选）"
                        value={perQuestionSystemPrompts[idx] || ""}
                        onChange={(event) => {
                          const next = [...perQuestionSystemPrompts];
                          next[idx] = event.target.value;
                          setPerQuestionSystemPrompts(next);
                        }}
                      />
                      <textarea
                        className="it-textarea it-textarea--prompt"
                        placeholder="本题示范提示词（可选）"
                        value={perQuestionDemoPrompts[idx] || ""}
                        onChange={(event) => {
                          const next = [...perQuestionDemoPrompts];
                          next[idx] = event.target.value;
                          setPerQuestionDemoPrompts(next);
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              {promptSaveScope === "per-question" && promptSaveMessage && (
                <div className="it-settings__hint">{promptSaveMessage}</div>
              )}
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">输入设备</div>
                  <div className="it-settings__desc">选择录音采集的麦克风来源</div>
                </div>
                <div className="it-settings__actions">
                  <button
                    className="it-button it-button--secondary it-button--compact"
                    disabled={uiLocked}
                    onClick={handleRefreshInputs}
                  >
                    刷新列表
                  </button>
                </div>
              </div>
              <div className="it-input-row">
                <select
                  className="it-select"
                  value={selectedInput}
                  onChange={(event) => setSelectedInput(event.target.value)}
                  disabled={uiLocked}
                >
                  <option value="">系统默认</option>
                  {nativeInputs.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
              <div className="it-settings__hint">
                未选择时使用系统默认输入设备；若需要手动指定 ffmpeg 输入，可在环境变量 IT_FFMPEG_INPUT 中填 audio=设备名。
              </div>
            </div>

            <div className="it-settings__section">
              <div className="it-settings__header">
                <div>
                  <div className="it-settings__title">检索配置</div>
                  <div className="it-settings__desc">知识库目录与开关</div>
                </div>
                <label className="it-toggle">
                  <input
                    type="checkbox"
                    checked={config?.retrievalEnabled ?? true}
                    disabled={uiLocked}
                    onChange={(event) => handleToggleRetrieval(event.target.checked)}
                  />
                  <span>启用检索</span>
                </label>
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>模式</div>
                <select
                  className="it-select"
                  value={retrievalForm.mode}
                  disabled={uiLocked}
                  onChange={(event) => handleRetrievalFieldChange("mode", event.target.value)}
                >
                  <option value="vector">向量语义</option>
                  <option value="keyword">词面匹配</option>
                </select>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>Top K</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topK}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topK", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>Min Score</div>
                <input
                  className="it-input"
                  type="number"
                  step="0.05"
                  value={retrievalForm.minScore}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("minScore", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>检索并行</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.maxConcurrency}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange(
                      "maxConcurrency",
                      Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>笔记TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKNotes}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKNotes", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>知识库TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKKnowledge}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKKnowledge", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>评分标准TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKRubrics}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKRubrics", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 90 }}>示例答案TopK</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.topKExamples}
                  disabled={uiLocked}
                  onChange={(event) =>
                    handleRetrievalFieldChange("topKExamples", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>批大小</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.batchSize}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("batchSize", Number(event.target.value))
                  }
                />
                <div style={{ minWidth: 80 }}>Query 上限</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.vector.queryMaxChars}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalVectorChange("queryMaxChars", Number(event.target.value))
                  }
                />
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>学习并行</div>
                <input
                  className="it-input"
                  type="number"
                  value={retrievalForm.embeddingMaxConcurrency}
                  disabled={uiLocked || retrievalForm.mode !== "vector"}
                  onChange={(event) =>
                    handleRetrievalFieldChange(
                      "embeddingMaxConcurrency",
                      Number(event.target.value),
                    )
                  }
                />
              </div>
              <div className="it-settings__actions">
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingRetrieval}
                  onClick={handleSaveRetrievalSettings}
                >
                  {savingRetrieval ? "保存中..." : "保存检索配置"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || clearingEmbeddingCache}
                  onClick={handleClearEmbeddingCache}
                >
                  {clearingEmbeddingCache ? "清理中..." : "清理向量缓存"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || clearingCorpusCache}
                  onClick={handleClearCorpusCache}
                >
                  {clearingCorpusCache ? "清理中..." : "清理语料索引缓存"}
                </button>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || traceLogEnabled}
                  onClick={handleEnableTraceLogs}
                >
                  {traceLogEnabled ? "日志已开启" : "开启日志输出"}
                </button>
              </div>
              {retrievalSaveMessage && (
                <div className="it-settings__hint">{retrievalSaveMessage}</div>
              )}
              {embeddingCacheMessage && (
                <div className="it-settings__hint">{embeddingCacheMessage}</div>
              )}
              {corpusCacheMessage && (
                <div className="it-settings__hint">{corpusCacheMessage}</div>
              )}
              {showEmbeddingWarmup && embeddingWarmup && (
                <div className="it-progress it-progress--compact">
                  <div className="it-progress__label">
                    <span>向量预计算</span>
                    <span>
                      {embeddingWarmup.message ||
                        `${embeddingWarmup.done}/${embeddingWarmup.total}`}
                    </span>
                  </div>
                  <div className="it-progress__bar">
                    <div
                      className="it-progress__fill"
                      style={{ width: `${embeddingWarmup.progress || 0}%` }}
                    />
                  </div>
                </div>
              )}
              <div className="it-settings__hint">
                索引与向量缓存会落盘保存，目录变更后会自动重新索引。
              </div>
              <div className="it-settings__hint">
                需要排查笔记学习时，点击“开启日志输出”后会在输出面板显示相关日志。
              </div>
              {retrievalCacheInfo && (
                <>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>语料缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {corpusCachePath || "-"}
                    </div>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>向量缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {embeddingCachePath || "-"}
                    </div>
                  </div>
                  <div className="it-input-row it-input-row--nowrap">
                    <div style={{ minWidth: 80 }}>缓存上限</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof corpusCacheMb === "number" ? `${corpusCacheMb} MB` : "-"}
                    </div>
                    <div style={{ minWidth: 80 }}>并发</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof maxConcurrency === "number" ? maxConcurrency : "-"}
                    </div>
                  </div>
                  <div className="it-input-row">
                    <div style={{ minWidth: 80 }}>Query 缓存</div>
                    <div className="it-settings__meta" style={{ flex: 1 }}>
                      {typeof queryCacheSize === "number" ? queryCacheSize : "-"}
                    </div>
                  </div>
                </>
              )}
              <div className="it-settings__hint">
                向量检索会调用 embedding 接口，模型名称请按平台实际填入。
              </div>
              <div className="it-input-row">
                <div style={{ minWidth: 80 }}>保存目录</div>
                <div className="it-settings__meta" style={{ flex: 1 }}>
                  {config?.sessionsDir || "sessions"}
                </div>
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked}
                  onClick={() => request("it/selectSessionsDir", undefined)}
                >
                  选择保存目录
                </button>
              </div>
              <div className="it-input-row it-input-row--nowrap">
                <div style={{ minWidth: 80 }}>历史命名</div>
                <select
                  className="it-select"
                  value={topicTitleMode}
                  disabled={uiLocked || savingTopicSettings}
                  onChange={(event) =>
                    setTopicTitleMode(event.target.value === "simple" ? "simple" : "llm")
                  }
                >
                  <option value="llm">LLM 摘要</option>
                  <option value="simple">题干前缀</option>
                </select>
                <div style={{ minWidth: 60 }}>长度</div>
                <input
                  className="it-input"
                  type="number"
                  min={4}
                  max={18}
                  value={topicTitleLen}
                  disabled={uiLocked || savingTopicSettings}
                  onChange={(event) => setTopicTitleLen(Number(event.target.value))}
                  style={{ width: 90 }}
                />
                <button
                  className="it-button it-button--secondary it-button--compact"
                  disabled={uiLocked || savingTopicSettings}
                  onClick={handleSaveTopicSettings}
                >
                  {savingTopicSettings ? "保存中..." : "保存命名"}
                </button>
              </div>
              <div className="it-settings__hint">
                选择“LLM 摘要”会额外调用一次 LLM，增加耗时与费用。
              </div>
              {topicSaveMessage && (
                <div className="it-settings__hint">{topicSaveMessage}</div>
              )}
              <div className="it-retrieval__list">
                {retrievalDirs.map((item) => (
                  <div key={item.key} className="it-retrieval__item">
                    <div className="it-retrieval__label">{item.label}</div>
                    <div className="it-retrieval__path">{item.value}</div>
                    <button
                      className="it-button it-button--secondary it-button--compact"
                      disabled={uiLocked}
                      onClick={() => handleSelectWorkspaceDir(item.key)}
                    >
                      选择目录
                    </button>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>
  );
};
