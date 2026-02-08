import { describe, expect, it, vi } from "vitest";
import { WebviewProtocol } from "./WebviewProtocol";

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

describe("WebviewProtocol security", () => {
  it("survives unknown-message flood and still serves valid requests", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    protocol.webview = webview as any;

    protocol.on("it/known", async () => ({ ok: true }));

    for (let i = 0; i < 500; i += 1) {
      await webview.emit({ messageType: `it/unknown-${i}` });
    }

    await webview.emit({
      messageType: "it/known",
      messageId: "msg-1",
      data: { payload: 1 },
    });

    expect(webview.posted).toHaveLength(1);
    expect(webview.posted[0]).toMatchObject({
      messageType: "it/known",
      messageId: "msg-1",
      data: {
        status: "success",
        content: { ok: true },
      },
    });
  });

  it("returns handler_not_found for unknown request with messageId", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    protocol.webview = webview as any;

    await webview.emit({
      messageType: "it/not-registered",
      messageId: "msg-404",
      data: { payload: true },
    });

    expect(webview.posted).toHaveLength(1);
    expect(webview.posted[0]).toMatchObject({
      messageType: "it/not-registered",
      messageId: "msg-404",
      data: {
        status: "error",
        errorCode: "handler_not_found",
      },
    });
  });

  it("isolates broadcast handler failures", async () => {
    const protocol = new WebviewProtocol();
    const webview = new FakeWebview();
    protocol.webview = webview as any;

    const observed: string[] = [];
    protocol.on("it/broadcast", async () => {
      throw new Error("boom");
    });
    protocol.on("it/broadcast", async () => {
      observed.push("second");
    });

    await expect(
      webview.emit({
        messageType: "it/broadcast",
        data: { flood: true },
      }),
    ).resolves.toBeUndefined();

    expect(observed).toEqual(["second"]);
    expect(webview.posted).toHaveLength(0);
  });
});
