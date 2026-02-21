import { beforeEach, describe, expect, it, vi } from "vitest";

const useCaseMocks = vi.hoisted(() => ({
  setRetrievalEnabled: vi.fn(),
  updateRetrievalSettings: vi.fn(),
  clearEmbeddingCache: vi.fn(),
  clearCorpusCache: vi.fn(),
}));

vi.mock("../../application/useCases/it_retrievalActions", () => ({
  it_setRetrievalEnabledFromWebview: useCaseMocks.setRetrievalEnabled,
  it_updateRetrievalSettingsFromWebview: useCaseMocks.updateRetrievalSettings,
  it_clearEmbeddingCacheFromWebview: useCaseMocks.clearEmbeddingCache,
  it_clearCorpusCacheFromWebview: useCaseMocks.clearCorpusCache,
}));

import { it_registerRetrievalHandlers } from "./it_webviewRetrievalHandlers";

type FakeMessage = {
  messageType: string;
  data?: unknown;
};

class FakeProtocol {
  private handlers = new Map<string, (msg: FakeMessage) => Promise<unknown> | unknown>();
  public sent: Array<{ type: string; data: unknown; messageId?: string }> = [];

  on(messageType: string, handler: (msg: FakeMessage) => Promise<unknown> | unknown): void {
    this.handlers.set(messageType, handler);
  }

  send(type: string, data: unknown, messageId?: string): void {
    this.sent.push({ type, data, messageId });
  }

  async emit(messageType: string, data?: unknown): Promise<unknown> {
    const handler = this.handlers.get(messageType);
    if (!handler) {
      throw new Error(`missing handler for ${messageType}`);
    }
    return await handler({ messageType, data });
  }
}

function createHost(protocol: FakeProtocol) {
  return {
    webviewProtocol: protocol,
    context: { globalStorageUri: { fsPath: "/tmp/cache" } },
    configService: {} as any,
    configBundle: { marker: "bundle-initial" },
    configSnapshot: { marker: "snapshot-initial" },
    corpusDirty: false,
    refreshConfigSnapshot: vi.fn(async () => ({ marker: "snapshot-refreshed" })),
    requireWorkspaceRoot: vi.fn(() => "/workspace/root"),
    normalizeWorkspaceKey: vi.fn((root: string) => `key:${root}`),
    scheduleEmbeddingWarmup: vi.fn(),
    updateEmbeddingWarmup: vi.fn(),
    logCorpusTrace: vi.fn(),
  } as any;
}

describe("it_webviewRetrievalHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("handles setRetrievalEnabled and applies config + patch side effects", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-enabled" };
    const nextSnapshot = { marker: "snapshot-enabled" };

    useCaseMocks.setRetrievalEnabled.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ enabled: true });
      expect(context.requireWorkspaceRoot()).toBe("/workspace/root");
      expect(context.normalizeWorkspaceKey("/workspace/root")).toBe("key:/workspace/root");
      context.scheduleEmbeddingWarmup("retrieval-toggle", 10);
      context.updateEmbeddingWarmup({ status: "running" });
      context.logCorpusTrace("retrieval trace", { action: "set-enabled" });
      await context.refreshConfigSnapshot();
      return {
        configBundle: nextBundle,
        configSnapshot: nextSnapshot,
        patch: { corpusDirty: true },
        value: { enabled: true },
      };
    });

    it_registerRetrievalHandlers(host);
    const result = await protocol.emit("it/setRetrievalEnabled", {
      enabled: true,
    });

    expect(result).toEqual({ enabled: true });
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("retrieval-toggle", 10);
    expect(host.updateEmbeddingWarmup).toHaveBeenCalledWith({ status: "running" });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("retrieval trace", {
      action: "set-enabled",
    });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toBe(nextSnapshot);
    expect(host.corpusDirty).toBe(true);
    expect(protocol.sent).toContainEqual({
      type: "it/configUpdate",
      data: nextSnapshot,
      messageId: undefined,
    });
  });

  it("handles updateRetrievalSettings and updates config snapshot", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-settings" };
    const nextSnapshot = { marker: "snapshot-settings" };

    useCaseMocks.updateRetrievalSettings.mockResolvedValue({
      configBundle: nextBundle,
      configSnapshot: nextSnapshot,
      value: { ok: true },
    });

    it_registerRetrievalHandlers(host);
    const result = await protocol.emit("it/updateRetrievalSettings", {
      retrieval: { topK: 7 },
    });

    expect(result).toEqual({ ok: true });
    expect(useCaseMocks.updateRetrievalSettings).toHaveBeenCalledTimes(1);
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toBe(nextSnapshot);
    expect(protocol.sent).toContainEqual({
      type: "it/configUpdate",
      data: nextSnapshot,
      messageId: undefined,
    });
  });

  it("handles clearEmbeddingCache without sending configUpdate", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-embedding-cache-cleared" };

    useCaseMocks.clearEmbeddingCache.mockResolvedValue({
      configBundle: nextBundle,
      value: { cleared: true },
    });

    it_registerRetrievalHandlers(host);
    const result = await protocol.emit("it/clearEmbeddingCache");

    expect(result).toEqual({ cleared: true });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toEqual({ marker: "snapshot-initial" });
    expect(protocol.sent).toEqual([]);
  });

  it("handles clearCorpusCache and applies corpusDirty patch", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-corpus-cache-cleared" };

    useCaseMocks.clearCorpusCache.mockResolvedValue({
      configBundle: nextBundle,
      patch: { corpusDirty: true },
      value: { cleared: true },
    });

    it_registerRetrievalHandlers(host);
    const result = await protocol.emit("it/clearCorpusCache");

    expect(result).toEqual({ cleared: true });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.corpusDirty).toBe(true);
    expect(protocol.sent).toEqual([]);
  });
});

