import type { ItWebviewHandlersHost } from "./it_webviewHandlerPorts";
import { it_registerConfigHandlers } from "./it_webviewConfigHandlers";
import { it_registerCoreHandlers } from "./it_webviewCoreHandlers";
import { it_registerClientTraceHandlers } from "./it_webviewClientTraceHandlers";
import { it_registerQuestionHandlers } from "./it_webviewQuestionHandlers";
import { it_registerRecordingHandlers } from "./it_webviewRecordingHandlers";
import { it_registerRetrievalHandlers } from "./it_webviewRetrievalHandlers";
import { it_registerResultHandlers } from "./it_webviewResultHandlers";
import { it_registerTestHandlers } from "./it_webviewTestHandlers";

export type { ItWebviewHandlersHost } from "./it_webviewHandlerPorts";

export function it_registerHandlers(host: ItWebviewHandlersHost): void {
  it_registerCoreHandlers(host);
  it_registerClientTraceHandlers(host);
  it_registerRecordingHandlers(host);
  it_registerQuestionHandlers(host);
  it_registerRetrievalHandlers(host);
  it_registerConfigHandlers(host);
  it_registerTestHandlers(host);
  it_registerResultHandlers(host);
}
