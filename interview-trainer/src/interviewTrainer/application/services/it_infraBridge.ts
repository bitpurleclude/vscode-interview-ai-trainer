// Transitional bridge to keep interface layer importing only application-level modules.
// Infra dependencies are centralized here and will be replaced by dedicated use-cases gradually.

export {
  it_ensureConfigFiles,
  it_getUserProviderDir,
} from "../../infra/api/it_apiConfig";
export type {
  ItApiConfig,
  ItConfigBundle,
} from "../../infra/api/it_apiConfig";
export { ItConfigService } from "../../infra/api/it_configService";
export { it_callLlmChat } from "../../infra/api/it_llm";
export { it_callEmbedding } from "../../infra/api/it_embedding";
export { it_callBaiduAsr } from "../../infra/api/it_baidu";
export { it_callVolcAsr } from "../../infra/api/it_volc_asr";
export {
  it_buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest,
} from "../../infra/api/it_requestBuilder";
export {
  it_executeTemplate,
  it_renderTemplateRequest,
  it_resolveBindingTemplate,
  it_resolveTemplateById,
  type ItTemplateRuntime,
} from "../../infra/api/it_templateExecutor";
export type {
  ItLlmConfig,
  ItLlmMessage,
} from "../../infra/api/it_llmTypes";
export {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../../infra/storage/it_questionCache";
export {
  it_appendReportAsync,
  it_updateReferenceNotesFileAsync,
} from "../../infra/storage/it_report";
export {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
  it_storeAudioCopy,
  it_writeTopicMetaAsync,
} from "../../infra/storage/it_sessions";
export { it_listHistoryItems } from "../../infra/storage/it_history";
export { it_clearEmbeddingMemoryCache } from "../../infra/notes";
export { it_hashText, it_normalizeText } from "../../infra/utils/it_text";
export { it_pcm16ToWavBuffer } from "../../infra/utils/it_wav";
