import * as vscode from "vscode";

export interface WebviewMessage {
  messageType: string;
  messageId?: string;
  data?: any;
}

type Handler = (message: WebviewMessage) => Promise<any> | any;

export class WebviewProtocol {
  private handlers = new Map<string, Handler[]>();
  private _webview?: vscode.Webview;
  private _listener?: vscode.Disposable;

  get webview(): vscode.Webview | undefined {
    return this._webview;
  }

  set webview(webview: vscode.Webview) {
    this._webview = webview;
    this._listener?.dispose();
    this._listener = webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      if (!msg || !msg.messageType) {
        return;
      }
      const handlers = this.handlers.get(msg.messageType) ?? [];
      if (!handlers.length) {
        return;
      }
      if (msg.messageId) {
        const handler = handlers[0];
        try {
          const result = await handler(msg);
          this.send(
            msg.messageType,
            {
              status: "success",
              content: result,
            },
            msg.messageId,
          );
        } catch (error) {
          this.send(
            msg.messageType,
            {
              status: "error",
              error: error instanceof Error ? error.message : String(error),
            },
            msg.messageId,
          );
        }
        return;
      }
      for (const handler of handlers) {
        try {
          await handler(msg);
        } catch {
          // ignore broadcast handler errors
        }
      }
    });
  }

  on(messageType: string, handler: Handler): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, []);
    }
    this.handlers.get(messageType)?.push(handler);
  }

  send(messageType: string, data: any, messageId?: string): void {
    this._webview?.postMessage({ messageType, messageId, data });
  }
}
