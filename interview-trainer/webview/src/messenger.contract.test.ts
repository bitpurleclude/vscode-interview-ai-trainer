import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessageHandler = (event: { data: unknown }) => void;

type MessengerHarness = {
  postMessage: ReturnType<typeof vi.fn>;
  dispatchMessage: (data: unknown) => void;
};

function installMessengerHarness(): MessengerHarness {
  const messageHandlers = new Set<MessageHandler>();
  const postMessage = vi.fn();

  (globalThis as any).window = {
    addEventListener: (type: string, handler: MessageHandler) => {
      if (type === "message") {
        messageHandlers.add(handler);
      }
    },
  };

  (globalThis as any).acquireVsCodeApi = () => ({
    postMessage,
  });

  return {
    postMessage,
    dispatchMessage: (data: unknown) => {
      messageHandlers.forEach((handler) => {
        handler({ data });
      });
    },
  };
}

describe("messenger contract", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (globalThis as any).window;
    delete (globalThis as any).acquireVsCodeApi;
  });

  it("matches request/response by messageId", async () => {
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");

    const pending = messenger.request("it/getState", { withDraft: true });

    expect(harness.postMessage).toHaveBeenCalledTimes(1);
    const sent = harness.postMessage.mock.calls[0][0];
    expect(sent.messageType).toBe("it/getState");
    expect(sent.data).toEqual({ withDraft: true });
    expect(typeof sent.messageId).toBe("string");

    harness.dispatchMessage({
      messageType: "it/getState",
      messageId: sent.messageId,
      data: { status: "success", content: { ok: true } },
    });

    await expect(pending).resolves.toEqual({ status: "success", content: { ok: true } });
  });

  it("returns timeout error envelope when backend does not respond", async () => {
    vi.useFakeTimers();
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");

    const pending = messenger.request("it/slow", undefined, { timeoutMs: 10 });
    expect(harness.postMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(12);
    await expect(pending).resolves.toMatchObject({
      status: "error",
    });
  });

  it("dispatches broadcast messages to listeners and supports dispose", async () => {
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");
    const listener = vi.fn();

    const dispose = messenger.on("it/stateUpdate", listener);

    harness.dispatchMessage({
      messageType: "it/stateUpdate",
      data: { statusMessage: "updated" },
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ statusMessage: "updated" });

    dispose();
    harness.dispatchMessage({
      messageType: "it/stateUpdate",
      data: { statusMessage: "after-dispose" },
    });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("keeps messageId responses isolated from broadcast listeners", async () => {
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");
    const listener = vi.fn();

    messenger.on("it/stepStreamUpdate", listener);
    const pending = messenger.request("it/stepStreamUpdate", { step: "evaluation" });
    const sent = harness.postMessage.mock.calls[0][0];

    harness.dispatchMessage({
      messageType: "it/stepStreamUpdate",
      messageId: sent.messageId,
      data: { status: "success", content: "ack" },
    });

    await expect(pending).resolves.toEqual({ status: "success", content: "ack" });
    expect(listener).not.toHaveBeenCalled();
  });
});
