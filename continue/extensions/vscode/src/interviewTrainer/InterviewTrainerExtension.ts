import path from "path";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItState,
} from "core/protocol/interviewTrainer";

import {
  it_loadConfigBundle,
  ItApiConfig,
  it_applySecretOverrides,
  it_ensureConfigFiles,
} from "./api/it_apiConfig";
import { it_runAnalysis } from "./core/it_analyze";
import { it_listHistoryItems } from "./storage/it_history";
import { VsCodeWebviewProtocol } from "../webviewProtocol";

const IT_STATUS_INIT: ItState = {
  statusMessage: "等待开始面试训练",
  overallProgress: 0,
  recordingState: "idle",
  steps: [
    { id: "init", status: "success", progress: 100 },
    { id: "recording", status: "pending", progress: 0 },
    { id: "acoustic", status: "pending", progress: 0 },
    { id: "asr", status: "pending", progress: 0 },
    { id: "notes", status: "pending", progress: 0 },
    { id: "evaluation", status: "pending", progress: 0 },
    { id: "report", status: "pending", progress: 0 },
    { id: "write", status: "pending", progress: 0 },
  ],
};

export class InterviewTrainerExtension {
  private state: ItState = { ...IT_STATUS_INIT };
  private configSnapshot: ItConfigSnapshot;
  private configBundle = it_loadConfigBundle(this.context);

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly webviewProtocol: VsCodeWebviewProtocol,
  ) {
    this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
    this.registerHandlers();
  }

  private getWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
      return folders[0].uri.fsPath;
    }
    return this.context.globalStorageUri.fsPath;
  }

  private buildConfigSnapshot(apiConfig: ItApiConfig): ItConfigSnapshot {
    return {
      activeEnvironment: apiConfig.active?.environment || "prod",
      llmProvider: apiConfig.active?.llm || "baidu_qianfan",
      asrProvider: apiConfig.active?.asr || "baidu_vop",
      acousticProvider: apiConfig.active?.acoustic || "api",
      sessionsDir: this.configBundle.skill.sessions_dir || "sessions",
    };
  }

  private updateState(nextState: Partial<ItState>): void {
    this.state = { ...this.state, ...nextState };
    this.webviewProtocol.send("it/stateUpdate", this.state);
  }

  private registerHandlers(): void {
    this.webviewProtocol.on("it/getState", () => this.state);
    this.webviewProtocol.on("it/getConfig", () => this.configSnapshot);
    this.webviewProtocol.on("it/listHistory", (msg) => {
      const workspaceRoot = this.getWorkspaceRoot();
      const sessionsRoot = path.join(
        workspaceRoot,
        this.configBundle.skill.sessions_dir || "sessions",
      );
      return it_listHistoryItems(sessionsRoot, msg.data?.query, msg.data?.limit);
    });
    this.webviewProtocol.on("it/openSettings", async () => {
      it_ensureConfigFiles(this.context);
      const configDir = this.context.globalStorageUri.fsPath;
      const target = path.join(configDir, "interview_trainer", "api_config.yaml");
      await vscode.commands.executeCommand(
        "vscode.open",
        vscode.Uri.file(target),
      );
    });
    this.webviewProtocol.on("it/analyzeAudio", async (msg) => {
      return await this.handleAnalyze(msg.data);
    });
  }

  private async handleAnalyze(
    request: ItAnalyzeRequest,
  ): Promise<ItAnalyzeResponse> {
    try {
      this.updateState({
        statusMessage: "正在处理音频与转写",
        overallProgress: 15,
        steps: this.state.steps.map((step) =>
          step.id === "recording"
            ? { ...step, status: "success", progress: 100 }
            : step.id === "asr"
              ? { ...step, status: "running", progress: 10 }
              : step,
        ),
      });

      this.configBundle = it_loadConfigBundle(this.context);
      this.configBundle.api = await it_applySecretOverrides(
        this.context,
        this.configBundle.api,
      );
      const workspaceRoot = this.getWorkspaceRoot();
      const response = await it_runAnalysis(
        {
          context: this.context,
          apiConfig: this.configBundle.api,
          skillConfig: this.configBundle.skill,
          workspaceRoot,
        },
        request,
      );

      this.updateState({
        statusMessage: "分析完成，可保存与复盘",
        overallProgress: 100,
        steps: this.state.steps.map((step) =>
          [
            "acoustic",
            "asr",
            "notes",
            "evaluation",
            "report",
            "write",
          ].includes(step.id)
            ? { ...step, status: "success", progress: 100 }
            : step,
        ),
      });

      return response;
    } catch (error) {
      this.updateState({
        statusMessage: "分析失败，请检查API配置与音频格式",
        overallProgress: 0,
        lastError: {
          type: "analysis",
          reason: error instanceof Error ? error.message : "未知错误",
          solution: "请检查API Key/Secret、网络连接，以及音频格式。",
        },
        steps: this.state.steps.map((step) =>
          step.status === "running"
            ? { ...step, status: "error", progress: step.progress }
            : step,
        ),
      });
      throw error;
    }
  }
}
