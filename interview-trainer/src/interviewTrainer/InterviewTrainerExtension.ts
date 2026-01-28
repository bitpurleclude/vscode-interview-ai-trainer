import path from "path";
import os from "os";
import fs from "fs";
import { spawn } from "child_process";
import ffmpegStatic from "ffmpeg-static";
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
  it_saveApiConfig,
  it_saveSkillConfig,
} from "./api/it_apiConfig";
import { it_callLlmChat, ItLlmConfig } from "./api/it_llm";
import { it_callBaiduAsr } from "./api/it_baidu";
import { it_runAnalysis } from "./core/it_analyze";
import { it_listHistoryItems } from "./storage/it_history";
import { WebviewProtocol } from "../webview/WebviewProtocol";
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
  private recordingChild: import("child_process").ChildProcess | null = null;
  private recordingTempDir: string | null = null;
  private recordingStartAt: number | null = null;
  private recordingExitInfo: {
    exitCode: number | null;
    exitSignal: string | null;
    stderr: string;
  } | null = null;
  private detectedInput: string | null = null;
  private availableInputs: string[] | null = null;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly webviewProtocol: WebviewProtocol,
  ) {
    this.configBundle = it_loadConfigBundle(this.context);
    this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
    this.registerHandlers();
  }

  private requireWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    if (folders && folders.length) {
      return folders[0].uri.fsPath;
    }
    void vscode.window.showErrorMessage("请先打开工作区文件夹后再进行分析。");
    throw new Error("workspace not found");
  }

  private buildConfigSnapshot(apiConfig: ItApiConfig): ItConfigSnapshot {
    const env = apiConfig.active?.environment || "prod";
    const envConfig = apiConfig.environments?.[env] ?? {};
    const llmConfig = envConfig.llm ?? {};
    const asrConfig = envConfig.asr ?? {};
    const llmProfiles = envConfig.llm_profiles || {};
    const asrProfiles = envConfig.asr_profiles || {};
    const llmDefaultBase =
      llmConfig.provider === "volc_doubao"
        ? "https://ark.cn-beijing.volces.com"
        : "https://qianfan.baidubce.com/v2";
    const workspace = this.configBundle.skill.workspace ?? {};
    return {
      activeEnvironment: env,
      envList: Object.keys(apiConfig.environments || {}),
      llmProvider: apiConfig.active?.llm || llmConfig.provider || "baidu_qianfan",
      asrProvider: apiConfig.active?.asr || asrConfig.provider || "baidu_vop",
      acousticProvider: apiConfig.active?.acoustic || "api",
      llmProfiles,
      asrProfiles,
      llm: {
        provider: llmConfig.provider || apiConfig.active?.llm || "baidu_qianfan",
        baseUrl: llmConfig.base_url || llmDefaultBase,
        model:
          llmConfig.model ||
          (llmConfig.provider === "volc_doubao"
            ? "doubao-1-5-pro-32k-250115"
            : "ernie-4.5-turbo-128k"),
        apiKey: llmConfig.api_key || "",
        temperature: Number(llmConfig.temperature ?? 0.8),
        topP: Number(llmConfig.top_p ?? 0.8),
        timeoutSec: Number(llmConfig.timeout_sec ?? 60),
        maxRetries: Number(llmConfig.max_retries ?? 1),
      },
      asr: {
        provider: asrConfig.provider || apiConfig.active?.asr || "baidu_vop",
        baseUrl: asrConfig.base_url || "https://vop.baidu.com/server_api",
        apiKey: asrConfig.api_key || "",
        secretKey: asrConfig.secret_key || "",
        language: asrConfig.language || "zh",
        devPid: Number(asrConfig.dev_pid ?? 1537),
        mockText: asrConfig.mock_text || "",
        maxChunkSec: Number(asrConfig.max_chunk_sec ?? 50),
        timeoutSec: Number(asrConfig.timeout_sec ?? 120),
        maxRetries: Number(asrConfig.max_retries ?? 1),
      },
      sessionsDir: this.configBundle.skill.sessions_dir || "sessions",
      retrievalEnabled: this.configBundle.skill.retrieval?.enabled !== false,
      workspaceDirs: {
        notesDir: workspace.notes_dir || "inputs/notes",
        promptsDir: workspace.prompts_dir || "inputs/prompts/guangdong",
        rubricsDir: workspace.rubrics_dir || "inputs/rubrics",
        knowledgeDir: workspace.knowledge_dir || "inputs/knowledge",
        examplesDir: workspace.examples_dir || "inputs/examples",
      },
    };
  }

  private it_getLlmConfig(): ItLlmConfig | null {
    const env = this.configBundle.api.active?.environment || "prod";
    const envConfig = this.configBundle.api.environments?.[env] ?? {};
    const llm = envConfig.llm ?? {};
    if (!llm.provider || !llm.api_key) {
      return null;
    }
    const defaultBase =
      llm.provider === "volc_doubao"
        ? "https://ark.cn-beijing.volces.com"
        : "https://qianfan.baidubce.com/v2";
    return {
      provider: llm.provider,
      apiKey: llm.api_key || "",
      baseUrl: llm.base_url || defaultBase,
      model:
        llm.model ||
        (llm.provider === "volc_doubao"
          ? "doubao-1-5-pro-32k-250115"
          : "ernie-4.5-turbo-128k"),
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

  private it_getUserDataDir(): string {
    const storagePath = this.context.globalStorageUri?.fsPath;
    if (!storagePath) {
      throw new Error("无法定位 VS Code 用户数据目录。");
    }
    return path.resolve(storagePath, "..", "..", "..");
  }

  private it_resetWebviewStorage(): {
    userDataDir: string;
    moved: string[];
    missing: string[];
    failed: string[];
    clearedPreferences: string[];
    locked: string[];
  } {
    const userDataDir = this.it_getUserDataDir();
    const targets = ["WebStorage", "Local Storage", "SharedStorage"];
    const moved: string[] = [];
    const missing: string[] = [];
    const failed: string[] = [];
    const locked: string[] = [];
    const clearedPreferences: string[] = [];
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");

    for (const target of targets) {
      const fullPath = path.join(userDataDir, target);
      if (!fs.existsSync(fullPath)) {
        missing.push(target);
        continue;
      }
      let backupName = `${target}.bak-${stamp}`;
      let backupPath = path.join(userDataDir, backupName);
      if (fs.existsSync(backupPath)) {
        backupName = `${target}.bak-${stamp}-${Math.random().toString(16).slice(2, 8)}`;
        backupPath = path.join(userDataDir, backupName);
      }
      try {
        fs.renameSync(fullPath, backupPath);
        moved.push(backupName);
      } catch (error) {
        const stat = (() => {
          try {
            return fs.lstatSync(fullPath);
          } catch {
            return null;
          }
        })();
        // Windows 上文件句柄占用时 rename 可能失败，尝试复制备份后删除源目录。
        try {
          if (stat && stat.isDirectory()) {
            fs.cpSync(fullPath, backupPath, { recursive: true, errorOnExist: false });
          } else {
            fs.copyFileSync(fullPath, backupPath);
          }
          const lockedEntries = this.it_removeDirLoose(fullPath, Boolean(stat?.isDirectory()));
          if (lockedEntries.length) {
            locked.push(...lockedEntries);
            moved.push(`${backupName} (partial)`);
          } else {
            moved.push(`${backupName} (copied)`);
          }
        } catch (fallbackError) {
          failed.push(
            `${target}: ${error instanceof Error ? error.message : String(error)}; fallback: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          );
        }
      }
    }

    // Clear persisted media permission decisions so the webview can re-prompt.
    const preferencePath = path.join(userDataDir, "Preferences");
    if (fs.existsSync(preferencePath)) {
      try {
        const raw = fs.readFileSync(preferencePath, "utf8");
        const json = JSON.parse(raw);
        const profile = (json.profile = json.profile ?? {});
        const contentSettingsContainer = (profile.content_settings =
          profile.content_settings ?? {});
        const exceptions = (contentSettingsContainer.exceptions =
          contentSettingsContainer.exceptions ?? {});

        const permissionKeys = [
          "media_stream_mic",
          "media_stream_camera",
          "media_stream",
        ];

        let changed = false;
        for (const key of permissionKeys) {
          const rules = exceptions[key];
          if (!rules || typeof rules !== "object") {
            continue;
          }
          for (const origin of Object.keys(rules)) {
            if (origin.includes("vscode-webview") || origin.includes("vscode-file")) {
              delete rules[origin];
              clearedPreferences.push(`${key}:${origin}`);
              changed = true;
            }
          }
          if (Object.keys(rules).length === 0) {
            delete exceptions[key];
          }
        }

        if (changed) {
          fs.writeFileSync(preferencePath, JSON.stringify(json, null, 2), "utf8");
        }
      } catch (error) {
        failed.push(
          `Preferences: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return {
      userDataDir,
      moved,
      missing,
      failed,
      clearedPreferences,
      locked,
    };
  }

  private it_removeDirLoose(dir: string, isDirectory: boolean): string[] {
    const locked: string[] = [];
    if (!fs.existsSync(dir)) {
      return locked;
    }
    if (isDirectory) {
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(dir);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code || "";
        if (code === "ENOTDIR") {
          // 实际不是目录，走文件删除逻辑
          return this.it_removeDirLoose(dir, false);
        }
        locked.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
        return locked;
      }
      for (const entry of entries) {
        const full = path.join(dir, entry);
        try {
          fs.rmSync(full, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code || "";
          if (code === "EBUSY" || code === "EPERM") {
            locked.push(full);
          } else {
            locked.push(`${full}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
      }
      try {
        fs.rmdirSync(dir);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code || "";
        if (code === "EBUSY" || code === "EPERM") {
          locked.push(dir);
        }
      }
    } else {
      try {
        fs.rmSync(dir, { force: true, maxRetries: 2, retryDelay: 50 });
      } catch (error) {
        locked.push(`${dir}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return locked;
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
      const workspaceRoot = this.requireWorkspaceRoot();
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
    this.webviewProtocol.on("it/openMicSettings", async () => {
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
    this.webviewProtocol.on("it/resetMicPermissionCache", async () => {
      return this.it_resetWebviewStorage();
    });
    this.webviewProtocol.on("it/reloadWindow", async () => {
      await vscode.commands.executeCommand("workbench.action.reloadWindow");
    });
    this.webviewProtocol.on("it/startNativeRecording", async (msg) => {
      const device = msg.data?.device ? String(msg.data.device) : undefined;
      return await this.it_startNativeRecording(device);
    });
    this.webviewProtocol.on("it/stopNativeRecording", async () => {
      return await this.it_stopNativeRecording();
    });
    this.webviewProtocol.on("it/listNativeInputs", async () => {
      const ffmpeg = await this.it_findFfmpeg();
      if (!ffmpeg) {
        throw new Error("未找到 ffmpeg，无法列出输入设备");
      }
      const inputs = await this.it_listInputs(ffmpeg);
      return { inputs };
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
    this.webviewProtocol.on("it/setRetrievalEnabled", async (msg) => {
      const enabled = Boolean(msg.data?.enabled);
      this.configBundle = it_loadConfigBundle(this.context);
      this.configBundle.skill = {
        ...this.configBundle.skill,
        retrieval: {
          ...this.configBundle.skill.retrieval,
          enabled,
        },
      };
      it_saveSkillConfig(this.context, this.configBundle.skill);
      this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
      this.webviewProtocol.send("it/configUpdate", this.configSnapshot);
      return { enabled };
    });
    this.webviewProtocol.on("it/selectWorkspaceDir", async (msg) => {
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
        return { error: "invalid kind" };
      }
      const workspaceRoot = this.requireWorkspaceRoot();
      const current =
        this.configBundle.skill.workspace?.[targetKey] ||
        this.buildConfigSnapshot(this.configBundle.api).workspaceDirs[
          `${kind}Dir` as keyof ItConfigSnapshot["workspaceDirs"]
        ];
      const selection = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: "选择检索目录",
        defaultUri: vscode.Uri.file(path.join(workspaceRoot, current)),
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
      this.configBundle = it_loadConfigBundle(this.context);
      this.configBundle.skill = {
        ...this.configBundle.skill,
        workspace: {
          ...this.configBundle.skill.workspace,
          [targetKey]: normalized,
        },
      };
      it_saveSkillConfig(this.context, this.configBundle.skill);
      this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
      this.webviewProtocol.send("it/configUpdate", this.configSnapshot);
      return { kind, dir: normalized };
    });
    this.webviewProtocol.on("it/selectSessionsDir", async () => {
      const workspaceRoot = this.requireWorkspaceRoot();
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
      this.configBundle = it_loadConfigBundle(this.context);
      this.configBundle.skill = {
        ...this.configBundle.skill,
        sessions_dir: normalized || "sessions",
      };
      it_saveSkillConfig(this.context, this.configBundle.skill);
      this.configSnapshot = this.buildConfigSnapshot(this.configBundle.api);
      this.webviewProtocol.send("it/configUpdate", this.configSnapshot);
      return { sessionsDir: normalized || "sessions" };
    });
    this.webviewProtocol.on("it/updateApiSettings", async (msg) => {
      const payload = msg.data || {};
      const environment =
        String(payload.environment || "").trim() ||
        this.configBundle.api.active?.environment ||
        "prod";

      this.configBundle = it_loadConfigBundle(this.context);
      const apiConfig = { ...this.configBundle.api };
      const envConfig = {
        ...(apiConfig.environments?.[environment] || {}),
      };
      const llmForm = payload.llm || {};
      const asrForm = payload.asr || {};
      const llmProfiles = { ...(envConfig.llm_profiles || {}) };
      const asrProfiles = { ...(envConfig.asr_profiles || {}) };

      const llmDefaultBase =
        llmForm.provider === "volc_doubao"
          ? "https://ark.cn-beijing.volces.com"
          : "https://qianfan.baidubce.com/v2";
      const llmDefaultModel =
        llmForm.provider === "volc_doubao"
          ? "doubao-1-5-pro-32k-250115"
          : "ernie-4.5-turbo-128k";

      envConfig.llm = {
        ...(envConfig.llm || {}),
        provider: llmForm.provider || envConfig.llm?.provider || apiConfig.active?.llm || "baidu_qianfan",
        base_url: llmForm.baseUrl ?? envConfig.llm?.base_url ?? llmDefaultBase,
        model: llmForm.model ?? envConfig.llm?.model ?? llmDefaultModel,
        api_key: llmForm.apiKey ?? envConfig.llm?.api_key ?? "",
        temperature: Number(llmForm.temperature ?? envConfig.llm?.temperature ?? 0.8),
        top_p: Number(llmForm.topP ?? envConfig.llm?.top_p ?? 0.8),
        timeout_sec: Number(llmForm.timeoutSec ?? envConfig.llm?.timeout_sec ?? 60),
        max_retries: Number(llmForm.maxRetries ?? envConfig.llm?.max_retries ?? 1),
      };
      llmProfiles[envConfig.llm.provider] = {
        ...envConfig.llm,
      };

      envConfig.asr = {
        ...(envConfig.asr || {}),
        provider: asrForm.provider || envConfig.asr?.provider || apiConfig.active?.asr || "baidu_vop",
        base_url: asrForm.baseUrl ?? envConfig.asr?.base_url ?? "https://vop.baidu.com/server_api",
        api_key: asrForm.apiKey ?? envConfig.asr?.api_key ?? "",
        secret_key: asrForm.secretKey ?? envConfig.asr?.secret_key ?? "",
        mock_text: asrForm.mockText ?? envConfig.asr?.mock_text ?? "",
        language: asrForm.language ?? envConfig.asr?.language ?? "zh",
        dev_pid: Number(asrForm.devPid ?? envConfig.asr?.dev_pid ?? 1537),
        max_chunk_sec: Number(asrForm.maxChunkSec ?? envConfig.asr?.max_chunk_sec ?? 50),
        timeout_sec: Number(asrForm.timeoutSec ?? envConfig.asr?.timeout_sec ?? 120),
        max_retries: Number(asrForm.maxRetries ?? envConfig.asr?.max_retries ?? 1),
      };
      asrProfiles[envConfig.asr.provider] = {
        ...envConfig.asr,
      };

      apiConfig.active = {
        ...apiConfig.active,
        environment,
        llm: envConfig.llm.provider || apiConfig.active?.llm || "baidu_qianfan",
        asr: envConfig.asr.provider || apiConfig.active?.asr || "baidu_vop",
      };
      apiConfig.environments = {
        ...apiConfig.environments,
        [environment]: {
          ...envConfig,
          llm_profiles: llmProfiles,
          asr_profiles: asrProfiles,
        },
      };

      await this.context.secrets.store(
        `interviewTrainer.${environment}.llm.apiKey`,
        envConfig.llm.api_key || "",
      );
      await this.context.secrets.store(
        `interviewTrainer.${environment}.asr.apiKey`,
        envConfig.asr.api_key || "",
      );
      await this.context.secrets.store(
        `interviewTrainer.${environment}.asr.secretKey`,
        envConfig.asr.secret_key || "",
      );

      it_saveApiConfig(this.context, apiConfig);
      this.configBundle.api = apiConfig;
      this.configSnapshot = this.buildConfigSnapshot(apiConfig);
      this.webviewProtocol.send("it/configUpdate", this.configSnapshot);
      return this.configSnapshot;
    });
    this.webviewProtocol.on("it/testLlm", async (msg) => {
      const payload = msg.data || {};
      const llmForm = payload.llm || {};
      const provider = llmForm.provider || "baidu_qianfan";
      const defaultBase =
        provider === "volc_doubao"
          ? "https://ark.cn-beijing.volces.com"
          : "https://qianfan.baidubce.com/v2";
      const defaultModel =
        provider === "volc_doubao"
          ? "doubao-1-5-pro-32k-250115"
          : "ernie-4.5-turbo-128k";

      const cfg: ItLlmConfig = {
        provider,
        apiKey: llmForm.apiKey || "",
        baseUrl: llmForm.baseUrl || defaultBase,
        model: llmForm.model || defaultModel,
        temperature: Number(llmForm.temperature ?? 0.8),
        topP: Number(llmForm.topP ?? 0.8),
        timeoutSec: Number(llmForm.timeoutSec ?? 30),
        maxRetries: Number(llmForm.maxRetries ?? 0),
      };
      if (!cfg.apiKey) {
        throw new Error("缺少 LLM API Key");
      }
      const content = await it_callLlmChat(cfg, [
        { role: "system", content: "你是健康检查助手，请用12个字内回复“接口可用”" },
        { role: "user", content: "ping" },
      ]);
      return { ok: true, content };
    });
    this.webviewProtocol.on("it/testAsr", async (msg) => {
      const asrForm = msg.data?.asr || {};
      const provider = asrForm.provider || "baidu_vop";
      if (provider === "mock") {
        return { ok: true, content: asrForm.mockText || "mock 文本" };
      }
      if (provider !== "baidu_vop") {
        throw new Error("当前仅支持百度 ASR 测试。");
      }
      if (!asrForm.apiKey || !asrForm.secretKey) {
        throw new Error("缺少 ASR API Key 或 Secret Key。");
      }
      const sampleRate = 16000;
      const durationSec = 1;
      const buffer = Buffer.alloc(sampleRate * durationSec * 2, 0);
      const base64 = buffer.toString("base64");
      const text = await it_callBaiduAsr(
        {
          apiKey: asrForm.apiKey,
          secretKey: asrForm.secretKey,
          baseUrl: asrForm.baseUrl || "https://vop.baidu.com/server_api",
          devPid: Number(asrForm.devPid ?? 1537),
          language: asrForm.language || "zh",
          timeoutSec: Number(asrForm.timeoutSec ?? 30),
          maxRetries: Number(asrForm.maxRetries ?? 0),
        },
        {
          format: "pcm",
          rate: sampleRate,
          channel: 1,
          cuid: "it-asr-test",
          speech: base64,
          len: buffer.length,
        },
      );
      return { ok: true, content: text || "(无识别结果，接口可用)" };
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
    const bundled = typeof ffmpegStatic === "string" ? ffmpegStatic : null;
    if (bundled && fs.existsSync(bundled)) {
      return bundled;
    }
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

  private async it_detectDefaultInput(ffmpeg: string): Promise<string | null> {
    if (this.detectedInput) return this.detectedInput;
    const inputs = await this.it_listInputs(ffmpeg);
    if (inputs.length) {
      this.detectedInput = inputs[0];
      return this.detectedInput;
    }
    return null;
  }

  private async it_runFfmpegProbe(
    ffmpeg: string,
    args: string[],
  ): Promise<{ stderr: string; exitCode: number | null; exitSignal: string | null }> {
    return await new Promise((resolve) => {
      const child = spawn(ffmpeg, args, { windowsHide: true });
      let stderr = "";
      child.stderr?.on("data", (d) => {
        stderr += String(d);
      });
      let exitCode: number | null = null;
      let exitSignal: string | null = null;
      child.on("close", (code, signal) => {
        exitCode = code;
        exitSignal = signal;
        resolve({ stderr, exitCode, exitSignal });
      });
      child.on("error", (err) => {
        resolve({
          stderr: err instanceof Error ? err.message : String(err),
          exitCode,
          exitSignal,
        });
      });
    });
  }

  private async it_listInputs(ffmpeg: string): Promise<string[]> {
    if (this.availableInputs) return this.availableInputs;
    if (process.platform === "win32") {
      const scan = await this.it_runFfmpegProbe(ffmpeg, ["-list_devices", "true", "-f", "dshow", "-i", "dummy"]);
      const audioLines = scan.stderr
        .split(/\r?\n/)
        .filter((line) => line.includes("(audio)") && line.includes('"'));
      const parsed = audioLines
        .map((line) => {
          const match = line.match(/"([^"]+)"/);
          return match ? `audio=${match[1]}` : null;
        })
        .filter(Boolean) as string[];
      this.availableInputs = parsed;
      return parsed;
    }
    if (process.platform === "darwin") {
      const scan = await this.it_runFfmpegProbe(ffmpeg, [
        "-f",
        "avfoundation",
        "-list_devices",
        "true",
        "-i",
        '""',
      ]);
      const audioLines = scan.stderr
        .split(/\r?\n/)
        .filter((line) => /\[\d+\].*\(audio\)/.test(line));
      const parsed = audioLines
        .map((line) => {
          const match = line.match(/\[(\d+)\]\s+(.+?)\s+\(audio\)/);
          return match ? `:${match[1]}` : null;
        })
        .filter(Boolean) as string[];
      this.availableInputs = parsed;
      return parsed;
    }
    // Linux: 暂不枚举，直接使用默认
    this.availableInputs = [];
    return [];
  }

  private async it_startNativeRecording(deviceOverride?: string): Promise<{
    tmpDir: string;
    tmpPath: string;
    startedAt: number;
  }> {
    if (this.recordingChild) {
      throw new Error("recording already running");
    }
    const ffmpeg = await this.it_findFfmpeg();
    if (!ffmpeg) {
      throw new Error("未找到 ffmpeg，请先安装并配置环境变量或 IT_FFMPEG_PATH");
    }
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "it-record-"));
    const tmpPath = path.join(tmpDir, "capture.pcm");
    const commonArgs = ["-y", "-ac", "1", "-ar", "16000", "-f", "s16le", tmpPath];
    let inputArgs: string[];
    const customInput = deviceOverride || process.env.IT_FFMPEG_INPUT;
    const detectedInput =
      customInput ||
      (await this.it_detectDefaultInput(ffmpeg)) ||
      (process.platform === "win32" ? null : undefined);
    if (process.platform === "win32") {
      const device = detectedInput || "audio=default";
      inputArgs = ["-f", "dshow", "-i", device.startsWith("audio=") ? device : `audio=${device}`];
    } else if (process.platform === "darwin") {
      const device = detectedInput || ":0";
      inputArgs = ["-f", "avfoundation", "-i", device];
    } else {
      inputArgs = ["-f", "pulse", "-i", detectedInput || "default"];
    }
    const args = [...inputArgs, ...commonArgs];
    const child = spawn(ffmpeg, args, { windowsHide: true });
    let stderr = "";
    child.stderr?.on("data", (d) => {
      stderr += String(d);
    });
    let exitCode: number | null = null;
    let exitSignal: string | null = null;
    child.on("close", (code, signal) => {
      exitCode = code;
      exitSignal = signal;
      this.recordingExitInfo = { exitCode, exitSignal, stderr };
    });
    child.on("error", (err) => {
      this.recordingExitInfo = {
        exitCode: null,
        exitSignal: null,
        stderr: err instanceof Error ? err.message : String(err),
      };
    });
    this.recordingChild = child;
    this.recordingTempDir = tmpDir;
    this.recordingStartAt = Date.now();
    this.recordingExitInfo = null;

    // 若 ffmpeg 立即退出，短暂等待并提前报错。
    await new Promise((resolve) => setTimeout(resolve, 400));
    if (exitCode !== null) {
      const detail = `ffmpeg 启动失败，退出码=${exitCode ?? "未知"}, 信号=${exitSignal ?? "无"}, stderr=${stderr.trim() || "无"}`;
      this.recordingChild = null;
      this.recordingTempDir = null;
      this.recordingStartAt = null;
      throw new Error(detail);
    }

    return {
      tmpDir,
      tmpPath,
      startedAt: this.recordingStartAt,
    };
  }

  private async it_stopNativeRecording(): Promise<{
    audio: ItAnalyzeRequest["audio"];
    locked?: string[];
  }> {
    const tmpRoot = this.recordingTempDir;
    const child = this.recordingChild;
    if (!tmpRoot) {
      throw new Error("录音尚未开始或已被终止，请重新开始录音");
    }
    const tmpPath = path.join(tmpRoot, "capture.pcm");
    this.recordingChild = null;
    let killed = false;
    let exitCode: number | null = null;
    let exitSignal: string | null = null;
    let stderr = "";
    if (child) {
      child.stderr?.on("data", (d) => {
        stderr += String(d);
      });
      try {
        const exitPromise = new Promise<void>((resolve) => {
          child.on("close", (code, signal) => {
            exitCode = code;
            exitSignal = signal;
            resolve();
          });
        });
        if (child.stdin) {
          child.stdin.write("q\n");
        } else {
          child.kill("SIGTERM");
        }
        const completed = await Promise.race([
          exitPromise.then(() => true),
          new Promise<boolean>((resolve) =>
            setTimeout(() => resolve(false), 3000),
          ),
        ]);
        if (!completed) {
          if (!child.killed) {
            child.kill("SIGTERM");
            killed = true;
          }
          await exitPromise;
        }
      } catch {
        // ignore
      }
    } else if (this.recordingExitInfo) {
      exitCode = this.recordingExitInfo.exitCode;
      exitSignal = this.recordingExitInfo.exitSignal;
      stderr = this.recordingExitInfo.stderr;
    }

    if (!fs.existsSync(tmpPath)) {
      const detail =
        `ffmpeg 退出码=${exitCode ?? "未知"}, 信号=${exitSignal ?? "无"}, ` +
        `stderr=${stderr.trim() || "无"}`;
      throw new Error(
        `录音文件不存在${killed ? "（进程被强制结束）" : ""}，请检查麦克风设备或 ffmpeg 输入参数。${detail}`,
      );
    }
    const pcm = fs.readFileSync(tmpPath);
    const byteLength = pcm.byteLength;
    const durationSec = byteLength / (2 * 16000);

    // cleanup
    const locked: string[] = [];
    try {
      fs.rmSync(tmpRoot, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 50,
      });
    } catch (error) {
      locked.push(
        `${tmpRoot}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    this.recordingTempDir = null;
    this.recordingStartAt = null;

    return {
      audio: {
        format: "pcm",
        sampleRate: 16000,
        byteLength,
        durationSec,
        base64: pcm.toString("base64"),
      },
      locked: locked.length ? locked : undefined,
    };
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
      const workspaceRoot = this.requireWorkspaceRoot();
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
