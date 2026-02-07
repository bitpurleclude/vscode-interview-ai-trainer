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
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createCoreUseCaseContext(host: ItWebviewHandlersHost): ItCoreUseCaseContext {
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
    appendOutputLine: (line) => {
      host.outputChannel.appendLine(line);
    },
    nowIso: () => new Date().toISOString(),
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
  host: ItWebviewHandlersHost,
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
  host: ItWebviewHandlersHost,
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

export function it_registerCoreHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/getState", async () =>
    it_runCoreUseCase(host, ({ context }) => it_getStateFromWebview({ context })),
  );

  host.webviewProtocol.on("it/getConfig", async () =>
    it_runCoreUseCase(host, ({ context }) => it_getConfigFromWebview({ context })),
  );

  host.webviewProtocol.on("it/enableTraceLogs", async () =>
    it_runCoreUseCase(host, ({ context }) => it_enableTraceLogsFromWebview({ context })),
  );

  host.webviewProtocol.on("it/listHistory", async (msg) =>
    it_runCoreUseCase(
      host,
      ({ context, payload }) => it_listHistoryFromWebview({ context, payload }),
      msg.data,
    ),
  );

  host.webviewProtocol.on("it/openSettings", async () =>
    it_runCoreUseCase(host, ({ context }) => it_openSettingsFromWebview({ context })),
  );

  host.webviewProtocol.on("it/openMicSettings", async () =>
    it_runCoreUseCase(host, ({ context }) => it_openMicSettingsFromWebview({ context })),
  );

  host.webviewProtocol.on("it/reloadWindow", async () =>
    it_runCoreUseCase(host, ({ context }) => it_reloadWindowFromWebview({ context })),
  );
}
