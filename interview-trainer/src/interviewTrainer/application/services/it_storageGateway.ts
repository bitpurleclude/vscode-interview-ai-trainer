// Application-level gateway for storage/history/question-cache operations.

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
