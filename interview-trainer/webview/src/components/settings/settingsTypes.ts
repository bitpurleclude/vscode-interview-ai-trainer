import type React from "react";
import type {
  ItApiTemplate,
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
  ItTemplateBindings,
  ItTemplateCategory,
} from "../../types";

export type StreamingSettings = {
  enabled: boolean;
  autoCollapse: boolean;
  previewChars: number;
};

export type TemplateJsonDraft = {
  headers: string;
  query: string;
  body: string;
};

export type TemplateJsonErrors = Partial<Record<"headers" | "query" | "body", string>>;

export type TemplateUsageSets = {
  used: Set<string>;
  unused: Set<string>;
  unknown: Set<string>;
  empty: Set<string>;
};

export type ApiForm = {
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

export type RetrievalForm = {
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

export type RetrievalField = Exclude<keyof RetrievalForm, "vector">;

export type SecretDraft = {
  name: string;
  value: string;
};

export type RetrievalDir = {
  key: string;
  label: string;
  value: string;
};

export type SettingsCommonTemplateProps = {
  uiLocked: boolean;
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
  setTemplateJsonErrors: React.Dispatch<React.SetStateAction<TemplateJsonErrors>>;
  templateSaveMessage: string | null;
  savingTemplate: boolean;
  isCreatingTemplate: boolean;
  handleCreateTemplate: () => void;
  handleDuplicateTemplate: () => void;
  handleDeleteTemplate: () => void;
  handleCancelTemplateDraft: () => void;
  handleSaveTemplate: () => void;
  updateTemplateRequest: (payload: Partial<ItApiTemplate["request"]>) => void;
  updateTemplateResponse: (payload: Partial<NonNullable<ItApiTemplate["response"]>>) => void;
  updateTemplateStreaming: (payload: Partial<NonNullable<ItApiTemplate["streaming"]>>) => void;
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
};

export type SettingsEnvProps = {
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
  handleOpenSettings: () => void;
  handleSelectSessionsDir: () => void;
};

export type SettingsBindingProps = {
  uiLocked: boolean;
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
};

export type SettingsPromptProps = {
  uiLocked: boolean;
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
};

export type SettingsInputProps = {
  uiLocked: boolean;
  nativeInputs: string[];
  selectedInput: string;
  setSelectedInput: React.Dispatch<React.SetStateAction<string>>;
  handleRefreshInputs: () => void;
};

export type SettingsRetrievalProps = {
  uiLocked: boolean;
  retrievalEnabled: boolean;
  handleToggleRetrieval: (enabled: boolean) => void;
  retrievalForm: RetrievalForm;
  handleRetrievalFieldChange: (field: RetrievalField, value: string | number | boolean) => void;
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
  traceLogEnabled: boolean;
  handleEnableTraceLogs: () => void;
  showEmbeddingWarmup: boolean;
  embeddingWarmup: ItEmbeddingWarmupState | undefined;
  retrievalCacheInfo: ItConfigSnapshot["retrievalCache"] | undefined;
  corpusCachePath: string;
  embeddingCachePath: string;
  corpusCacheMb: number | undefined;
  queryCacheSize: number | undefined;
  maxConcurrency: number | undefined;
  sessionsDir: string;
  handleSelectSessionsDir: () => void;
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
