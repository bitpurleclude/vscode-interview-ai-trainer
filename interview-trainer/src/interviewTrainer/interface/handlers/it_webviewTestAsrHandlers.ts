import { it_testAsr } from "../../application/useCases/it_testAsr";
import type { ItAsrTestHandlerPort } from "./it_webviewHandlerPorts";

export function it_registerAsrTestHandler(host: ItAsrTestHandlerPort): void {
  host.webviewProtocol.on("it/testAsr", async (msg) => {
    return await it_testAsr({ payload: msg.data });
  });
}
