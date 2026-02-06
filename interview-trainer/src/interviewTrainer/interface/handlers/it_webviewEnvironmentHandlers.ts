import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerEnvironmentHandlers(host: ItWebviewHandlersHost): void {
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

  host.webviewProtocol.on("it/updateAsrSettings", async (msg) => {
    const payload = msg.data || {};
    const incoming = payload.asr || {};
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    const resolved = host.configService.resolveEnvironment(
      apiConfig,
      payload.environment,
    );
    const environment = resolved.environment;
    const envConfig = resolved.envConfig;
    const current = envConfig.asr || {};
    const toNumber = (value: any, fallback: number) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const nextAsr = {
      ...current,
      language: String(incoming.language ?? incoming.lang ?? current.language ?? "zh"),
      dev_pid: Math.max(0, Math.floor(toNumber(incoming.devPid ?? incoming.dev_pid, current.dev_pid ?? 1537))),
      max_chunk_sec: Math.max(
        5,
        Math.floor(
          toNumber(incoming.maxChunkSec ?? incoming.max_chunk_sec, current.max_chunk_sec ?? 50),
        ),
      ),
      max_concurrency: Math.max(
        1,
        Math.floor(
          toNumber(
            incoming.maxConcurrency ?? incoming.max_concurrency,
            current.max_concurrency ?? 1,
          ),
        ),
      ),
      timeout_sec: Math.max(
        5,
        Math.floor(
          toNumber(incoming.timeoutSec ?? incoming.timeout_sec, current.timeout_sec ?? 120),
        ),
      ),
      max_retries: Math.max(
        0,
        Math.floor(
          toNumber(incoming.maxRetries ?? incoming.max_retries, current.max_retries ?? 1),
        ),
      ),
      mock_text: String(incoming.mockText ?? incoming.mock_text ?? current.mock_text ?? ""),
    };
    apiConfig.environments = {
      ...(apiConfig.environments || {}),
      [environment]: {
        ...envConfig,
        asr: nextAsr,
      },
    };
    host.configService.saveApiConfig(apiConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
  });

  host.webviewProtocol.on("it/updateLlmSettings", async (msg) => {
    const payload = msg.data || {};
    const incoming = payload.llm || {};
    host.configBundle = host.configService.loadBundle();
    let apiConfig = { ...host.configBundle.api };
    const resolved = host.configService.resolveEnvironment(
      apiConfig,
      payload.environment,
    );
    const environment = resolved.environment;
    const envConfig = resolved.envConfig;
    const current = envConfig.llm || {};
    const toNumber = (value: any, fallback: number) => {
      const num = Number(value);
      return Number.isFinite(num) ? num : fallback;
    };
    const nextLlm = {
      ...current,
      timeout_sec: Math.max(
        5,
        Math.floor(toNumber(incoming.timeoutSec ?? incoming.timeout_sec, current.timeout_sec ?? 60)),
      ),
      max_retries: Math.max(
        0,
        Math.floor(toNumber(incoming.maxRetries ?? incoming.max_retries, current.max_retries ?? 1)),
      ),
    };
    apiConfig.environments = {
      ...(apiConfig.environments || {}),
      [environment]: {
        ...envConfig,
        llm: nextLlm,
      },
    };
    host.configService.saveApiConfig(apiConfig);
    host.configBundle = host.configService.loadBundle();
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    return host.configSnapshot;
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
