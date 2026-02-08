import {
  it_convertAudioToPcmFromWebview,
  it_listNativeInputsFromWebview,
  type ItRecordingUseCaseContext,
  it_startNativeRecordingFromWebview,
  it_stopNativeRecordingFromWebview,
} from "../../application/useCases/it_recordingActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItRecordingHandlersPort } from "./it_webviewHandlerPorts";

function it_createRecordingUseCaseContext(
  host: ItRecordingHandlersPort,
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

export function it_registerRecordingHandlers(host: ItRecordingHandlersPort): void {
  host.webviewProtocol.on("it/startNativeRecording", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/startNativeRecording",
        event: "interface.recording.start_native",
        payload: msg.data,
      },
      () =>
        it_startNativeRecordingFromWebview({
          context: it_createRecordingUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/stopNativeRecording", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/stopNativeRecording",
        event: "interface.recording.stop_native",
      },
      () =>
        it_stopNativeRecordingFromWebview({
          context: it_createRecordingUseCaseContext(host),
        }),
    ),
  );

  host.webviewProtocol.on("it/listNativeInputs", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/listNativeInputs",
        event: "interface.recording.list_inputs",
        payload: msg.data,
      },
      () =>
        it_listNativeInputsFromWebview({
          context: it_createRecordingUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/convertAudioToPcm", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/convertAudioToPcm",
        event: "interface.recording.convert_audio",
        payload: msg.data,
      },
      () =>
        it_convertAudioToPcmFromWebview({
          context: it_createRecordingUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );
}
