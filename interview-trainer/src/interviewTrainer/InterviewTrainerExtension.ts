import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItConfigSnapshot,
  ItState,
  ItStepState,
  ItStepStatus,
  ItWorkflowStep,
} from "../protocol/interviewTrainer";

import {
  it_loadConfigBundle,
  ItApiConfig,
  it_applySecretOverrides,
  it_ensureConfigFiles,
} from "./api/it_apiConfig";
import { it_runAnalysis } from "./core/it_analyze";
import { it_listHistoryItems } from "./storage/it_history";
import { WebviewProtocol } from "../webview/WebviewProtocol";
import { ItQianfanConfig } from "./api/it_qianfan";
import { it_parseQuestions } from "./core/it_questionParser";

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

const IT_PROGRESS_WEIGHTS: Partial<Record<ItWorkflowStep, number>> = {
  asr: 0.45,
  acoustic: 0.15,
  notes: 0.1,
  evaluation: 0.2,
  report: 0.05,
  write: 0.05,
};

export class InterviewTrainerExtension {
  private state: ItState = { ...IT_STATUS_INIT };
  private configSnapshot: ItConfigSnapshot;
  private configBundle: ReturnType<typeof it_loadConfigBundle>;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly webviewProtocol: WebviewProtocol,
  ) {
    this.configBundle = it_loadConfigBundle(this.context);
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

  private it_getLlmConfig(): ItQianfanConfig | null {
    const env = this.configBundle.api.active?.environment || "prod";
    const envConfig = this.configBundle.api.environments?.[env] ?? {};
    const llm = envConfig.llm ?? {};
    if (llm.provider !== "baidu_qianfan" || !llm.api_key) {
      return null;
    }
    return {
      apiKey: llm.api_key || "",
      baseUrl: llm.base_url || "https://qianfan.baidubce.com/v2",
      model: llm.model || "ernie-4.5-turbo-128k",
      temperature: Number(llm.temperature ?? 0.8),
      topP: Number(llm.top_p ?? 0.8),
      timeoutSec: Number(llm.timeout_sec ?? 60),
      maxRetries: Number(llm.max_retries ?? 1),
    };
  }

  private updateState(nextState: Partial<ItState>): void {
    this.state = { ...this.state, ...nextState };
    this.webviewProtocol.send("it/stateUpdate", this.state);
  }

  private buildRunSteps(): ItStepState[] {
    return IT_STATUS_INIT.steps.map((step) => ({
      ...step,
      status: (step.id === "init" ? "success" : "pending") as ItStepStatus,
      progress: step.id === "init" ? 100 : 0,
      message: undefined,
    }));
  }

  private computeOverallProgress(steps: ItStepState[]): number {
    let weighted = 0;
    let totalWeight = 0;
    for (const step of steps) {
      const weight = IT_PROGRESS_WEIGHTS[step.id];
      if (!weight) {
        continue;
      }
      totalWeight += weight;
      const progress = Math.max(0, Math.min(100, step.progress || 0));
      weighted += weight * (progress / 100);
    }
    if (!totalWeight) {
      return 0;
    }
    return Math.round((weighted / totalWeight) * 100);
  }

  private updateProgress(update: {
    step: ItWorkflowStep;
    progress: number;
    message?: string;
    status?: ItStepStatus;
  }): void {
    const steps = this.state.steps.map((step) => {
      if (step.id !== update.step) {
        return step;
      }
      return {
        ...step,
        status: update.status ?? step.status,
        progress: Math.max(0, Math.min(100, Math.round(update.progress))),
        message: update.message ?? step.message,
      };
    });
    const overallProgress = this.computeOverallProgress(steps);
    this.updateState({
      steps,
      overallProgress,
      statusMessage: update.message ?? this.state.statusMessage,
    });
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
    this.webviewProtocol.on("it/parseQuestions", async (msg) => {
      const text = String(msg.data?.text || "");
      this.configBundle = it_loadConfigBundle(this.context);
      this.configBundle.api = await it_applySecretOverrides(
        this.context,
        this.configBundle.api,
      );
      const llmConfig = this.it_getLlmConfig();
      return await it_parseQuestions(text, llmConfig);
    });
    this.webviewProtocol.on("openFile", async (msg) => {
      const target = msg.data?.path;
      if (!target) {
        return;
      }
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
    });
    this.webviewProtocol.on("it/convertAudioToPcm", async (msg) => {
      const base64 = String(msg.data?.base64 || "");
      const ext = String(msg.data?.ext || "m4a").replace(/[^a-z0-9]/gi, "");
      if (!base64) {
        throw new Error("missing audio bytes");
      }

      const ffmpeg = await this.it_findFfmpeg();
      if (!ffmpeg) {
        throw new Error(
          "未检测到 ffmpeg：请安装 ffmpeg 或将音频先转为 WAV(16kHz 单声道) 后再导入。",
        );
      }

      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "it-audio-"));
      const inPath = path.join(tmpDir, `input.${ext || "m4a"}`);
      const outPath = path.join(tmpDir, "output.pcm");
      fs.writeFileSync(inPath, Buffer.from(base64, "base64"));

      await new Promise<void>((resolve, reject) => {
        const args = [
          "-y",
          "-i",
          inPath,
          "-ac",
          "1",
          "-ar",
          "16000",
          "-f",
          "s16le",
          outPath,
        ];
        const child = spawn(ffmpeg, args, { windowsHide: true });
        let stderr = "";
        child.stderr.on("data", (d) => {
          stderr += String(d);
        });
        child.on("error", (err) => reject(err));
        child.on("close", (code) => {
          if (code === 0 && fs.existsSync(outPath)) {
            resolve();
          } else {
            reject(new Error(`ffmpeg 转换失败: ${stderr || `code=${code}`}`));
          }
        });
      });

      const pcm = fs.readFileSync(outPath);
      const byteLength = pcm.byteLength;
      const durationSec = byteLength / (2 * 16000);

      // cleanup best-effort
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {}

      return {
        base64: pcm.toString("base64"),
        byteLength,
        durationSec,
      };
    });
    this.webviewProtocol.on("it/analyzeAudio", async (msg) => {
      return await this.handleAnalyze(msg.data);
    });
  }

  private async it_findFfmpeg(): Promise<string | null> {
    const envPath = process.env.IT_FFMPEG_PATH;
    if (envPath && fs.existsSync(envPath)) {
      return envPath;
    }

    const candidates = process.platform === "win32" ? ["ffmpeg.exe", "ffmpeg"] : ["ffmpeg"];
    for (const cmd of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const child = spawn(cmd, ["-version"], { windowsHide: true });
          child.on("error", (err) => reject(err));
          child.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(String(code)));
          });
        });
        return cmd;
      } catch {
        // try next
      }
    }
    return null;
  }

  private async handleAnalyze(
    request: ItAnalyzeRequest,
  ): Promise<ItAnalyzeResponse> {
    try {
      const steps = this.buildRunSteps().map((step) => {
        if (step.id === "recording") {
          return { ...step, status: "success" as ItStepStatus, progress: 100 };
        }
        if (step.id === "asr") {
          return { ...step, status: "running" as ItStepStatus, progress: 0 };
        }
        return step;
      });
      this.updateState({
        statusMessage: "正在处理音频与转写",
        steps,
        overallProgress: this.computeOverallProgress(steps),
        lastError: undefined,
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
          onProgress: (update) => this.updateProgress(update),
        },
        request,
      );

      this.updateState({
        statusMessage: "分析完成，可保存与复盘",
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
        overallProgress: 100,
        lastError: undefined,
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
