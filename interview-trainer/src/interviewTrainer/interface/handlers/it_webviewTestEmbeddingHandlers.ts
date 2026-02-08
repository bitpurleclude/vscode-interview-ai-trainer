import { it_testEmbedding } from "../../application/useCases/it_testEmbedding";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItEmbeddingTestHandlerPort } from "./it_webviewHandlerPorts";

export function it_registerEmbeddingTestHandler(host: ItEmbeddingTestHandlerPort): void {
  host.webviewProtocol.on("it/testEmbedding", async (msg) => {
    return await it_runLoggedHandler(
      host,
      {
        request: "it/testEmbedding",
        event: "interface.test.embedding",
        payload: msg.data,
      },
      () =>
        it_testEmbedding({
          payload: msg.data,
          onFailure: (error) => {
            host.logEmbeddingTestFailure(error);
          },
        }),
    );
  });
}
