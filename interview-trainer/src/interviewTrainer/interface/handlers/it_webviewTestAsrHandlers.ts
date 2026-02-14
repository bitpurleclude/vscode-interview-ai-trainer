import { it_testAsr } from "../../application/useCases/it_testAsr";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItAsrTestHandlerPort } from "./it_webviewHandlerPorts";

export function it_registerAsrTestHandler(host: ItAsrTestHandlerPort): void {
  host.webviewProtocol.on("it/testAsr", async (msg) => {
    return await it_runLoggedHandler(
      host,
      {
        request: "it/testAsr",
        event: "interface.test.asr",
        payload: msg.data,
      },
      () =>
        it_testAsr({
          payload: msg.data,
          onTrace: (message, detail) => {
            host.logCorpusTrace(message, detail);
          },
        }),
    );
  });
}
