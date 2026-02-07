import path from "path";
import * as vscode from "vscode";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerWorkspaceHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/selectWorkspaceDir", async (msg) => {
    const kind = String(msg.data?.kind || "");
    const keyMap: Record<string, string> = {
      notes: "notes_dir",
      prompts: "prompts_dir",
      rubrics: "rubrics_dir",
      knowledge: "knowledge_dir",
      examples: "examples_dir",
    };
    const targetKey = keyMap[kind];
    if (!targetKey) {
      throw new Error("invalid workspace kind");
    }
    const workspaceRoot = host.requireWorkspaceRoot();
    const skillConfig = (host.configBundle.skill || {}) as Record<string, any>;
    const workspaceConfig = (skillConfig.workspace || {}) as Record<string, any>;
    const current = String(
      workspaceConfig[targetKey] ?? skillConfig[targetKey] ?? "",
    ).trim();
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "选择目录",
      defaultUri: vscode.Uri.file(
        current ? path.join(workspaceRoot, current) : workspaceRoot,
      ),
    });
    if (!selection || selection.length === 0) {
      return { canceled: true };
    }
    const selected = selection[0].fsPath;
    const relative = path.relative(workspaceRoot, selected);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      void vscode.window.showWarningMessage("请选择当前工作区内的目录。");
      return { canceled: true };
    }
    const normalized = relative ? relative.split(path.sep).join("/") : ".";
    host.configBundle = host.configService.loadBundle();
    const nextSkill = {
      ...(host.configBundle.skill || {}),
      workspace: {
        ...((host.configBundle.skill?.workspace || {}) as Record<string, any>),
        [targetKey]: normalized || ".",
      },
    } as Record<string, any>;
    if (Object.prototype.hasOwnProperty.call(nextSkill, targetKey)) {
      delete nextSkill[targetKey];
    }
    host.configBundle.skill = {
      ...nextSkill,
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return { kind, path: normalized || "." };
  });

  host.webviewProtocol.on("it/selectSessionsDir", async () => {
    const workspaceRoot = host.requireWorkspaceRoot();
    const selection = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "选择保存目录",
      defaultUri: vscode.Uri.file(workspaceRoot),
    });
    if (!selection || selection.length === 0) {
      return { canceled: true };
    }
    const selected = selection[0].fsPath;
    const relative = path.relative(workspaceRoot, selected);
    if (relative.startsWith("..") || path.isAbsolute(relative)) {
      void vscode.window.showWarningMessage("请选择当前工作区内的目录。");
      return { canceled: true };
    }
    const normalized = relative ? relative.split(path.sep).join("/") : "sessions";
    host.configBundle = host.configService.loadBundle();
    host.configBundle.skill = {
      ...host.configBundle.skill,
      sessions_dir: normalized || "sessions",
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return { sessionsDir: normalized || "sessions" };
  });
}
