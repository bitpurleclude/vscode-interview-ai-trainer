import * as vscode from "vscode";
import {
  it_selectSessionsDirFromWebview,
  it_selectWorkspaceDirFromWebview,
  type ItWorkspaceResult,
  type ItWorkspaceUseCaseContext,
} from "../../application/useCases/it_workspaceActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItWorkspaceHandlersPort } from "./it_webviewHandlerPorts";

function it_createWorkspaceUseCaseContext(
  host: ItWorkspaceHandlersPort,
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
    logCorpusTrace: host.logCorpusTrace,
  };
}

function it_applyWorkspaceResult(
  host: ItWorkspaceHandlersPort,
  result: ItWorkspaceResult<unknown>,
): void {
  host.configBundle = result.configBundle;
  if (result.configSnapshot) {
    host.configSnapshot = result.configSnapshot;
    host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  }
}

export function it_registerWorkspaceHandlers(host: ItWorkspaceHandlersPort): void {
  host.webviewProtocol.on("it/selectWorkspaceDir", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/selectWorkspaceDir",
        event: "interface.workspace.select_dir",
        payload: msg.data,
      },
      async () => {
        const result = await it_selectWorkspaceDirFromWebview({
          context: it_createWorkspaceUseCaseContext(host),
          payload: msg.data,
        });
        it_applyWorkspaceResult(host, result);
        return result.value;
      },
    ),
  );

  host.webviewProtocol.on("it/selectSessionsDir", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/selectSessionsDir",
        event: "interface.workspace.select_sessions_dir",
      },
      async () => {
        const result = await it_selectSessionsDirFromWebview({
          context: it_createWorkspaceUseCaseContext(host),
        });
        it_applyWorkspaceResult(host, result);
        return result.value;
      },
    ),
  );
}
