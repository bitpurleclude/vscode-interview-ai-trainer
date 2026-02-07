import type { ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import type {
  ItApiConfig,
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";

export type ItEnvironmentConfigContext = {
  configBundle: ItConfigBundle;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
};

export type ItEnvironmentConfigResult<T = ItConfigSnapshot> = {
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  value: T;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_toFiniteInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.floor(parsed);
}

function it_toStringArray(value: unknown, limit: number): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || "")).slice(0, limit);
}

async function it_withRefreshedSnapshot(
  context: ItEnvironmentConfigContext,
  configBundle: ItConfigBundle,
): Promise<ItEnvironmentConfigResult> {
  const configSnapshot = await context.refreshConfigSnapshot();
  return { configBundle, configSnapshot, value: configSnapshot };
}

export async function it_setActiveEnvironment(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const environment = String(data.environment || "").trim();
  if (!environment) {
    throw new Error("missing environment");
  }

  const configBundle = context.configService.loadBundle();
  const apiConfig = { ...configBundle.api };
  apiConfig.environments = {
    ...(apiConfig.environments || {}),
    [environment]: apiConfig.environments?.[environment] || {},
  };
  apiConfig.active = {
    ...(apiConfig.active || { environment: "prod", llm: "", asr: "", acoustic: "api" }),
    environment,
  };
  context.configService.saveApiConfig(apiConfig);

  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = context.configService.ensureTemplateEnvironment(templatesConfig, environment);
  context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = context.configService.loadBundle();
  return it_withRefreshedSnapshot(context, nextBundle);
}

export async function it_createTemplateEnvironment(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const environment = String(data.environment || "").trim();
  if (!environment) {
    throw new Error("missing environment");
  }

  const configBundle = context.configService.loadBundle();
  const currentEnv = configBundle.api.active?.environment || "prod";
  const apiConfig = { ...configBundle.api };
  if (apiConfig.environments?.[environment]) {
    throw new Error("environment already exists");
  }

  const sourceEnv =
    String(data.cloneFrom || "").trim() ||
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
  context.configService.saveApiConfig(apiConfig);

  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const sourceTemplateEnv = templatesConfig.environments?.[sourceEnv];
  if (sourceTemplateEnv) {
    const cloned = JSON.parse(JSON.stringify(sourceTemplateEnv));
    templatesConfig = context.configService.applyTemplateEnvConfig(
      templatesConfig,
      environment,
      cloned,
    );
  } else {
    templatesConfig = context.configService.ensureTemplateEnvironment(templatesConfig, environment);
  }
  context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = context.configService.loadBundle();
  return it_withRefreshedSnapshot(context, nextBundle);
}

export async function it_deleteTemplateEnvironment(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const environment = String(data.environment || "").trim();
  if (!environment) {
    throw new Error("missing environment");
  }

  const configBundle = context.configService.loadBundle();
  const apiConfig = { ...configBundle.api };
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
  context.configService.saveApiConfig(apiConfig);

  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  if (templatesConfig.environments?.[environment]) {
    const nextTemplateEnvs = { ...(templatesConfig.environments || {}) };
    delete nextTemplateEnvs[environment];
    templatesConfig = {
      ...templatesConfig,
      environments: nextTemplateEnvs,
    };
    context.configService.saveTemplatesConfig(templatesConfig);
  }

  const nextBundle = context.configService.loadBundle();
  return it_withRefreshedSnapshot(context, nextBundle);
}

