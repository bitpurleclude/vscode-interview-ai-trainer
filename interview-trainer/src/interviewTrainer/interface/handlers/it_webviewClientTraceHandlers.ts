import type { ItWebviewProtocolPort } from "./it_webviewHandlerPorts";

type ItClientTracePayload = {
  level?: "debug" | "info" | "warn" | "error";
  event?: string;
  status?: string;
  message?: string;
  module?: string;
  errorCode?: string;
  detail?: Record<string, unknown>;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function it_asString(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function it_parseClientTracePayload(raw: unknown): ItClientTracePayload {
  const source = it_asRecord(raw);
  const level = it_asString(source.level);
  const detail = source.detail;
  return {
    level:
      level === "debug" || level === "info" || level === "warn" || level === "error"
        ? level
        : "info",
    event: it_asString(source.event) || "webview.messenger.trace",
    status: it_asString(source.status) || "info",
    message: it_asString(source.message) || "webview client trace",
    module: it_asString(source.module) || "webview.messenger",
    errorCode: it_asString(source.errorCode),
    detail:
      detail && typeof detail === "object" && !Array.isArray(detail)
        ? (detail as Record<string, unknown>)
        : undefined,
  };
}

export function it_registerClientTraceHandlers(host: ItWebviewProtocolPort): void {
  host.webviewProtocol.on("it/clientTrace", (msg) => {
    const payload = it_parseClientTracePayload(msg.data);
    host.logCorpusTrace(payload.message || "webview client trace", {
      event: payload.event,
      status: payload.status,
      level: payload.level,
      module: payload.module,
      errorCode: payload.errorCode,
      detail: payload.detail,
    });
    return { received: true };
  });
}
