import { it_testEmbedding } from "../../application/useCases/it_testEmbedding";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerEmbeddingTestHandler(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testEmbedding", async (msg) => {
    return await it_testEmbedding({
      payload: msg.data,
      onFailure: (error) => {
        host.logEmbeddingTestFailure(error);
      },
    });
  });
}
