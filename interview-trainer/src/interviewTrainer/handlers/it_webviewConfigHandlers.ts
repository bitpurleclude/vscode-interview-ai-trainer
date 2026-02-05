import path from "path";
import * as vscode from "vscode";
import { it_getUserProviderDir } from "../infra/api/it_apiConfig";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerConfigHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/saveTemplate", async (msg) => {
    const payload = msg.data || {};
    const template = payload.template;
    if (!template || !template.id) {
      throw new Error("missing template id");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.upsertTemplate(templatesConfig, env, template);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/deleteTemplate", async (msg) => {
    const templateId = String(msg.data?.templateId || "").trim();
    if (!templateId) {
      throw new Error("missing templateId");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.removeTemplate(templatesConfig, env, templateId);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateBindings", async (msg) => {
    const bindings = msg.data?.bindings || {};
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTemplateBindings(templatesConfig, env, bindings);
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateParamOptions", async (msg) => {
    const options = msg.data?.options || {};
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTemplateParamOptions(
      templatesConfig,
      env,
      options,
    );
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/saveTemplateSecret", async (msg) => {
    const payload = msg.data || {};
    const name = String(payload.name || "").trim();
    if (!name) {
      throw new Error("missing secret name");
    }
    const hasValue = Object.prototype.hasOwnProperty.call(payload, "value");
    const value = hasValue ? String(payload.value ?? "") : "";
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const envConfig = templatesConfig.environments?.[env] || {};
    const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
    templatesConfig = host.configService.saveTemplateSecrets(templatesConfig, env, [
      ...existing,
      name,
    ]);
    host.configService.saveTemplatesConfig(templatesConfig);
    if (hasValue) {
      await host.context.secrets.store(
        `interviewTrainer.${env}.secret.${name}`,
        value,
      );
    }
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/deleteTemplateSecret", async (msg) => {
    const name = String(msg.data?.name || "").trim();
    if (!name) {
      throw new Error("missing secret name");
    }
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const envConfig = templatesConfig.environments?.[env] || {};
    const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
    const nextSecrets = existing.filter((item: string) => item !== name);
    templatesConfig = host.configService.saveTemplateSecrets(
      templatesConfig,
      env,
      nextSecrets,
    );
    host.configService.saveTemplatesConfig(templatesConfig);
    await host.context.secrets.delete(`interviewTrainer.${env}.secret.${name}`);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/refreshToken", async (msg) => {
    const name = String(msg.data?.name || "").trim();
    if (!name) {
      throw new Error("missing token name");
    }
    await host.tokenService.refreshTokenByName(name);
    return { ok: true };
  });

  host.webviewProtocol.on("it/refreshAllTokens", async () => {
    await host.tokenService.refreshAll();
    return { ok: true };
  });

  host.webviewProtocol.on("it/setTokenAutoRefresh", async (msg) => {
    const enabled = msg.data?.enabled !== false;
    host.configBundle = host.configService.loadBundle();
    const env = host.configBundle.api.active?.environment || "prod";
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.saveTokenOptions(templatesConfig, env, {
      auto_refresh: Boolean(enabled),
    });
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/setActiveEnvironment", async (msg) => {
    const environment = String(msg.data?.environment || "").trim();
    if (!environment) {
      throw new Error("missing environment");
    }
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    apiConfig.environments = {
      ...(apiConfig.environments || {}),
      [environment]: apiConfig.environments?.[environment] || {},
    };
    apiConfig.active = {
      ...(apiConfig.active || { environment: "prod", llm: "", asr: "", acoustic: "api" }),
      environment,
    };
    host.configService.saveApiConfig(apiConfig);
    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    templatesConfig = host.configService.ensureTemplateEnvironment(
      templatesConfig,
      environment,
    );
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/createTemplateEnvironment", async (msg) => {
    const payload = msg.data || {};
    const environment = String(payload.environment || "").trim();
    if (!environment) {
      throw new Error("missing environment");
    }
    host.configBundle = host.configService.loadBundle();
    const currentEnv = host.configBundle.api.active?.environment || "prod";
    let apiConfig = { ...host.configBundle.api };
    if (apiConfig.environments?.[environment]) {
      throw new Error("environment already exists");
    }
    const sourceEnv =
      String(payload.cloneFrom || "").trim() ||
      (apiConfig.environments?.[currentEnv] ? currentEnv : "prod");
    const sourceApiEnv = apiConfig.environments?.[sourceEnv] || {};
    apiConfig.environments = {
      ...(apiConfig.environments || {}),
      [environment]: { ...sourceApiEnv },
    };
    apiConfig.active = {
      ...(apiConfig.active || { environment: "prod", llm: "", asr: "", acoustic: "api" }),
      environment,
    };
    host.configService.saveApiConfig(apiConfig);

    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    const sourceTemplateEnv = templatesConfig.environments?.[sourceEnv];
    if (sourceTemplateEnv) {
      const cloned = JSON.parse(JSON.stringify(sourceTemplateEnv));
      templatesConfig = host.configService.applyTemplateEnvConfig(
        templatesConfig,
        environment,
        cloned,
      );
    } else {
      templatesConfig = host.configService.ensureTemplateEnvironment(
        templatesConfig,
        environment,
      );
    }
    host.configService.saveTemplatesConfig(templatesConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/deleteTemplateEnvironment", async (msg) => {
    const environment = String(msg.data?.environment || "").trim();
    if (!environment) {
      throw new Error("missing environment");
    }
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    const envList = Object.keys(apiConfig.environments || {});
    if (!apiConfig.environments?.[environment]) {
      throw new Error("environment not found");
    }
    if (envList.length <= 1) {
      throw new Error("cannot delete the last environment");
    }
    const nextEnvs = { ...(apiConfig.environments || {}) };
    delete nextEnvs[environment];
    apiConfig.environments = nextEnvs;
    if (apiConfig.active?.environment === environment) {
      const nextActive = envList.find((item) => item !== environment) || "prod";
      apiConfig.active = {
        ...(apiConfig.active || { environment: "prod", llm: "", asr: "", acoustic: "api" }),
        environment: nextActive,
      };
    }
    host.configService.saveApiConfig(apiConfig);

    let templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
    if (templatesConfig.environments?.[environment]) {
      const nextTemplateEnvs = { ...(templatesConfig.environments || {}) };
      delete nextTemplateEnvs[environment];
      templatesConfig = {
        ...templatesConfig,
        environments: nextTemplateEnvs,
      };
      host.configService.saveTemplatesConfig(templatesConfig);
    }
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/updateTopicSettings", async (msg) => {
    const payload = msg.data || {};
    const incoming = payload.topics || {};
    host.configBundle = host.configService.loadBundle();
    const current = host.configBundle.skill.topics || {};
    const titleModeRaw = String(
      incoming.titleMode ?? incoming.title_mode ?? current.title_mode ?? "llm",
    );
    const titleMode = titleModeRaw === "simple" ? "simple" : "llm";
    const maxTitleLenRaw = Number(
      incoming.maxTitleLen ?? incoming.max_title_len ?? current.max_title_len ?? 18,
    );
    const maxTitleLen = Math.max(4, Math.min(18, maxTitleLenRaw));
    host.configBundle.skill = {
      ...host.configBundle.skill,
      topics: {
        ...current,
        title_mode: titleMode,
        max_title_len: maxTitleLen,
      },
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return { titleMode, maxTitleLen };
  });
  host.webviewProtocol.on("it/updateLlmTaskProfiles", async (msg) => {
    const payload = msg.data || {};
    const tasks = payload.tasks || {};
    host.configBundle = host.configService.loadBundle();
    host.configBundle.skill = host.configService.updateLlmTasks(
      host.configBundle.skill,
      tasks,
    );
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/saveLlmProfile", async (msg) => {
    const payload = msg.data || {};
    const profileId = String(payload.profileId || "").trim();
    if (!profileId || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
      throw new Error("profileId 只能包含字母、数字、_、-");
    }
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    const resolved = host.configService.resolveEnvironment(
      apiConfig,
      payload.environment,
    );
    const environment = resolved.environment;
    const envConfig = resolved.envConfig;
    const baseLlm = envConfig.llm || {};
    const incoming = payload.profile || {};
    const displayName = String(payload.displayName || "").trim();
    const nextProfile = host.configService.buildLlmProfile({
      incoming,
      baseLlm,
      fallbackProvider: apiConfig.active?.llm,
      profileId,
      displayName,
    });
    apiConfig = host.configService.upsertLlmProfile(
      apiConfig,
      environment,
      profileId,
      nextProfile,
    );
    host.configService.saveApiConfig(apiConfig);
    host.configBundle = host.configService.loadBundle();
    host.configBundle.api = apiConfig;
    host.configSnapshot = host.buildConfigSnapshot(apiConfig);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/deleteLlmProfile", async (msg) => {
    const payload = msg.data || {};
    const profileId = String(payload.profileId || "").trim();
    if (!profileId) {
      throw new Error("missing profileId");
    }
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    const resolved = host.configService.resolveEnvironment(
      apiConfig,
      payload.environment,
    );
    const environment = resolved.environment;
    apiConfig = host.configService.removeLlmProfile(apiConfig, environment, profileId);
    host.configService.saveApiConfig(apiConfig);
    host.configBundle = host.configService.loadBundle();
    host.configBundle.api = apiConfig;
    host.configSnapshot = host.buildConfigSnapshot(apiConfig);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/createProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
      throw new Error("providerId 只能包含字母、数字、_、-");
    }
    host.configBundle = host.configService.loadBundle();
    if (host.configBundle.providers?.[providerId]) {
      throw new Error("Provider 已存在");
    }
    const displayName = String(msg.data?.displayName || "").trim();
    const payload = {
      provider: providerId,
      display_name: displayName || providerId,
      llm: {
        provider: providerId,
        base_url: "",
        model: "",
        api_key: "",
        temperature: 0.8,
        top_p: 0.8,
        timeout_sec: 60,
        max_retries: 1,
      },
      embedding: {
        provider: providerId,
        base_url: "",
        model: "",
        api_key: "",
        timeout_sec: 30,
        max_retries: 1,
      },
      asr: {
        provider: "",
        base_url: "",
        api_key: "",
        secret_key: "",
        language: "zh",
        dev_pid: 1537,
        timeout_sec: 120,
        max_retries: 1,
      },
    };
    host.configService.saveProviderConfig(providerId, payload);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/saveProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId) {
      throw new Error("missing providerId");
    }
    const incoming = msg.data?.profile || {};
    host.configBundle = host.configService.loadBundle();
    const existing = host.configBundle.providers?.[providerId] || { provider: providerId };
    const next = {
      ...existing,
      ...incoming,
      provider: providerId,
      llm: {
        ...(existing.llm || {}),
        ...(incoming.llm || {}),
      },
      embedding: {
        ...(existing.embedding || {}),
        ...(incoming.embedding || {}),
      },
      asr: {
        ...(existing.asr || {}),
        ...(incoming.asr || {}),
      },
    };
    host.configService.saveProviderConfig(providerId, next);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/openProviderConfig", async (msg) => {
    const providerId = String(msg.data?.providerId || "").trim();
    if (!providerId) {
      return;
    }
    const providerDir = it_getUserProviderDir(host.context);
    const target = path.join(providerDir, `${providerId}.yaml`);
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
  });
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
    const current =
      kind && host.configBundle.skill?.[targetKey]
        ? String(host.configBundle.skill[targetKey])
        : "";
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
    host.configBundle.skill = {
      ...host.configBundle.skill,
      [targetKey]: normalized || ".",
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
  host.webviewProtocol.on("it/savePrompts", async (msg) => {
    const payload = msg.data || {};
    const evaluationPrompt = String(payload.evaluationPrompt || "");
    const demoPrompt = String(payload.demoPrompt || "");
    const answerModeRaw = String(payload.answerMode || "").trim();
    const answerMode =
      answerModeRaw === "single" || answerModeRaw === "two-step"
        ? answerModeRaw
        : undefined;
    const perQuestionSystemPrompts = Array.isArray(payload.perQuestionSystemPrompts)
      ? payload.perQuestionSystemPrompts.map((item: any) => String(item || "")).slice(0, 3)
      : [];
    const perQuestionDemoPrompts = Array.isArray(payload.perQuestionDemoPrompts)
      ? payload.perQuestionDemoPrompts.map((item: any) => String(item || "")).slice(0, 3)
      : [];
    host.configBundle = host.configService.loadBundle();
    const currentEvaluation = host.configBundle.skill.evaluation || {};
    host.configBundle.skill = {
      ...host.configBundle.skill,
      evaluation: {
        ...currentEvaluation,
        answer_mode: answerMode ?? currentEvaluation.answer_mode ?? "two-step",
      },
      prompts: {
        ...host.configBundle.skill.prompts,
        evaluation_prompt: evaluationPrompt,
        demo_prompt: demoPrompt,
        per_question_system_prompts: perQuestionSystemPrompts,
        per_question_demo_prompts: perQuestionDemoPrompts,
      },
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/updateStreamingSettings", async (msg) => {
    const payload = msg.data || {};
    const streaming = payload.streaming || {};
    const enabled = streaming.enabled !== false;
    const autoCollapse =
      streaming.autoCollapse ?? streaming.auto_collapse ?? streaming.auto_collapse_preview;
    const previewRaw = Number(streaming.previewChars ?? streaming.preview_chars ?? 200);
    const previewChars = Number.isFinite(previewRaw) ? Math.max(50, previewRaw) : 200;
    host.configBundle = host.configService.loadBundle();
    const current = host.configBundle.skill.streaming || {};
    host.configBundle.skill = {
      ...host.configBundle.skill,
      streaming: {
        ...current,
        enabled,
        auto_collapse: autoCollapse ?? current.auto_collapse ?? true,
        preview_chars: previewChars,
      },
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });
}
