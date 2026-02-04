import path from "path";
import * as vscode from "vscode";
import { it_getUserProviderDir } from "../api/it_apiConfig";
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
  host.webviewProtocol.on("it/updateApiSettings", async (msg) => {
    const payload = msg.data || {};
    host.configBundle = host.configService.loadBundle();
    const apiConfig = { ...host.configBundle.api };
    const resolved = host.configService.resolveEnvironment(
      apiConfig,
      payload.environment,
    );
    const environment = resolved.environment;
    const envConfig = resolved.envConfig;
    const storedLlmKey =
      (await host.context.secrets.get(`interviewTrainer.${environment}.llm.apiKey`)) ||
      "";
    const storedAsrKey =
      (await host.context.secrets.get(`interviewTrainer.${environment}.asr.apiKey`)) ||
      "";
    const storedAsrSecret =
      (await host.context.secrets.get(`interviewTrainer.${environment}.asr.secretKey`)) ||
      "";
    const llmForm = payload.llm || {};
    const asrForm = payload.asr || {};
    const llmProfiles = { ...(envConfig.llm_profiles || {}) };
    const asrProfiles = { ...(envConfig.asr_profiles || {}) };
    const providerHint =
      llmForm.provider || envConfig.llm?.provider || apiConfig.active?.llm;
    const isDoubao = providerHint === "volc_doubao";
    const llmDefaultBase = isDoubao
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
    const llmDefaultModel = isDoubao
      ? "doubao-seed-1-8-251228"
      : "ernie-4.5-turbo-128k";
    const nextLlm = host.configService.buildLlmConfigFromForm({
      form: llmForm,
      baseLlm: envConfig.llm || {},
      fallbackProvider: apiConfig.active?.llm,
      defaultBase: llmDefaultBase,
      defaultModel: llmDefaultModel,
      storedKey: storedLlmKey,
    });
    const nextAsr = host.configService.buildAsrConfigFromForm({
      form: asrForm,
      baseAsr: envConfig.asr || {},
      fallbackProvider: apiConfig.active?.asr,
      storedKey: storedAsrKey,
      storedSecret: storedAsrSecret,
    });

    llmProfiles[nextLlm.provider] = {
      ...nextLlm,
    };
    asrProfiles[nextAsr.provider] = {
      ...nextAsr,
    };
    const nextEnvConfig = {
      ...envConfig,
      llm: nextLlm,
      llm_provider: nextLlm.provider,
      asr: nextAsr,
      asr_provider: nextAsr.provider,
      llm_profiles: llmProfiles,
      asr_profiles: asrProfiles,
    };

    apiConfig.active = {
      ...apiConfig.active,
      environment,
      llm: nextLlm.provider || apiConfig.active?.llm || "baidu_qianfan",
      asr: nextAsr.provider || apiConfig.active?.asr || "baidu_vop",
    };
    apiConfig.environments = {
      ...apiConfig.environments,
      [environment]: nextEnvConfig,
    };

    await host.context.secrets.store(
      `interviewTrainer.${environment}.llm.apiKey`,
      nextLlm.api_key || "",
    );
    await host.context.secrets.store(
      `interviewTrainer.${environment}.asr.apiKey`,
      nextAsr.api_key || "",
    );
    await host.context.secrets.store(
      `interviewTrainer.${environment}.asr.secretKey`,
      nextAsr.secret_key || "",
    );

    const llmProvider = nextLlm.provider;
    if (llmProvider && llmProvider !== "heuristic") {
      const existing = host.configBundle.providers?.[llmProvider] || { provider: llmProvider };
      host.configService.saveProviderConfig(llmProvider, {
        ...existing,
        provider: llmProvider,
        llm: {
          ...(existing.llm || {}),
          ...nextLlm,
        },
      });
    }
    const asrProvider = nextAsr.provider;
    if (asrProvider && asrProvider !== "mock") {
      const existing = host.configBundle.providers?.[asrProvider] || { provider: asrProvider };
      host.configService.saveProviderConfig(asrProvider, {
        ...existing,
        provider: asrProvider,
        asr: {
          ...(existing.asr || {}),
          ...nextAsr,
        },
      });
    }

    host.configService.saveApiConfig(apiConfig);
    host.configBundle = host.configService.loadBundle();
    host.configBundle.api = apiConfig;
    host.configSnapshot = host.buildConfigSnapshot(apiConfig);
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
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
