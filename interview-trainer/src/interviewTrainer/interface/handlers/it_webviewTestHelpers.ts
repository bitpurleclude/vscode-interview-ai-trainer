import { it_getLoggingGuardrailsFromConfig } from "../../application/services/it_guardrails";
import { it_createOutputChannelLogSink } from "../../application/services/it_logSinkGateway";
import { it_createStructuredLogger } from "../../application/services/it_structuredLogger";
import type { ItLlmTestHandlerPort } from "./it_webviewHandlerPorts";

export function it_emitLlmTestRequest(
  host: ItLlmTestHandlerPort,
  detail: Record<string, unknown>,
): void {
  const guardrails = it_getLoggingGuardrailsFromConfig(host.configBundle?.guardrails as any);
  const logger = it_createStructuredLogger({
    sink: it_createOutputChannelLogSink(host.outputChannel),
    traceLogsEnabled: host.traceLogsEnabled,
    guardrails,
  });

  const record = logger.info({
    event: "test.llm.request",
    layer: "interface",
    module: "it_webviewTestHelpers",
    message: "LLM test request",
    detail,
  });

  if (record) {
    host.outputChannel.show(true);
  }
}
