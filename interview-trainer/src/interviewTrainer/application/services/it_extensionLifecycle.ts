import type { ChildProcess } from "child_process";
import * as vscode from "vscode";

export interface ItExtensionDisposeHost {
  embeddingWarmupTimer: ReturnType<typeof setTimeout> | null;
  embeddingWarmupAbort: { aborted: boolean } | null;
  recordingChild: ChildProcess | null;
  outputChannel: vscode.OutputChannel;
}

export function it_requireWorkspaceRoot(): string {
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length) {
    return folders[0].uri.fsPath;
  }
  void vscode.window.showErrorMessage("请先打开工作区文件夹后再进行分析。");
  throw new Error("workspace not found");
}

export function it_disposeExtensionHost(host: ItExtensionDisposeHost): void {
  if (host.embeddingWarmupTimer) {
    clearTimeout(host.embeddingWarmupTimer);
    host.embeddingWarmupTimer = null;
  }
  if (host.embeddingWarmupAbort) {
    host.embeddingWarmupAbort.aborted = true;
    host.embeddingWarmupAbort = null;
  }
  if (host.recordingChild && !host.recordingChild.killed) {
    try {
      host.recordingChild.kill("SIGTERM");
    } catch {
      // ignore
    }
  }
  host.recordingChild = null;
  host.outputChannel.dispose();
}
