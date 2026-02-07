import { it_testEmbedding } from "../../application/useCases/it_testEmbedding";
import type { ItEmbeddingTestHandlerPort } from "./it_webviewHandlerPorts";

export function it_registerEmbeddingTestHandler(host: ItEmbeddingTestHandlerPort): void {
  host.webviewProtocol.on("it/testEmbedding", async (msg) => {
    return await it_testEmbedding({
      payload: msg.data,
      onFailure: (error) => {
        host.logEmbeddingTestFailure(error);
      },
    });
  });
}
