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


const IT_TRACE_META_KEYS = new Set([
  "event",
  "layer",
  "module",
  "status",
  "errorCode",
  "stage",
  "runId",
  "requestId",
  "level",
]);

function it_pickString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function it_resolveTraceLayer(event: string, layer?: string): string {
  if (layer) {
    return layer;
  }
  if (event.startsWith("interface.")) {
    return "interface";
  }
  if (event.startsWith("infra.")) {
    return "infra";
  }
  if (event.startsWith("domain.")) {
    return "domain";
  }
  return "application";
}

function it_resolveTraceLevel(
  status: string | undefined,
  level: unknown,
): "debug" | "info" | "warn" | "error" {
  const normalizedLevel = String(level || "").toLowerCase();
  if (
    normalizedLevel === "debug" ||
    normalizedLevel === "info" ||
    normalizedLevel === "warn" ||
    normalizedLevel === "error"
  ) {
    return normalizedLevel;
  }
  const normalizedStatus = String(status || "").toLowerCase();
  if (normalizedStatus === "error") {
    return "error";
  }
  if (normalizedStatus === "warn" || normalizedStatus === "warning") {
    return "warn";
  }
  return "info";
}

function it_extractTraceLogPayload(detail?: Record<string, unknown>): {
  event: string;
  layer: string;
  module: string;
  status?: string;
  errorCode?: string;
  stage?: string;
  runId?: string;
  requestId?: string;
  level: "debug" | "info" | "warn" | "error";
  detail?: Record<string, unknown>;
} {
  const source = detail || {};
  const event = it_pickString(source.event) || "trace.corpus";
  const status = it_pickString(source.status);
  const layer = it_resolveTraceLayer(event, it_pickString(source.layer));
  const module = it_pickString(source.module) || "it_logging";
  const errorCode = it_pickString(source.errorCode);
  const stage = it_pickString(source.stage);
  const runId = it_pickString(source.runId);
  const requestId = it_pickString(source.requestId);
  const level = it_resolveTraceLevel(status, source.level);

  const payload = Object.fromEntries(
    Object.entries(source).filter(([key]) => !IT_TRACE_META_KEYS.has(key)),
  ) as Record<string, unknown>;

  return {
    event,
    layer,
    module,
    status,
    errorCode,
    stage,
    runId,
    requestId,
    level,
    detail: Object.keys(payload).length ? payload : undefined,
  };
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
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
  const payload = it_extractTraceLogPayload(detail);
  const resolvedMessage = message || `${payload.event}${payload.status ? ` ${payload.status}` : ""}`;
  const input = {
    event: payload.event,
    layer: payload.layer,
    module: payload.module,
    status: payload.status,
    errorCode: payload.errorCode,
    stage: payload.stage,
    runId: payload.runId,
    requestId: payload.requestId,
    message: resolvedMessage,
    detail: payload.detail,
  };

  if (payload.level === "debug") {
    logger.debug(input);
    return;
  }
  if (payload.level === "warn") {
    logger.warn(input);
    return;
  }
  if (payload.level === "error") {
    logger.error(input);
    return;
  }
  logger.info(input);
}

export function it_emitStreamUpdate(
  host: ItLogHost,
  update: ItStepStreamUpdate,
): void {
  if (host.configSnapshot?.streaming?.enabled === false) {
    it_logCorpusTrace(host, "step stream update dropped", {
      event: "application.streaming.step_update",
      module: "it_logging",
      status: "dropped",
      level: "debug",
      reason: "streaming_disabled",
      step: update.step,
      done: Boolean(update.done),
      reset: Boolean(update.reset),
      textLength: update.text.length,
    });
    return;
  }

  try {
    host.webviewProtocol.send("it/stepStreamUpdate", update);
  } catch (error) {
    it_logCorpusTrace(host, "step stream update send failed", {
      event: "application.streaming.step_update",
      module: "it_logging",
      status: "error",
      level: "error",
      errorCode: "webview_send_failed",
      step: update.step,
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export function it_emitEvaluationStreamUpdate(
  host: ItLogHost,
  update: ItEvaluationStreamUpdate,
): void {
  const textLength = typeof update.text === "string" ? update.text.length : 0;
  if (host.configSnapshot?.streaming?.enabled === false) {
    it_logCorpusTrace(host, "evaluation stream update dropped", {
      event: "application.streaming.evaluation_update",
      module: "it_logging",
      status: "dropped",
      level: "debug",
      reason: "streaming_disabled",
      questionIndex: update.questionIndex,
      done: Boolean(update.done),
      reset: Boolean(update.reset),
      textLength,
      hasSnapshot: Boolean(update.snapshot),
    });
    return;
  }

  try {
    host.webviewProtocol.send("it/evaluationStreamUpdate", update);
  } catch (error) {
    it_logCorpusTrace(host, "evaluation stream update send failed", {
      event: "application.streaming.evaluation_update",
      module: "it_logging",
      status: "error",
      level: "error",
      errorCode: "webview_send_failed",
      questionIndex: update.questionIndex,
      error: it_errorMessage(error),
    });
    throw error;
  }
}
