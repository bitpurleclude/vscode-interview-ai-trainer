import * as vscode from "vscode";
import {
  it_enableTraceLogsFromWebview,
  it_getConfigFromWebview,
  it_getStateFromWebview,
  it_listHistoryFromWebview,
  type ItCoreResult,
  type ItCoreUseCaseContext,
  it_openMicSettingsFromWebview,
  it_openSettingsFromWebview,
  it_reloadWindowFromWebview,
} from "../../application/useCases/it_coreActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItCoreHandlersPort } from "./it_webviewHandlerPorts";

function it_createCoreUseCaseContext(host: ItCoreHandlersPort): ItCoreUseCaseContext {
  return {
    extensionContext: host.context,
    state: host.state,
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    scheduleEmbeddingWarmup: host.scheduleEmbeddingWarmup,
    requireWorkspaceRoot: host.requireWorkspaceRoot,
    setTraceLogsEnabled: (enabled) => {
      host.traceLogsEnabled = enabled;
    },
    showOutput: () => {
      host.outputChannel.show(true);
    },
    logTrace: (message, detail) => {
      host.logCorpusTrace(message, detail);
    },
    platform: process.platform,
    openFile: async (filePath) => {
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath));
    },
    openExternal: async (uri) => {
      await vscode.env.openExternal(vscode.Uri.parse(uri));
    },
    showInfo: (message) => {
      void vscode.window.showInformationMessage(message);
    },
    reloadWindow: async () => {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    },
  };
}

function it_applyCoreResult(
  host: ItCoreHandlersPort,
  result: ItCoreResult<unknown>,
): void {
  if (result.configBundle) {
    host.configBundle = result.configBundle;
  }
  if (result.configSnapshot) {
    host.configSnapshot = result.configSnapshot;
  }
}

async function it_runCoreUseCase<T>(
  host: ItCoreHandlersPort,
  useCase: (params: {
    context: ItCoreUseCaseContext;
    payload?: unknown;
  }) => Promise<ItCoreResult<T>> | ItCoreResult<T>,
  payload?: unknown,
): Promise<T> {
  const result = await useCase({
    context: it_createCoreUseCaseContext(host),
    payload,
  });
  it_applyCoreResult(host, result);
  return result.value;
}

export function it_registerCoreHandlers(host: ItCoreHandlersPort): void {
  host.webviewProtocol.on("it/getState", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/getState",
        event: "interface.core.get_state",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_getStateFromWebview({ context })),
    ),
  );

  host.webviewProtocol.on("it/getConfig", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/getConfig",
        event: "interface.core.get_config",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_getConfigFromWebview({ context })),
    ),
  );

  host.webviewProtocol.on("it/enableTraceLogs", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/enableTraceLogs",
        event: "interface.core.enable_trace_logs",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_enableTraceLogsFromWebview({ context })),
    ),
  );

  host.webviewProtocol.on("it/listHistory", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/listHistory",
        event: "interface.core.list_history",
        payload: msg.data,
      },
      () =>
        it_runCoreUseCase(
          host,
          ({ context, payload }) => it_listHistoryFromWebview({ context, payload }),
          msg.data,
        ),
    ),
  );

  host.webviewProtocol.on("it/openSettings", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/openSettings",
        event: "interface.core.open_settings",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_openSettingsFromWebview({ context })),
    ),
  );

  host.webviewProtocol.on("it/openMicSettings", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/openMicSettings",
        event: "interface.core.open_mic_settings",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_openMicSettingsFromWebview({ context })),
    ),
  );

  host.webviewProtocol.on("it/reloadWindow", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/reloadWindow",
        event: "interface.core.reload_window",
      },
      () => it_runCoreUseCase(host, ({ context }) => it_reloadWindowFromWebview({ context })),
    ),
  );
}
