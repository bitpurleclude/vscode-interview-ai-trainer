import { describe, expect, it, vi } from "vitest";
import {
  WebviewProtocol,
  type WebviewProtocolEvent,
} from "./WebviewProtocol";

class FakeWebview {
  private listener: ((msg: any) => Promise<void> | void) | null = null;
  public posted: any[] = [];

  onDidReceiveMessage(listener: (msg: any) => Promise<void> | void) {
    this.listener = listener;
    return {
      dispose: vi.fn(),
    };
  }

  async emit(msg: any): Promise<void> {
    if (!this.listener) {
      throw new Error("listener not registered");
    }
    await this.listener(msg);
  }

  postMessage(message: any): Promise<boolean> {
    this.posted.push(message);
    return Promise.resolve(true);
  }
}

describe("WebviewProtocol observer events", () => {
  it("emits request_no_handler for unknown request", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    const events: WebviewProtocolEvent[] = [];

    protocol.setObserver((event) => {
      events.push(event);
    });
    protocol.webview = webview as any;

    await webview.emit({
      messageType: "it/missing",
      messageId: "req-1",
      data: {},
    });

    expect(events).toContainEqual({
      type: "request_no_handler",
      messageType: "it/missing",
      messageId: "req-1",
    });
  });

  it("emits request_error and broadcast_handler_error when handlers throw", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    const events: WebviewProtocolEvent[] = [];

    protocol.setObserver((event) => {
      events.push(event);
    });
    protocol.webview = webview as any;

    protocol.on("it/requestFail", async () => {
      throw new Error("request boom");
    });
    protocol.on("it/broadcastFail", async () => {
      throw new Error("broadcast boom");
    });

    await webview.emit({
      messageType: "it/requestFail",
      messageId: "req-2",
      data: {},
    });
    await webview.emit({
      messageType: "it/broadcastFail",
      data: {},
    });

    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "request_error",
          messageType: "it/requestFail",
          messageId: "req-2",
        }),
        expect.objectContaining({
          type: "broadcast_handler_error",
          messageType: "it/broadcastFail",
          handlerIndex: 0,
        }),
      ]),
    );
  });
});
