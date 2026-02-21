import { beforeEach, describe, expect, it, vi } from "vitest";

const useCaseMocks = vi.hoisted(() => ({
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  saveTemplateBindings: vi.fn(),
  saveTemplateParamOptions: vi.fn(),
  saveTemplateSecret: vi.fn(),
  deleteTemplateSecret: vi.fn(),
  refreshToken: vi.fn(),
  refreshAllTokens: vi.fn(),
  setTokenAutoRefresh: vi.fn(),
}));

vi.mock("../../application/useCases/it_templateActions", () => ({
  it_saveTemplateFromWebview: useCaseMocks.saveTemplate,
  it_deleteTemplateFromWebview: useCaseMocks.deleteTemplate,
  it_saveTemplateBindingsFromWebview: useCaseMocks.saveTemplateBindings,
  it_saveTemplateParamOptionsFromWebview: useCaseMocks.saveTemplateParamOptions,
  it_saveTemplateSecretFromWebview: useCaseMocks.saveTemplateSecret,
  it_deleteTemplateSecretFromWebview: useCaseMocks.deleteTemplateSecret,
  it_refreshTokenFromWebview: useCaseMocks.refreshToken,
  it_refreshAllTokensFromWebview: useCaseMocks.refreshAllTokens,
  it_setTokenAutoRefreshFromWebview: useCaseMocks.setTokenAutoRefresh,
}));

import { it_registerTemplateHandlers } from "./it_webviewTemplateHandlers";

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
    context: { extensionPath: "/tmp/ext" } as any,
    configService: {} as any,
    tokenService: {} as any,
    refreshConfigSnapshot: vi.fn(async () => ({ marker: "snapshot-refreshed" })),
    logCorpusTrace: vi.fn(),
    configBundle: { marker: "bundle-initial" },
    configSnapshot: { marker: "snapshot-initial" },
  } as any;
}

describe("it_webviewTemplateHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each([
    ["it/saveTemplate", "saveTemplate"],
    ["it/deleteTemplate", "deleteTemplate"],
    ["it/saveTemplateBindings", "saveTemplateBindings"],
    ["it/saveTemplateParamOptions", "saveTemplateParamOptions"],
    ["it/saveTemplateSecret", "saveTemplateSecret"],
    ["it/deleteTemplateSecret", "deleteTemplateSecret"],
    ["it/setTokenAutoRefresh", "setTokenAutoRefresh"],
  ] as const)(
    "runs config use-case and sends configUpdate for %s",
    async (messageType, mockKey) => {
      const protocol = new FakeProtocol();
      const host = createHost(protocol);
      const nextBundle = { marker: `${messageType}-bundle` };
      const nextSnapshot = { marker: `${messageType}-snapshot` };

      (useCaseMocks[mockKey] as any).mockImplementation(async ({ context, payload }: any) => {
        expect(context.tokenService).toBe(host.tokenService);
        expect(context.configService).toBe(host.configService);
        await context.refreshConfigSnapshot();
        context.logCorpusTrace("template trace", { messageType });
        expect(payload).toEqual({ id: "template-A" });
        return {
          configBundle: nextBundle,
          configSnapshot: nextSnapshot,
          value: { ok: true, messageType },
        };
      });

      it_registerTemplateHandlers(host);
      const result = await protocol.emit(messageType, { id: "template-A" });

      expect(result).toEqual({ ok: true, messageType });
      expect(host.refreshConfigSnapshot).toHaveBeenCalledTimes(1);
      expect(host.logCorpusTrace).toHaveBeenCalledWith("template trace", { messageType });
      expect(host.configBundle).toBe(nextBundle);
      expect(host.configSnapshot).toBe(nextSnapshot);
      expect(protocol.sent).toContainEqual({
        type: "it/configUpdate",
        data: nextSnapshot,
        messageId: undefined,
      });
    },
  );

  it("runs refreshToken without mutating config snapshot", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.refreshToken.mockImplementation(async ({ context, payload }: any) => {
      expect(context.tokenService).toBe(host.tokenService);
      context.logCorpusTrace("token refresh", { mode: "single" });
      expect(payload).toEqual({ id: "template-A" });
      return { refreshed: "template-A" };
    });

    it_registerTemplateHandlers(host);
    const result = await protocol.emit("it/refreshToken", { id: "template-A" });

    expect(result).toEqual({ refreshed: "template-A" });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("token refresh", { mode: "single" });
    expect(protocol.sent).toEqual([]);
    expect(host.configBundle).toEqual({ marker: "bundle-initial" });
    expect(host.configSnapshot).toEqual({ marker: "snapshot-initial" });
  });

  it("runs refreshAllTokens without mutating config snapshot", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.refreshAllTokens.mockImplementation(async ({ context }: any) => {
      expect(context.tokenService).toBe(host.tokenService);
      context.logCorpusTrace("token refresh", { mode: "all" });
      return { refreshed: "all" };
    });

    it_registerTemplateHandlers(host);
    const result = await protocol.emit("it/refreshAllTokens");

    expect(result).toEqual({ refreshed: "all" });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("token refresh", { mode: "all" });
    expect(protocol.sent).toEqual([]);
    expect(host.configBundle).toEqual({ marker: "bundle-initial" });
    expect(host.configSnapshot).toEqual({ marker: "snapshot-initial" });
  });
});

