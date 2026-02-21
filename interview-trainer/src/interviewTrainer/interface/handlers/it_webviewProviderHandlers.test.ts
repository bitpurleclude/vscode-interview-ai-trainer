import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMocks = vi.hoisted(() => ({
  executeCommand: vi.fn(),
}));

const useCaseMocks = vi.hoisted(() => ({
  createProviderConfig: vi.fn(),
  saveProviderConfig: vi.fn(),
  openProviderConfig: vi.fn(),
}));

vi.mock("vscode", () => ({
  commands: {
    executeCommand: vscodeMocks.executeCommand,
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

vi.mock("../../application/useCases/it_providerActions", () => ({
  it_createProviderConfigFromWebview: useCaseMocks.createProviderConfig,
  it_saveProviderConfigFromWebview: useCaseMocks.saveProviderConfig,
  it_openProviderConfigFromWebview: useCaseMocks.openProviderConfig,
}));

import { it_registerProviderHandlers } from "./it_webviewProviderHandlers";

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
    context: {} as any,
    configService: {} as any,
    logCorpusTrace: vi.fn(),
    buildConfigSnapshot: vi.fn((apiConfig: any) => ({ apiConfig, marker: "snapshot" })),
    configBundle: { marker: "bundle-initial" },
    configSnapshot: { marker: "snapshot-initial" },
  } as any;
}

describe("it_webviewProviderHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("updates host config and sends configUpdate for createProviderConfig", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-created" };
    const nextSnapshot = { marker: "snapshot-created" };

    useCaseMocks.createProviderConfig.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ providerId: "demo-provider" });
      expect(context.buildConfigSnapshot({ from: "test" })).toEqual({
        apiConfig: { from: "test" },
        marker: "snapshot",
      });
      await context.openFile("/tmp/providers/demo-provider.yaml");
      context.logCorpusTrace("provider create", { status: "ok" });
      return {
        configBundle: nextBundle,
        configSnapshot: nextSnapshot,
        value: { ok: true },
      };
    });

    it_registerProviderHandlers(host);
    const result = await protocol.emit("it/createProviderConfig", {
      providerId: "demo-provider",
    });

    expect(result).toEqual({ ok: true });
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith("vscode.open", {
      fsPath: "/tmp/providers/demo-provider.yaml",
    });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("provider create", { status: "ok" });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toBe(nextSnapshot);
    expect(protocol.sent).toContainEqual({
      type: "it/configUpdate",
      data: nextSnapshot,
      messageId: undefined,
    });
  });

  it("updates host config and sends configUpdate for saveProviderConfig", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-saved" };
    const nextSnapshot = { marker: "snapshot-saved" };

    useCaseMocks.saveProviderConfig.mockResolvedValue({
      configBundle: nextBundle,
      configSnapshot: nextSnapshot,
      value: { saved: true },
    });

    it_registerProviderHandlers(host);
    const result = await protocol.emit("it/saveProviderConfig", {
      providerId: "demo-provider",
      profile: { llm: { model: "gpt-4o-mini" } },
    });

    expect(result).toEqual({ saved: true });
    expect(useCaseMocks.saveProviderConfig).toHaveBeenCalledTimes(1);
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toBe(nextSnapshot);
    expect(protocol.sent).toContainEqual({
      type: "it/configUpdate",
      data: nextSnapshot,
      messageId: undefined,
    });
  });

  it("forwards openProviderConfig without mutating host config", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.openProviderConfig.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ providerId: "demo-provider" });
      await context.openFile("/tmp/providers/demo-provider.yaml");
      return { opened: true };
    });

    it_registerProviderHandlers(host);
    const result = await protocol.emit("it/openProviderConfig", {
      providerId: "demo-provider",
    });

    expect(result).toEqual({ opened: true });
    expect(vscodeMocks.executeCommand).toHaveBeenCalledWith("vscode.open", {
      fsPath: "/tmp/providers/demo-provider.yaml",
    });
    expect(protocol.sent).toEqual([]);
    expect(host.configBundle).toEqual({ marker: "bundle-initial" });
    expect(host.configSnapshot).toEqual({ marker: "snapshot-initial" });
  });
});

