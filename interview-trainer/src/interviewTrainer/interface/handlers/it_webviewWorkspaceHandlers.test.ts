import { beforeEach, describe, expect, it, vi } from "vitest";

const vscodeMocks = vi.hoisted(() => ({
  showOpenDialog: vi.fn(),
  showWarningMessage: vi.fn(),
}));

const useCaseMocks = vi.hoisted(() => ({
  selectWorkspaceDir: vi.fn(),
  selectSessionsDir: vi.fn(),
}));

vi.mock("vscode", () => ({
  window: {
    showOpenDialog: vscodeMocks.showOpenDialog,
    showWarningMessage: vscodeMocks.showWarningMessage,
  },
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
}));

vi.mock("../../application/useCases/it_workspaceActions", () => ({
  it_selectWorkspaceDirFromWebview: useCaseMocks.selectWorkspaceDir,
  it_selectSessionsDirFromWebview: useCaseMocks.selectSessionsDir,
}));

import { it_registerWorkspaceHandlers } from "./it_webviewWorkspaceHandlers";

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
    configService: {} as any,
    refreshConfigSnapshot: vi.fn(async () => ({ marker: "snapshot-refreshed" })),
    requireWorkspaceRoot: vi.fn(() => "/workspace/root"),
    logCorpusTrace: vi.fn(),
    configBundle: { marker: "bundle-initial" },
    configSnapshot: { marker: "snapshot-initial" },
  } as any;
}

describe("it_webviewWorkspaceHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vscodeMocks.showOpenDialog.mockResolvedValue([{ fsPath: "/workspace/chosen" }]);
  });

  it("handles selectWorkspaceDir and sends configUpdate when snapshot exists", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-workspace" };
    const nextSnapshot = { marker: "snapshot-workspace" };

    useCaseMocks.selectWorkspaceDir.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ requestId: "workspace-1" });
      expect(context.requireWorkspaceRoot()).toBe("/workspace/root");
      const selected = await context.selectDirectory({
        openLabel: "Select workspace",
        defaultPath: "/workspace/root",
      });
      expect(selected).toBe("/workspace/chosen");
      context.showWarning("warning message");
      context.logCorpusTrace("workspace selected", { selected });
      await context.refreshConfigSnapshot();
      return {
        configBundle: nextBundle,
        configSnapshot: nextSnapshot,
        value: { selected },
      };
    });

    it_registerWorkspaceHandlers(host);
    const result = await protocol.emit("it/selectWorkspaceDir", {
      requestId: "workspace-1",
    });

    expect(result).toEqual({ selected: "/workspace/chosen" });
    expect(vscodeMocks.showOpenDialog).toHaveBeenCalledWith({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Select workspace",
      defaultUri: { fsPath: "/workspace/root" },
    });
    expect(vscodeMocks.showWarningMessage).toHaveBeenCalledWith("warning message");
    expect(host.logCorpusTrace).toHaveBeenCalledWith("workspace selected", {
      selected: "/workspace/chosen",
    });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toBe(nextSnapshot);
    expect(protocol.sent).toContainEqual({
      type: "it/configUpdate",
      data: nextSnapshot,
      messageId: undefined,
    });
  });

  it("handles selectSessionsDir without sending configUpdate when snapshot missing", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);
    const nextBundle = { marker: "bundle-sessions" };

    useCaseMocks.selectSessionsDir.mockResolvedValue({
      configBundle: nextBundle,
      value: { selected: "/workspace/sessions" },
    });

    it_registerWorkspaceHandlers(host);
    const result = await protocol.emit("it/selectSessionsDir");

    expect(result).toEqual({ selected: "/workspace/sessions" });
    expect(host.configBundle).toBe(nextBundle);
    expect(host.configSnapshot).toEqual({ marker: "snapshot-initial" });
    expect(protocol.sent).toEqual([]);
  });
});

