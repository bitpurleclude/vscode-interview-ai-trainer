import type { ItTestHandlersPort } from "./it_webviewHandlerPorts";
import { it_registerAsrTestHandler } from "./it_webviewTestAsrHandlers";
import { it_registerEmbeddingTestHandler } from "./it_webviewTestEmbeddingHandlers";
import { it_registerLlmTestHandler } from "./it_webviewTestLlmHandlers";
import { it_registerTemplateTestHandlers } from "./it_webviewTemplateTestHandlers";

export function it_registerTestHandlers(host: ItTestHandlersPort): void {
  it_registerLlmTestHandler(host);
  it_registerAsrTestHandler(host);
  it_registerEmbeddingTestHandler(host);
  it_registerTemplateTestHandlers(host);
}