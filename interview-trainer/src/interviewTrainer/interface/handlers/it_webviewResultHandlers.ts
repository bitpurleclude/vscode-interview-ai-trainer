import * as vscode from "vscode";
import {
  it_saveCurrentResult,
  type ItSaveCurrentResultPayload,
} from "../../application/useCases/it_saveCurrentResult";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerResultHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("openFile", async (msg) => {
    const target = msg.data?.path;
    if (!target) {
      return;
    }
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
  });
  host.webviewProtocol.on("it/analyzeAudio", async (msg) => {
    return await host.handleAnalyze(msg.data);
  });
  host.webviewProtocol.on("it/saveCurrentResult", async (msg) => {
    return await it_saveCurrentResult({
      payload: (msg.data || {}) as ItSaveCurrentResultPayload,
      configBundle: host.configBundle,
      requireWorkspaceRoot: () => host.requireWorkspaceRoot(),
    });
  });
  host.webviewProtocol.on("it/cancelAnalyze", () => {
    if (host.analysisAbort) {
      host.analysisAbort.aborted = true;
    }
    host.updateState({
      statusMessage: "已请求停止分析",
      lastError: undefined,
      steps: host.state.steps.map((step) =>
        step.status === "running"
          ? { ...step, status: "error", progress: step.progress }
          : step,
      ),
    });
    return { cancelled: true };
  });
}
