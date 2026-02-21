import { beforeEach, describe, expect, it, vi } from "vitest";

const useCaseMocks = vi.hoisted(() => ({
  dryRun: vi.fn(),
  live: vi.fn(),
}));

vi.mock("../../application/useCases/it_templateTestActions", () => ({
  it_testTemplateDryRun: useCaseMocks.dryRun,
  it_testTemplateLive: useCaseMocks.live,
}));

import { it_registerTemplateTestHandlers } from "./it_webviewTemplateTestHandlers";

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
    configSnapshot: { marker: "snapshot" },
    logCorpusTrace: vi.fn(),
  } as any;
}

describe("it_webviewTemplateTestHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("runs dry-run test and forwards delta events to webview", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.dryRun.mockImplementation(async ({ context, payload }: any) => {
      expect(context.configService).toBe(host.configService);
      expect(context.configSnapshot).toBe(host.configSnapshot);
      expect(payload).toEqual({ templateId: "tpl-1" });
      context.emitTemplateTestDelta({
        runId: "run-1",
        delta: { stage: "start" },
      });
      context.logTrace("template dryrun", { ok: true });
      return { ok: true, mode: "dryrun" };
    });

    it_registerTemplateTestHandlers(host);
    const result = await protocol.emit("it/testTemplateDryRun", {
      templateId: "tpl-1",
    });

    expect(result).toEqual({ ok: true, mode: "dryrun" });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("template dryrun", { ok: true });
    expect(protocol.sent).toContainEqual({
      type: "it/templateTestDelta",
      data: {
        runId: "run-1",
        delta: { stage: "start" },
        full: undefined,
      },
      messageId: undefined,
    });
  });

  it("runs live test and forwards delta events to webview", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.live.mockImplementation(async ({ context, payload }: any) => {
      expect(context.configService).toBe(host.configService);
      expect(context.configSnapshot).toBe(host.configSnapshot);
      expect(payload).toEqual({ templateId: "tpl-2" });
      context.emitTemplateTestDelta({
        runId: "run-2",
        delta: { stage: "request" },
        full: { stage: "done" },
      });
      return { ok: true, mode: "live" };
    });

    it_registerTemplateTestHandlers(host);
    const result = await protocol.emit("it/testTemplateLive", {
      templateId: "tpl-2",
    });

    expect(result).toEqual({ ok: true, mode: "live" });
    expect(protocol.sent).toContainEqual({
      type: "it/templateTestDelta",
      data: {
        runId: "run-2",
        delta: { stage: "request" },
        full: { stage: "done" },
      },
      messageId: undefined,
    });
  });
});

