import {
  it_convertAudioToPcmFromWebview,
  it_listNativeInputsFromWebview,
  type ItRecordingUseCaseContext,
  it_startNativeRecordingFromWebview,
  it_stopNativeRecordingFromWebview,
} from "../../application/useCases/it_recordingActions";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createRecordingUseCaseContext(
  host: ItWebviewHandlersHost,
): ItRecordingUseCaseContext {
  return {
    findFfmpeg: host.it_findFfmpeg,
    listInputs: host.it_listInputs,
    startNativeRecording: host.it_startNativeRecording,
    stopNativeRecording: host.it_stopNativeRecording,
    resetNativeInputs: () => {
      host.availableInputs = null;
      host.detectedInput = null;
    },
  };
}

export function it_registerRecordingHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/startNativeRecording", async (msg) =>
    it_startNativeRecordingFromWebview({
      context: it_createRecordingUseCaseContext(host),
      payload: msg.data,
    }),
  );

  host.webviewProtocol.on("it/stopNativeRecording", async () =>
    it_stopNativeRecordingFromWebview({
      context: it_createRecordingUseCaseContext(host),
    }),
  );

  host.webviewProtocol.on("it/listNativeInputs", async (msg) =>
    it_listNativeInputsFromWebview({
      context: it_createRecordingUseCaseContext(host),
      payload: msg.data,
    }),
  );

  host.webviewProtocol.on("it/convertAudioToPcm", async (msg) =>
    it_convertAudioToPcmFromWebview({
      context: it_createRecordingUseCaseContext(host),
      payload: msg.data,
    }),
  );
}
