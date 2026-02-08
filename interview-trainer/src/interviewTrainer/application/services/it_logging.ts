import * as vscode from "vscode";
import type { ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import type {
  ItEvaluationStreamUpdate,
  ItStepStreamUpdate,
  ItWebviewPort,
} from "./it_webviewPort";
import { it_getLoggingGuardrailsFromConfig } from "./it_guardrails";
import { it_createOutputChannelLogSink } from "./it_logSinkGateway";
import { it_createStructuredLogger } from "./it_structuredLogger";

export type ItLogHost = {
  outputChannel: vscode.OutputChannel;
  traceLogsEnabled: boolean;
  webviewProtocol: ItWebviewPort;
  configSnapshot: ItConfigSnapshot;
  configBundle?: {
    guardrails?: unknown;
  };
};

export type ItInternalLogEvent = {
  level: "debug" | "info" | "warn" | "error";
  event: string;
  module: string;
  message: string;
  status?: string;
  errorCode?: string;
  detail?: Record<string, unknown>;
};

function it_createHostLogger(host: ItLogHost) {
  const guardrails = it_getLoggingGuardrailsFromConfig(host.configBundle?.guardrails as any);
  return it_createStructuredLogger({
    sink: it_createOutputChannelLogSink(host.outputChannel),
    traceLogsEnabled: host.traceLogsEnabled,
    guardrails,
  });
}

function it_toErrorDetail(error: unknown): Record<string, unknown> {
  const detail: Record<string, unknown> = {};
  const debug = (error as { itDebug?: unknown })?.itDebug;
  if (debug !== undefined) {
    detail.debug = debug;
  }

  const response = (error as { response?: { status?: number; data?: unknown } })?.response;
  if (response) {
    detail.response = {
      status: response.status,
      data: response.data,
    };
  }

  if (error instanceof Error) {
    detail.error = {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  } else if (error !== undefined) {
    detail.error = String(error);
  }

  return detail;
}

export function it_logInternalEvent(host: ItLogHost, event: ItInternalLogEvent): void {
  const logger = it_createHostLogger(host);
  const payload = {
    event: event.event,
    layer: "application" as const,
    module: event.module,
    status: event.status,
    errorCode: event.errorCode,
    message: event.message,
    detail: event.detail,
  };
  if (event.level === "debug") {
    logger.debug(payload);
    return;
  }
  if (event.level === "warn") {
    logger.warn(payload);
    return;
  }
  if (event.level === "error") {
    logger.error(payload);
    return;
  }
  logger.info(payload);
}

export function it_logEmbeddingTestFailure(host: ItLogHost, error: unknown): void {
  const logger = it_createHostLogger(host);
  logger.error({
    event: "test.embedding.failure",
    layer: "application",
    module: "it_logging",
    status: "failed",
    message: "Embedding test failed",
    detail: it_toErrorDetail(error),
  });
  host.outputChannel.show(true);
}

export function it_logLlmTestFailure(
  host: ItLogHost,
  error: unknown,
  detail?: Record<string, unknown>,
): void {
  const logger = it_createHostLogger(host);
  logger.error({
    event: "test.llm.failure",
    layer: "application",
    module: "it_logging",
    status: "failed",
    message: "LLM test failed",
    detail: {
      ...(detail || {}),
      ...it_toErrorDetail(error),
    },
  });
  host.outputChannel.show(true);
}

export function it_logCorpusTrace(
  host: ItLogHost,
  message: string,
  detail?: Record<string, unknown>,
): void {
  const logger = it_createHostLogger(host);
  logger.info({
    event: "trace.corpus",
    layer: "application",
    module: "it_logging",
    message: message || "trace event",
    detail,
  });
}

export function it_emitStreamUpdate(
  host: ItLogHost,
  update: ItStepStreamUpdate,
): void {
  if (host.configSnapshot?.streaming?.enabled === false) {
    return;
  }
  host.webviewProtocol.send("it/stepStreamUpdate", update);
}

export function it_emitEvaluationStreamUpdate(
  host: ItLogHost,
  update: ItEvaluationStreamUpdate,
): void {
  if (host.configSnapshot?.streaming?.enabled === false) {
    return;
  }
  host.webviewProtocol.send("it/evaluationStreamUpdate", update);
}
