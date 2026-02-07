// Application-level gateway for recording conversion/chunk helpers.

export {
  it_convertAudioToPcmBase64,
  it_detectDefaultInput,
  it_findFfmpeg,
  it_listInputs,
  it_runFfmpegProbe,
  it_startNativeRecording,
  it_stopNativeRecording,
} from "../../infra/recording/it_recording";
export type { ItRecordingHost } from "../../infra/recording/it_recording";
export {
  it_splitPcmBase64,
  it_storeRecordingAsync,
} from "../../infra/recording/it_recordingStore";
