type Listener = (data: any) => void;

const vscode = acquireVsCodeApi();
let counter = 0;
const pending = new Map<string, (data: any) => void>();
const listeners = new Map<string, Set<Listener>>();

window.addEventListener("message", (event) => {
  const msg = event.data;
  if (!msg || !msg.messageType) {
    return;
  }
  if (msg.messageId && pending.has(msg.messageId)) {
    const resolver = pending.get(msg.messageId);
    pending.delete(msg.messageId);
    resolver?.(msg.data);
    return;
  }
  const handlers = listeners.get(msg.messageType);
  handlers?.forEach((handler) => handler(msg.data));
});

export function request(messageType: string, data?: any): Promise<any> {
  const messageId = String(++counter);
  vscode.postMessage({ messageType, messageId, data });
  return new Promise((resolve) => {
    pending.set(messageId, resolve);
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
