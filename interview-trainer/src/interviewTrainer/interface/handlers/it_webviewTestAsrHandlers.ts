import { it_testAsr } from "../../application/useCases/it_testAsr";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerAsrTestHandler(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testAsr", async (msg) => {
    return await it_testAsr({ payload: msg.data });
  });
}
