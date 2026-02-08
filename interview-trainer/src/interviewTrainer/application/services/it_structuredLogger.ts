import type { ItLoggingGuardrails } from "./it_guardrails";
import type { ItStructuredLogSink } from "./it_logSinkGateway";

export type ItStructuredLogLevel = "debug" | "info" | "warn" | "error";

export type ItStructuredLogRecord = {
  ts: string;
  level: ItStructuredLogLevel;
  event: string;
  layer: string;
  module: string;
  runId?: string;
  requestId?: string;
  stage?: string;
  status?: string;
  errorCode?: string;
  message: string;
  detail?: unknown;
};

export type ItStructuredLogInput = Omit<ItStructuredLogRecord, "ts"> & {
  ts?: string;
};

export type ItStructuredLoggerOptions = {
  sink: ItStructuredLogSink;
  traceLogsEnabled: boolean;
  guardrails: ItLoggingGuardrails;
  nowIso?: () => string;
};

export type ItStructuredLogger = {
  emit: (input: ItStructuredLogInput) => ItStructuredLogRecord | null;
  debug: (input: Omit<ItStructuredLogInput, "level">) => ItStructuredLogRecord | null;
  info: (input: Omit<ItStructuredLogInput, "level">) => ItStructuredLogRecord | null;
  warn: (input: Omit<ItStructuredLogInput, "level">) => ItStructuredLogRecord | null;
  error: (input: Omit<ItStructuredLogInput, "level">) => ItStructuredLogRecord | null;
};

const IT_SENSITIVE_KEY_RE = /(api[_-]?key|authorization|token|secret|cookie|password)/i;
const IT_BINARY_KEY_RE = /(audio|base64|speech|pcm|wave|wav)/i;

function it_truncateText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}...(truncated,len=${value.length})`;
}

function it_sanitizeByKey(key: string | undefined, value: string, messageMaxChars: number): string {
  if (key && IT_SENSITIVE_KEY_RE.test(key)) {
    return "***";
  }
  if (key && IT_BINARY_KEY_RE.test(key)) {
    return `[binary len=${value.length}]`;
  }
  return it_truncateText(value, messageMaxChars);
}

function it_sanitizeDetailValue(
  value: unknown,
  limits: ItLoggingGuardrails["limits"],
  depth: number,
  key?: string,
): unknown {
  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return it_sanitizeByKey(key, value, limits.messageMaxChars);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (depth >= limits.detailMaxDepth) {
    return "[depth-limited]";
  }

  if (Array.isArray(value)) {
    const limitedItems = value.slice(0, limits.detailMaxItemsPerArray);
    const sanitizedItems = limitedItems.map((item) =>
      it_sanitizeDetailValue(item, limits, depth + 1),
    );
    if (value.length > limits.detailMaxItemsPerArray) {
      sanitizedItems.push(`[items-truncated count=${value.length - limits.detailMaxItemsPerArray}]`);
    }
    return sanitizedItems;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    const limitedEntries = entries.slice(0, limits.detailMaxKeysPerObject);
    const output: Record<string, unknown> = {};
    limitedEntries.forEach(([entryKey, entryValue]) => {
      output[entryKey] = it_sanitizeDetailValue(entryValue, limits, depth + 1, entryKey);
    });
    if (entries.length > limits.detailMaxKeysPerObject) {
      output._truncatedKeys = entries.length - limits.detailMaxKeysPerObject;
    }
    return output;
  }

  return String(value);
}

function it_normalizeDetail(
  detail: unknown,
  limits: ItLoggingGuardrails["limits"],
): unknown {
  if (detail === undefined) {
    return undefined;
  }

  const sanitized = it_sanitizeDetailValue(detail, limits, 0);
  try {
    const serialized = JSON.stringify(sanitized);
    if (!serialized) {
      return sanitized;
    }
    if (serialized.length <= limits.detailMaxChars) {
      return sanitized;
    }
    return {
      truncated: true,
      originalChars: serialized.length,
      preview: `${serialized.slice(0, limits.detailMaxChars)}...(detail-truncated)`,
    };
  } catch (error) {
    return {
      unserializable: true,
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

function it_shouldEmit(
  level: ItStructuredLogLevel,
  traceLogsEnabled: boolean,
  guardrails: ItLoggingGuardrails,
): boolean {
  if (traceLogsEnabled) {
    return true;
  }
  if (level === "error") {
    return guardrails.policy.emitErrorWhenTraceDisabled;
  }
  return false;
}

export function it_createStructuredLogger(options: ItStructuredLoggerOptions): ItStructuredLogger {
  const nowIso = options.nowIso ?? (() => new Date().toISOString());

  const emit = (input: ItStructuredLogInput): ItStructuredLogRecord | null => {
    if (!it_shouldEmit(input.level, options.traceLogsEnabled, options.guardrails)) {
      return null;
    }

    const record: ItStructuredLogRecord = {
      ts: input.ts ?? nowIso(),
      level: input.level,
      event: input.event || "unknown.event",
      layer: input.layer || "application",
      module: input.module || "unknown.module",
      runId: input.runId,
      requestId: input.requestId,
      stage: input.stage,
      status: input.status,
      errorCode: input.errorCode,
      message: it_truncateText(String(input.message || ""), options.guardrails.limits.messageMaxChars),
      detail: it_normalizeDetail(input.detail, options.guardrails.limits),
    };

    options.sink(JSON.stringify(record));
    return record;
  };

  const withLevel = (
    level: ItStructuredLogLevel,
    input: Omit<ItStructuredLogInput, "level">,
  ): ItStructuredLogRecord | null => {
    return emit({
      ...input,
      level,
    });
  };

  return {
    emit,
    debug: (input) => withLevel("debug", input),
    info: (input) => withLevel("info", input),
    warn: (input) => withLevel("warn", input),
    error: (input) => withLevel("error", input),
  };
}
