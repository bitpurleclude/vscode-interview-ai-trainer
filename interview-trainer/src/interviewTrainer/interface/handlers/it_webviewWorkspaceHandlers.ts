import * as vscode from "vscode";
import {
  it_selectSessionsDirFromWebview,
  it_selectWorkspaceDirFromWebview,
  type ItWorkspaceResult,
  type ItWorkspaceUseCaseContext,
} from "../../application/useCases/it_workspaceActions";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createWorkspaceUseCaseContext(
  host: ItWebviewHandlersHost,
): ItWorkspaceUseCaseContext {
  return {
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    requireWorkspaceRoot: host.requireWorkspaceRoot,
    selectDirectory: async (options) => {
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: options.openLabel,
        defaultUri: vscode.Uri.file(options.defaultPath),
      });
      if (!selection || selection.length === 0) {
        return null;
      }
      return selection[0].fsPath;
    },
    showWarning: (message) => {
      void vscode.window.showWarningMessage(message);
    },
  };
}

function it_applyWorkspaceResult(
  host: ItWebviewHandlersHost,
  result: ItWorkspaceResult<unknown>,
): void {
  host.configBundle = result.configBundle;
  if (result.configSnapshot) {
    host.configSnapshot = result.configSnapshot;
    host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  }
}

export function it_registerWorkspaceHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/selectWorkspaceDir", async (msg) => {
    const result = await it_selectWorkspaceDirFromWebview({
      context: it_createWorkspaceUseCaseContext(host),
      payload: msg.data,
    });
    it_applyWorkspaceResult(host, result);
    return result.value;
  });

  host.webviewProtocol.on("it/selectSessionsDir", async () => {
    const result = await it_selectSessionsDirFromWebview({
      context: it_createWorkspaceUseCaseContext(host),
    });
    it_applyWorkspaceResult(host, result);
    return result.value;
  });
}
