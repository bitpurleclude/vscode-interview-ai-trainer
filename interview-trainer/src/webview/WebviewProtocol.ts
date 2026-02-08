import * as vscode from "vscode";

export interface WebviewMessage {
  messageType: string;
  messageId?: string;
  data?: any;
}

type Handler = (message: WebviewMessage) => Promise<any> | any;

type WebviewProtocolObserver = (event: WebviewProtocolEvent) => void;

export type WebviewProtocolEvent =
  | {
      type: "invalid_message";
      rawKind: string;
      hasMessageId: boolean;
    }
  | {
      type: "request_no_handler";
      messageType: string;
      messageId: string;
    }
  | {
      type: "broadcast_no_handler";
      messageType: string;
    }
  | {
      type: "request_success";
      messageType: string;
      messageId: string;
    }
  | {
      type: "request_error";
      messageType: string;
      messageId: string;
      error: string;
    }
  | {
      type: "broadcast_handler_error";
      messageType: string;
      handlerIndex: number;
      error: string;
    }
  | {
      type: "handler_registered";
      messageType: string;
      handlerCount: number;
    }
  | {
      type: "send_without_webview";
      messageType: string;
      messageId?: string;
    }
  | {
      type: "send_error";
      messageType: string;
      messageId?: string;
      error: string;
    };

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_rawKind(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

export class WebviewProtocol {
  private handlers = new Map<string, Handler[]>();
  private _webview?: vscode.Webview;
  private _listener?: vscode.Disposable;
  private observer?: WebviewProtocolObserver;

  get webview(): vscode.Webview | undefined {
    return this._webview;
  }

  set webview(webview: vscode.Webview) {
    this._webview = webview;
    this._listener?.dispose();
    this._listener = webview.onDidReceiveMessage(async (msg: WebviewMessage) => {
      if (!msg || !msg.messageType) {
        this.emitEvent({
          type: "invalid_message",
          rawKind: it_rawKind(msg),
          hasMessageId: Boolean((msg as { messageId?: unknown } | undefined)?.messageId),
        });
        return;
      }
      const handlers = this.handlers.get(msg.messageType) ?? [];
      if (!handlers.length) {
        if (msg.messageId) {
          this.emitEvent({
            type: "request_no_handler",
            messageType: msg.messageType,
            messageId: msg.messageId,
          });
          this.send(
            msg.messageType,
            {
              status: "error",
              errorCode: "handler_not_found",
              error: `No handler for message type: ${msg.messageType}`,
            },
            msg.messageId,
          );
          return;
        }
        this.emitEvent({
          type: "broadcast_no_handler",
          messageType: msg.messageType,
        });
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
          this.emitEvent({
            type: "request_success",
            messageType: msg.messageType,
            messageId: msg.messageId,
          });
        } catch (error) {
          const errorMessage = it_errorMessage(error);
          this.send(
            msg.messageType,
            {
              status: "error",
              errorCode: "handler_error",
              error: errorMessage,
            },
            msg.messageId,
          );
          this.emitEvent({
            type: "request_error",
            messageType: msg.messageType,
            messageId: msg.messageId,
            error: errorMessage,
          });
        }
        return;
      }
      for (let index = 0; index < handlers.length; index += 1) {
        const handler = handlers[index];
        try {
          await handler(msg);
        } catch (error) {
          this.emitEvent({
            type: "broadcast_handler_error",
            messageType: msg.messageType,
            handlerIndex: index,
            error: it_errorMessage(error),
          });
        }
      }
    });
  }

  on(messageType: string, handler: Handler): void {
    if (!this.handlers.has(messageType)) {
      this.handlers.set(messageType, []);
    }
    const list = this.handlers.get(messageType);
    list?.push(handler);
    this.emitEvent({
      type: "handler_registered",
      messageType,
      handlerCount: list?.length || 0,
    });
  }

  setObserver(observer?: WebviewProtocolObserver): void {
    this.observer = observer;
  }

  send(messageType: string, data: any, messageId?: string): void {
    if (!this._webview) {
      this.emitEvent({
        type: "send_without_webview",
        messageType,
        messageId,
      });
      return;
    }
    void this._webview
      .postMessage({ messageType, messageId, data })
      .then(undefined, (error: unknown) => {
        this.emitEvent({
          type: "send_error",
          messageType,
          messageId,
          error: it_errorMessage(error),
        });
      });
  }

  private emitEvent(event: WebviewProtocolEvent): void {
    if (!this.observer) {
      return;
    }
    try {
      this.observer(event);
    } catch {
      // ignore observer errors to keep protocol path safe
    }
  }
}
