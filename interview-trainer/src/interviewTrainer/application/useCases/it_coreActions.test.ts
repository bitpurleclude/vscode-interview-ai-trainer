import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  ensureConfigFiles: vi.fn(),
  listHistoryItems: vi.fn(),
}));

vi.mock("../services/it_configGateway", () => ({
  it_ensureConfigFiles: mocks.ensureConfigFiles,
}));

vi.mock("../services/it_storageGateway", () => ({
  it_listHistoryItems: mocks.listHistoryItems,
}));

import {
  it_enableTraceLogsFromWebview,
  it_getConfigFromWebview,
  it_getStateFromWebview,
  it_listHistoryFromWebview,
  it_openMicSettingsFromWebview,
  it_openSettingsFromWebview,
  it_reloadWindowFromWebview,
} from "./it_coreActions";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    extensionContext: {
      globalStorageUri: { fsPath: "C:\\global-storage" },
    } as any,
    state: { statusMessage: "ready" } as any,
    configService: {
      loadBundle: vi.fn(() => ({
        skill: {
          sessions_dir: "sessions",
          filenames: {
            allow_unicode: true,
            max_slug_len: 16,
          },
          topics: {
            center_subdir: "center",
          },
        },
      })),
    } as any,
    refreshConfigSnapshot: vi.fn(async () => ({
      retrieval: { mode: "hybrid" },
      streaming: { enabled: true },
    })),
    scheduleEmbeddingWarmup: vi.fn(),
    requireWorkspaceRoot: vi.fn(() => "D:\\workspace"),
    setTraceLogsEnabled: vi.fn(),
    showOutput: vi.fn(),
    logTrace: vi.fn(),
    platform: "win32" as NodeJS.Platform,
    openFile: vi.fn(async () => undefined),
    openExternal: vi.fn(async () => undefined),
    showInfo: vi.fn(),
    reloadWindow: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("it_coreActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listHistoryItems.mockResolvedValue([{ id: "h1" }]);
  });

  it("returns current state directly and emits trace", () => {
    const context = createContext();
    const result = it_getStateFromWebview({ context: context as any });

    expect(result.value).toEqual(context.state);
    expect(context.logTrace).toHaveBeenCalledWith(
      "core get_state success",
      expect.objectContaining({
        event: "application.core.get_state",
        status: "success",
      }),
    );
  });

  it("loads config snapshot, schedules warmup, and returns bundle + snapshot", async () => {
    const context = createContext();
    const result = await it_getConfigFromWebview({ context: context as any });

    expect(context.refreshConfigSnapshot).toHaveBeenCalledTimes(1);
    expect(context.configService.loadBundle).toHaveBeenCalledTimes(1);
    expect(context.scheduleEmbeddingWarmup).toHaveBeenCalledWith("config");
    expect(result.value).toMatchObject({
      retrieval: { mode: "hybrid" },
    });
    expect(result.configBundle).toBeTruthy();
    expect(
      (context.logTrace as any).mock.calls.some(
        (call: any[]) => call[0] === "core get_config success",
      ),
    ).toBe(true);
  });

  it("enables trace logging and opens output", () => {
    const context = createContext();
    const result = it_enableTraceLogsFromWebview({ context: context as any });

    expect(context.setTraceLogsEnabled).toHaveBeenCalledWith(true);
    expect(context.showOutput).toHaveBeenCalledTimes(1);
    expect(result.value).toEqual({ enabled: true });
  });

  it("lists history with workspace-derived sessions root and payload filters", async () => {
    const context = createContext();
    const result = await it_listHistoryFromWebview({
      context: context as any,
      payload: { query: "java", limit: 10 },
    });

    expect(mocks.listHistoryItems).toHaveBeenCalledWith(
      "D:\\workspace\\sessions",
      "java",
      10,
      expect.objectContaining({
        allowUnicode: true,
        maxSlugLen: 16,
        centerSubdir: "center",
      }),
    );
    expect(result.value).toEqual([{ id: "h1" }]);
  });

  it("opens settings file under global storage and traces success", async () => {
    const context = createContext();
    const result = await it_openSettingsFromWebview({ context: context as any });

    expect(mocks.ensureConfigFiles).toHaveBeenCalledWith(context.extensionContext);
    expect(context.openFile).toHaveBeenCalledWith(
      "C:\\global-storage\\interview_trainer\\templates.yaml",
    );
    expect(result.value).toEqual({
      opened: true,
      path: "C:\\global-storage\\interview_trainer\\templates.yaml",
    });
  });

  it("opens mic settings URI on win32/darwin and returns manual mode on linux", async () => {
    const winContext = createContext({ platform: "win32" as NodeJS.Platform });
    await expect(it_openMicSettingsFromWebview({ context: winContext as any })).resolves.toMatchObject({
      value: { opened: true, target: "ms-settings:privacy-microphone" },
    });

    const macContext = createContext({ platform: "darwin" as NodeJS.Platform });
    await expect(it_openMicSettingsFromWebview({ context: macContext as any })).resolves.toMatchObject({
      value: {
        opened: true,
        target: "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
      },
    });

    const linuxContext = createContext({ platform: "linux" as NodeJS.Platform });
    await expect(
      it_openMicSettingsFromWebview({ context: linuxContext as any }),
    ).resolves.toEqual({ value: { opened: false } });
    expect(linuxContext.showInfo).toHaveBeenCalledTimes(1);
  });

  it("reloads window and returns reloaded true", async () => {
    const context = createContext();
    const result = await it_reloadWindowFromWebview({ context: context as any });

    expect(context.reloadWindow).toHaveBeenCalledTimes(1);
    expect(result.value).toEqual({ reloaded: true });
  });

  it("traces and rethrows on getConfig failure", async () => {
    const context = createContext({
      refreshConfigSnapshot: vi.fn(async () => {
        throw new Error("config load failed");
      }),
    });

    await expect(it_getConfigFromWebview({ context: context as any })).rejects.toThrow(
      "config load failed",
    );
    expect(
      (context.logTrace as any).mock.calls.some(
        (call: any[]) =>
          call[0] === "core get_config error" &&
          call[1]?.event === "application.core.get_config",
      ),
    ).toBe(true);
  });
});
