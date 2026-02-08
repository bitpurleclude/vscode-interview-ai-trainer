import { describe, expect, it, vi } from "vitest";
import { it_registerClientTraceHandlers } from "./it_webviewClientTraceHandlers";

type FakeMessage = {
  messageType: string;
  data?: unknown;
};

class FakeProtocol {
  private handlers = new Map<string, (msg: FakeMessage) => unknown>();

  on(messageType: string, handler: (msg: FakeMessage) => unknown): void {
    this.handlers.set(messageType, handler);
  }

  async emit(messageType: string, data?: unknown): Promise<unknown> {
    const handler = this.handlers.get(messageType);
    if (!handler) {
      throw new Error(`missing handler for ${messageType}`);
    }
    return await handler({ messageType, data });
  }
}

describe("it_webviewClientTraceHandlers", () => {
  it("maps client trace payload to structured corpus trace detail", async () => {
    const protocol = new FakeProtocol();
    const host = {
      webviewProtocol: protocol,
      logCorpusTrace: vi.fn(),
    };

    it_registerClientTraceHandlers(host as any);

    const response = await protocol.emit("it/clientTrace", {
      level: "warn",
      event: "webview.messenger.request_timeout",
      status: "error",
      message: "webview request timeout",
      module: "webview.messenger",
      errorCode: "request_timeout",
      detail: {
        messageType: "it/analyze",
        timeoutMs: 1000,
      },
    });

    expect(response).toEqual({ received: true });
    expect(host.logCorpusTrace).toHaveBeenCalledWith(
      "webview request timeout",
      expect.objectContaining({
        event: "webview.messenger.request_timeout",
        status: "error",
        level: "warn",
        module: "webview.messenger",
        errorCode: "request_timeout",
      }),
    );
  });

  it("uses safe defaults when payload is malformed", async () => {
    const protocol = new FakeProtocol();
    const host = {
      webviewProtocol: protocol,
      logCorpusTrace: vi.fn(),
    };

    it_registerClientTraceHandlers(host as any);

    await protocol.emit("it/clientTrace", "broken payload");

    expect(host.logCorpusTrace).toHaveBeenCalledWith(
      "webview client trace",
      expect.objectContaining({
        event: "webview.messenger.trace",
        status: "info",
        level: "info",
        module: "webview.messenger",
      }),
    );
  });
});
