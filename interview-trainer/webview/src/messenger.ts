type Listener = (data: any) => void;
type PendingEntry = {
  resolve: (data: any) => void;
  timer?: ReturnType<typeof setTimeout>;
};

type ItClientTraceLevel = "debug" | "info" | "warn" | "error";
type ItClientTracePayload = {
  level: ItClientTraceLevel;
  event: string;
  status: string;
  message: string;
  errorCode?: string;
  detail?: Record<string, unknown>;
};

const vscode = acquireVsCodeApi();
let counter = 0;
const pending = new Map<string, PendingEntry>();
const listeners = new Map<string, Set<Listener>>();
const DEFAULT_TIMEOUT_MS = 60_000;
const CLIENT_TRACE_MESSAGE_TYPE = "it/clientTrace";

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_extractStatus(data: unknown): string {
  if (data && typeof data === "object") {
    const status = (data as { status?: unknown }).status;
    if (typeof status === "string" && status.trim()) {
      return status.trim();
    }
  }
  return "unknown";
}

function it_emitClientTrace(payload: ItClientTracePayload): void {
  try {
    vscode.postMessage({
      messageType: CLIENT_TRACE_MESSAGE_TYPE,
      data: payload,
    });
  } catch {
    // ignore trace dispatch failures to keep request flow stable
  }
}

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || !msg.messageType) {
    it_emitClientTrace({
      level: "warn",
      event: "webview.messenger.invalid_message",
      status: "error",
      message: "webview message missing messageType",
      errorCode: "invalid_message",
      detail: {
        rawKind: msg === null ? "null" : Array.isArray(msg) ? "array" : typeof msg,
      },
    });
    return;
  }

  if (msg.messageId) {
    const entry = pending.get(msg.messageId);
    if (!entry) {
      it_emitClientTrace({
        level: "warn",
        event: "webview.messenger.orphan_response",
        status: "error",
        message: "webview response has no pending request",
        errorCode: "orphan_response",
        detail: {
          messageType: String(msg.messageType || ""),
          messageId: String(msg.messageId || ""),
          pendingCount: pending.size,
        },
      });
      return;
    }

    pending.delete(msg.messageId);
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    it_emitClientTrace({
      level: "info",
      event: "webview.messenger.response_received",
      status: it_extractStatus(msg.data),
      message: "webview response received",
      detail: {
        messageType: String(msg.messageType || ""),
        messageId: String(msg.messageId || ""),
        pendingCount: pending.size,
      },
    });
    entry.resolve(msg.data);
    return;
  }

  const handlers = listeners.get(msg.messageType);
  if (!handlers || handlers.size === 0) {
    it_emitClientTrace({
      level: "debug",
      event: "webview.messenger.broadcast_no_listener",
      status: "ignored",
      message: "webview broadcast has no listeners",
      detail: {
        messageType: String(msg.messageType || ""),
      },
    });
    return;
  }

  handlers.forEach((handler) => {
    try {
      handler(msg.data);
    } catch (error) {
      it_emitClientTrace({
        level: "error",
        event: "webview.messenger.listener_error",
        status: "error",
        message: "webview broadcast listener threw",
        errorCode: "listener_error",
        detail: {
          messageType: String(msg.messageType || ""),
          error: it_errorMessage(error),
        },
      });
    }
  });
});

export function request(
  messageType: string,
  data?: any,
  options?: { timeoutMs?: number },
): Promise<any> {
  const messageId = String(++counter);
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolve) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!pending.has(messageId)) {
          return;
        }
        pending.delete(messageId);
        it_emitClientTrace({
          level: "warn",
          event: "webview.messenger.request_timeout",
          status: "error",
          message: "webview request timed out",
          errorCode: "request_timeout",
          detail: {
            messageType,
            messageId,
            timeoutMs,
            pendingCount: pending.size,
          },
        });
        resolve({
          status: "error",
          error: `请求超时（${messageType}，${timeoutMs}ms）`,
        });
      }, timeoutMs);
    }

    pending.set(messageId, { resolve, timer });
    try {
      vscode.postMessage({ messageType, messageId, data });
      if (messageType !== CLIENT_TRACE_MESSAGE_TYPE) {
        it_emitClientTrace({
          level: "info",
          event: "webview.messenger.request_sent",
          status: "request",
          message: "webview request sent",
          detail: {
            messageType,
            messageId,
            timeoutMs,
            pendingCount: pending.size,
          },
        });
      }
    } catch (error) {
      if (timer) {
        clearTimeout(timer);
      }
      pending.delete(messageId);
      it_emitClientTrace({
        level: "error",
        event: "webview.messenger.request_send_error",
        status: "error",
        message: "webview request send failed",
        errorCode: "request_send_error",
        detail: {
          messageType,
          messageId,
          error: it_errorMessage(error),
        },
      });
      resolve({
        status: "error",
        error: `请求发送失败（${messageType}）`,
      });
    }
  });
}

export function on(messageType: string, handler: Listener): () => void {
  if (!listeners.has(messageType)) {
    listeners.set(messageType, new Set());
  }
  listeners.get(messageType)?.add(handler);
  return () => {
    listeners.get(messageType)?.delete(handler);
  };
}
