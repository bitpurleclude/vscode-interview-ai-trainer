import path from "path";
import * as vscode from "vscode";
import {
  it_ensureConfigFiles,
  it_listHistoryItems,
} from "../../application/services/it_infraBridge";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerCoreHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/getState", () => host.state);
  host.webviewProtocol.on("it/getConfig", async () => {
    const snapshot = await host.refreshConfigSnapshot();
    host.scheduleEmbeddingWarmup("config");
    return snapshot;
  });
  host.webviewProtocol.on("it/enableTraceLogs", () => {
    host.traceLogsEnabled = true;
    host.outputChannel.show(true);
    host.outputChannel.appendLine(
      `[${new Date().toISOString()}] 已开启笔记学习日志输出`,
    );
    return { enabled: true };
  });
  host.webviewProtocol.on("it/listHistory", async (msg) => {
    const workspaceRoot = host.requireWorkspaceRoot();
    const sessionsRoot = path.join(
      workspaceRoot,
      host.configBundle.skill.sessions_dir || "sessions",
    );
    const filenames = host.configBundle.skill.filenames ?? {};
    const topics = host.configBundle.skill.topics ?? {};
    return await it_listHistoryItems(
      sessionsRoot,
      msg.data?.query,
      msg.data?.limit,
      {
        allowUnicode: filenames.allow_unicode ?? true,
        maxSlugLen: filenames.max_slug_len ?? 16,
        centerSubdir: topics.center_subdir || "",
      },
    );
  });
  host.webviewProtocol.on("it/openSettings", async () => {
    it_ensureConfigFiles(host.context);
    const configDir = host.context.globalStorageUri.fsPath;
    const target = path.join(configDir, "interview_trainer", "templates.yaml");
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
  });
  host.webviewProtocol.on("it/openMicSettings", async () => {
    if (process.platform === "win32") {
      await vscode.env.openExternal(
        vscode.Uri.parse("ms-settings:privacy-microphone"),
      );
      return;
    }
    if (process.platform === "darwin") {
      await vscode.env.openExternal(
        vscode.Uri.parse(
          "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone",
        ),
      );
      return;
    }
    void vscode.window.showInformationMessage(
      "请在系统设置中开启麦克风权限后重试。",
    );
  });
  host.webviewProtocol.on("it/reloadWindow", async () => {
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
  });
}
