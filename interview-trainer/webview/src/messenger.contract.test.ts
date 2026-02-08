import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type MessageHandler = (event: { data: unknown }) => void;

type MessengerHarness = {
  postMessage: ReturnType<typeof vi.fn>;
  dispatchMessage: (data: unknown) => void;
};

type PostedMessage = {
  messageType?: string;
  messageId?: string;
  data?: unknown;
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

function getPostedMessages(harness: MessengerHarness): PostedMessage[] {
  return harness.postMessage.mock.calls.map((args) => args[0] as PostedMessage);
}

function getBusinessPosts(harness: MessengerHarness): PostedMessage[] {
  return getPostedMessages(harness).filter(
    (item) => item.messageType && item.messageType !== "it/clientTrace",
  );
}

function getTracePosts(harness: MessengerHarness): PostedMessage[] {
  return getPostedMessages(harness).filter((item) => item.messageType === "it/clientTrace");
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

    const businessPosts = getBusinessPosts(harness);
    expect(businessPosts).toHaveLength(1);
    const sent = businessPosts[0];
    expect(sent.messageType).toBe("it/getState");
    expect(sent.data).toEqual({ withDraft: true });
    expect(typeof sent.messageId).toBe("string");

    harness.dispatchMessage({
      messageType: "it/getState",
      messageId: sent.messageId,
      data: { status: "success", content: { ok: true } },
    });

    await expect(pending).resolves.toEqual({ status: "success", content: { ok: true } });

    const traceEvents = getTracePosts(harness).map(
      (item) => (item.data as { event?: string })?.event,
    );
    expect(traceEvents).toContain("webview.messenger.request_sent");
    expect(traceEvents).toContain("webview.messenger.response_received");
  });

  it("returns timeout error envelope when backend does not respond", async () => {
    vi.useFakeTimers();
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");

    const pending = messenger.request("it/slow", undefined, { timeoutMs: 10 });
    expect(getBusinessPosts(harness)).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(12);
    await expect(pending).resolves.toMatchObject({
      status: "error",
    });

    const traceEvents = getTracePosts(harness).map(
      (item) => (item.data as { event?: string })?.event,
    );
    expect(traceEvents).toContain("webview.messenger.request_timeout");
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
    const sent = getBusinessPosts(harness)[0];

    harness.dispatchMessage({
      messageType: "it/stepStreamUpdate",
      messageId: sent.messageId,
      data: { status: "success", content: "ack" },
    });

    await expect(pending).resolves.toEqual({ status: "success", content: "ack" });
    expect(listener).not.toHaveBeenCalled();
  });

  it("records orphan response trace for unknown messageId", async () => {
    const harness = installMessengerHarness();
    await import("./messenger");

    harness.dispatchMessage({
      messageType: "it/getState",
      messageId: "unknown-id",
      data: { status: "success" },
    });

    const traceEvents = getTracePosts(harness).map(
      (item) => (item.data as { event?: string })?.event,
    );
    expect(traceEvents).toContain("webview.messenger.orphan_response");
  });

  it("keeps dispatching when one listener throws and reports listener_error", async () => {
    const harness = installMessengerHarness();
    const messenger = await import("./messenger");
    const failed = vi.fn(() => {
      throw new Error("boom");
    });
    const ok = vi.fn();

    messenger.on("it/stateUpdate", failed);
    messenger.on("it/stateUpdate", ok);

    harness.dispatchMessage({
      messageType: "it/stateUpdate",
      data: { statusMessage: "updated" },
    });

    expect(failed).toHaveBeenCalledTimes(1);
    expect(ok).toHaveBeenCalledTimes(1);
    const traceEvents = getTracePosts(harness).map(
      (item) => (item.data as { event?: string })?.event,
    );
    expect(traceEvents).toContain("webview.messenger.listener_error");
  });
});
