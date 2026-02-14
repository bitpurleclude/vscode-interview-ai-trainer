import { it_testLlm } from "../../application/useCases/it_testLlm";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItLlmTestHandlerPort } from "./it_webviewHandlerPorts";
import { it_emitLlmTestRequest } from "./it_webviewTestHelpers";

export function it_registerLlmTestHandler(host: ItLlmTestHandlerPort): void {
  host.webviewProtocol.on("it/testLlm", async (msg) => {
    return await it_runLoggedHandler(
      host,
      {
        request: "it/testLlm",
        event: "interface.test.llm",
        payload: msg.data,
      },
      () =>
        it_testLlm({
          payload: msg.data,
          onEmitRequest: (detail) => {
            it_emitLlmTestRequest(host, detail);
          },
          onFailure: (error, detail) => {
            host.logLlmTestFailure(error, detail);
          },
          onTrace: (message, detail) => {
            host.logCorpusTrace(message, detail);
          },
        }),
    );
  });
}
