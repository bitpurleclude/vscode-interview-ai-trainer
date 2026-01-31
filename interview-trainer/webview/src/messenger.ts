type Listener = (data: any) => void;
type PendingEntry = {
  resolve: (data: any) => void;
  timer?: ReturnType<typeof setTimeout>;
};

const vscode = acquireVsCodeApi();
let counter = 0;
const pending = new Map<string, PendingEntry>();
const listeners = new Map<string, Set<Listener>>();
const DEFAULT_TIMEOUT_MS = 60_000;

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || !msg.messageType) {
    return;
  }
  if (msg.messageId) {
    const entry = pending.get(msg.messageId);
    if (!entry) {
      return;
    }
    pending.delete(msg.messageId);
    if (entry.timer) {
      clearTimeout(entry.timer);
    }
    entry.resolve(msg.data);
    return;
  }
  const handlers = listeners.get(msg.messageType);
  handlers?.forEach((handler) => handler(msg.data));
});

export function request(
  messageType: string,
  data?: any,
  options?: { timeoutMs?: number },
): Promise<any> {
  const messageId = String(++counter);
  vscode.postMessage({ messageType, messageId, data });
  return new Promise((resolve) => {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (timeoutMs > 0) {
      timer = setTimeout(() => {
        if (!pending.has(messageId)) {
          return;
        }
        pending.delete(messageId);
        resolve({
          status: "error",
          error: `请求超时（${messageType}，${timeoutMs}ms）`,
        });
      }, timeoutMs);
    }
    pending.set(messageId, { resolve, timer });
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