export async function it_updateTopicSettings(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult<{ titleMode: "simple" | "llm"; maxTitleLen: number }>> {
  const data = it_asRecord(payload);
  const incoming = it_asRecord(data.topics);
  const configBundle = context.configService.loadBundle();
  const current = configBundle.skill.topics || {};
  const titleModeRaw = String(
    incoming.titleMode ?? incoming.title_mode ?? current.title_mode ?? "llm",
  );
  const titleMode = titleModeRaw === "simple" ? "simple" : "llm";
  const maxTitleLenRaw = Number(
    incoming.maxTitleLen ?? incoming.max_title_len ?? current.max_title_len ?? 18,
  );
  const maxTitleLen = Math.max(4, Math.min(18, maxTitleLenRaw));

  configBundle.skill = {
    ...configBundle.skill,
    topics: {
      ...current,
      title_mode: titleMode,
      max_title_len: maxTitleLen,
    },
  };
  context.configService.saveSkillConfig(configBundle.skill);

  const configSnapshot = await context.refreshConfigSnapshot();
  return {
    configBundle,
    configSnapshot,
    value: { titleMode, maxTitleLen },
  };
}

export async function it_updateAsrSettings(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const incoming = it_asRecord(data.asr);
  const configBundle = context.configService.loadBundle();
  const apiConfig = { ...configBundle.api };
  const environmentHint =
    typeof data.environment === "string" ? data.environment : undefined;
  const resolved = context.configService.resolveEnvironment(apiConfig, environmentHint);
  const environment = resolved.environment;
  const envConfig = resolved.envConfig;
  const current = envConfig.asr || {};

  const nextAsr = {
    ...current,
    language: String(incoming.language ?? incoming.lang ?? current.language ?? "zh"),
    dev_pid: Math.max(
      0,
      it_toFiniteInt(incoming.devPid ?? incoming.dev_pid, current.dev_pid ?? 1537),
    ),
    max_chunk_sec: Math.max(
      5,
      it_toFiniteInt(incoming.maxChunkSec ?? incoming.max_chunk_sec, current.max_chunk_sec ?? 50),
    ),
    max_concurrency: Math.max(
      1,
      it_toFiniteInt(incoming.maxConcurrency ?? incoming.max_concurrency, current.max_concurrency ?? 1),
    ),
    timeout_sec: Math.max(
      5,
      it_toFiniteInt(incoming.timeoutSec ?? incoming.timeout_sec, current.timeout_sec ?? 120),
    ),
    max_retries: Math.max(
      0,
      it_toFiniteInt(incoming.maxRetries ?? incoming.max_retries, current.max_retries ?? 1),
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
  context.configService.saveApiConfig(apiConfig);

  const nextBundle = context.configService.loadBundle();
  return it_withRefreshedSnapshot(context, nextBundle);
}

export async function it_updateLlmSettings(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const incoming = it_asRecord(data.llm);
  const configBundle = context.configService.loadBundle();
  const apiConfig = { ...configBundle.api };
  const environmentHint =
    typeof data.environment === "string" ? data.environment : undefined;
  const resolved = context.configService.resolveEnvironment(apiConfig, environmentHint);
  const environment = resolved.environment;
  const envConfig = resolved.envConfig;
  const current = envConfig.llm || {};

  const nextLlm = {
    ...current,
    timeout_sec: Math.max(
      5,
      it_toFiniteInt(incoming.timeoutSec ?? incoming.timeout_sec, current.timeout_sec ?? 60),
    ),
    max_retries: Math.max(
      0,
      it_toFiniteInt(incoming.maxRetries ?? incoming.max_retries, current.max_retries ?? 1),
    ),
  };

  apiConfig.environments = {
    ...(apiConfig.environments || {}),
    [environment]: {
      ...envConfig,
      llm: nextLlm,
    },
  };
  context.configService.saveApiConfig(apiConfig);

  const nextBundle = context.configService.loadBundle();
  return it_withRefreshedSnapshot(context, nextBundle);
}

export async function it_updateLlmTaskProfiles(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const tasks = it_asRecord(data.tasks);
  const configBundle = context.configService.loadBundle();

  configBundle.skill = context.configService.updateLlmTasks(configBundle.skill, tasks);
  context.configService.saveSkillConfig(configBundle.skill);

  return it_withRefreshedSnapshot(context, configBundle);
}

export async function it_saveLlmProfile(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const profileId = String(data.profileId || "").trim();
  if (!profileId || !/^[a-zA-Z0-9_-]+$/.test(profileId)) {
    throw new Error("profileId ??????????_?-");
  }

  const configBundle = context.configService.loadBundle();
  let apiConfig = { ...configBundle.api };
  const environmentHint =
    typeof data.environment === "string" ? data.environment : undefined;
  const resolved = context.configService.resolveEnvironment(apiConfig, environmentHint);
  const environment = resolved.environment;
  const envConfig = resolved.envConfig;
  const baseLlm = envConfig.llm || {};
  const incoming = it_asRecord(data.profile);
  const displayName = String(data.displayName || "").trim();

  const nextProfile = context.configService.buildLlmProfile({
    incoming,
    baseLlm,
    fallbackProvider: apiConfig.active?.llm,
    profileId,
    displayName,
  });
  apiConfig = context.configService.upsertLlmProfile(
    apiConfig,
    environment,
    profileId,
    nextProfile,
  );
  context.configService.saveApiConfig(apiConfig);

  const nextBundle = context.configService.loadBundle();
  nextBundle.api = apiConfig;
  const configSnapshot = context.buildConfigSnapshot(apiConfig);
  return { configBundle: nextBundle, configSnapshot, value: configSnapshot };
}

export async function it_deleteLlmProfile(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const profileId = String(data.profileId || "").trim();
  if (!profileId) {
    throw new Error("missing profileId");
  }

  const configBundle = context.configService.loadBundle();
  let apiConfig = { ...configBundle.api };
  const environmentHint =
    typeof data.environment === "string" ? data.environment : undefined;
  const resolved = context.configService.resolveEnvironment(apiConfig, environmentHint);
  const environment = resolved.environment;
  apiConfig = context.configService.removeLlmProfile(apiConfig, environment, profileId);
  context.configService.saveApiConfig(apiConfig);

  const nextBundle = context.configService.loadBundle();
  nextBundle.api = apiConfig;
  const configSnapshot = context.buildConfigSnapshot(apiConfig);
  return { configBundle: nextBundle, configSnapshot, value: configSnapshot };
}

export async function it_savePrompts(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const evaluationPrompt = String(data.evaluationPrompt || "");
  const demoPrompt = String(data.demoPrompt || "");
  const answerModeRaw = String(data.answerMode || "").trim();
  const answerMode =
    answerModeRaw === "single" || answerModeRaw === "two-step"
      ? answerModeRaw
      : undefined;
  const perQuestionSystemPrompts = it_toStringArray(data.perQuestionSystemPrompts, 3);
  const perQuestionDemoPrompts = it_toStringArray(data.perQuestionDemoPrompts, 3);

  const configBundle = context.configService.loadBundle();
  const currentEvaluation = configBundle.skill.evaluation || {};
  configBundle.skill = {
    ...configBundle.skill,
    evaluation: {
      ...currentEvaluation,
      answer_mode: answerMode ?? currentEvaluation.answer_mode ?? "two-step",
    },
    prompts: {
      ...configBundle.skill.prompts,
      evaluation_prompt: evaluationPrompt,
      demo_prompt: demoPrompt,
      per_question_system_prompts: perQuestionSystemPrompts,
      per_question_demo_prompts: perQuestionDemoPrompts,
    },
  };
  context.configService.saveSkillConfig(configBundle.skill);

  return it_withRefreshedSnapshot(context, configBundle);
}

export async function it_updateStreamingSettings(
  context: ItEnvironmentConfigContext,
  payload: unknown,
): Promise<ItEnvironmentConfigResult> {
  const data = it_asRecord(payload);
  const streaming = it_asRecord(data.streaming);
  const enabled = streaming.enabled !== false;
  const autoCollapse =
    streaming.autoCollapse ?? streaming.auto_collapse ?? streaming.auto_collapse_preview;
  const previewRaw = Number(streaming.previewChars ?? streaming.preview_chars ?? 200);
  const previewChars = Number.isFinite(previewRaw) ? Math.max(50, previewRaw) : 200;

  const configBundle = context.configService.loadBundle();
  const current = configBundle.skill.streaming || {};
  configBundle.skill = {
    ...configBundle.skill,
    streaming: {
      ...current,
      enabled,
      auto_collapse: autoCollapse ?? current.auto_collapse ?? true,
      preview_chars: previewChars,
    },
  };
  context.configService.saveSkillConfig(configBundle.skill);

  return it_withRefreshedSnapshot(context, configBundle);
}
