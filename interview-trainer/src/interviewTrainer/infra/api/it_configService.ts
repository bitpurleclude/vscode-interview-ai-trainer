import * as vscode from "vscode";
import {
  ItApiConfig,
  ItConfigBundle,
  ItTemplatesConfig,
  it_loadConfigBundle,
  it_saveApiConfig,
  it_saveProviderConfig,
  it_saveSkillConfig,
  it_saveTemplatesConfig,
} from "./it_apiConfig";
import type {
  ItApiTemplate,
  ItTemplateBindings,
} from "../../../protocol/interviewTrainer";
import { it_resolveLlmMode } from "./it_configServiceHelpers";

type ItEnvResolution = {
  environment: string;
  envConfig: Record<string, any>;
};

export class ItConfigService {
  constructor(private context: vscode.ExtensionContext) {}

  loadBundle(): ItConfigBundle {
    return it_loadConfigBundle(this.context);
  }

  saveApiConfig(apiConfig: ItApiConfig): void {
    it_saveApiConfig(this.context, apiConfig);
  }

  saveSkillConfig(skillConfig: Record<string, any>): void {
    it_saveSkillConfig(this.context, skillConfig);
  }

  saveTemplatesConfig(templatesConfig: ItTemplatesConfig): void {
    it_saveTemplatesConfig(this.context, templatesConfig);
  }

  saveProviderConfig(providerId: string, payload: any): void {
    it_saveProviderConfig(this.context, providerId, payload);
  }

  resolveEnvironment(apiConfig: ItApiConfig, envInput?: string): ItEnvResolution {
    const environment =
      String(envInput || "").trim() || apiConfig.active?.environment || "prod";
    const envConfig = {
      ...(apiConfig.environments?.[environment] || {}),
    };
    return { environment, envConfig };
  }

  resolveTemplateEnvironment(
    templatesConfig: ItTemplatesConfig,
    envInput?: string,
  ): ItEnvResolution {
    const environment = String(envInput || "").trim() || "prod";
    const envConfig = {
      ...(templatesConfig.environments?.[environment] || {}),
    };
    return { environment, envConfig };
  }

  applyTemplateEnvConfig(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    envConfig: Record<string, any>,
  ): ItTemplatesConfig {
    return {
      ...templatesConfig,
      environments: {
        ...(templatesConfig.environments || {}),
        [environment]: envConfig,
      },
    };
  }

  ensureTemplateEnvironment(
    templatesConfig: ItTemplatesConfig,
    environment: string,
  ): ItTemplatesConfig {
    const existing = templatesConfig.environments?.[environment];
    if (existing) {
      return templatesConfig;
    }
    return this.applyTemplateEnvConfig(templatesConfig, environment, {
      templates: {},
      bindings: {
        llm: {},
        asr: {},
        embedding: {},
      },
      secrets: [],
      param_options: {
        reasoning_effort: ["low", "medium", "high", "xhigh"],
      },
      token_options: {
        auto_refresh: true,
      },
    });
  }

  upsertTemplate(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    template: ItApiTemplate,
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    const templates = { ...(envConfig.templates || {}) };
    templates[template.id] = template;
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      templates,
    });
  }

  removeTemplate(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    templateId: string,
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    const templates = { ...(envConfig.templates || {}) };
    if (templates[templateId]) {
      delete templates[templateId];
    }
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      templates,
    });
  }

  saveTemplateBindings(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    bindings: ItTemplateBindings,
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      bindings: {
        ...(envConfig.bindings || {}),
        ...(bindings || {}),
      },
    });
  }

  saveTemplateParamOptions(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    options: { reasoning_effort?: string[] },
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      param_options: {
        ...(envConfig.param_options || {}),
        ...(options || {}),
      },
    });
  }

  saveTokenOptions(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    options: { auto_refresh?: boolean },
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      token_options: {
        ...(envConfig.token_options || {}),
        ...(options || {}),
      },
    });
  }

  saveTemplateSecrets(
    templatesConfig: ItTemplatesConfig,
    environment: string,
    secretNames: string[],
  ): ItTemplatesConfig {
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    const cleaned = Array.from(new Set(secretNames.map((item) => String(item || "").trim())))
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
    return this.applyTemplateEnvConfig(ensured, environment, {
      ...envConfig,
      secrets: cleaned,
    });
  }

  async ensureTemplatesConfig(bundle: ItConfigBundle): Promise<ItConfigBundle> {
    const templatesConfig = bundle.templates || { version: 1, environments: {} };
    const env = bundle.api.active?.environment || "prod";
    const ensured = this.ensureTemplateEnvironment(templatesConfig, env);
    if (ensured === templatesConfig) {
      return bundle;
    }
    this.saveTemplatesConfig(ensured);
    return {
      ...bundle,
      templates: ensured,
    };
  }

  applyEnvConfig(apiConfig: ItApiConfig, environment: string, envConfig: Record<string, any>): ItApiConfig {
    return {
      ...apiConfig,
      environments: {
        ...apiConfig.environments,
        [environment]: envConfig,
      },
    };
  }

  updateLlmTasks(skillConfig: Record<string, any>, tasks: Record<string, any>): Record<string, any> {
    const current = skillConfig.llm_tasks || {};
    return {
      ...skillConfig,
      llm_tasks: {
        ...current,
        question_parse: String(tasks.questionParse || tasks.question_parse || "").trim(),
        segment: String(tasks.segment || "").trim(),
        evaluation: String(tasks.evaluation || "").trim(),
      },
    };
  }

  buildLlmProfile(args: {
    incoming: Record<string, any>;
    baseLlm: Record<string, any>;
    fallbackProvider?: string;
    profileId: string;
    displayName?: string;
  }): Record<string, any> {
    const { incoming, baseLlm, fallbackProvider, profileId, displayName } = args;
    const { apiMode, useResponses } = it_resolveLlmMode(incoming, baseLlm);
    return {
      provider:
        incoming.provider ||
        baseLlm.provider ||
        fallbackProvider ||
        "baidu_qianfan",
      base_url: incoming.baseUrl ?? incoming.base_url ?? baseLlm.base_url ?? "",
      model: incoming.model ?? baseLlm.model ?? "",
      api_key: incoming.apiKey ?? incoming.api_key ?? "",
      temperature: Number(incoming.temperature ?? baseLlm.temperature ?? 0.8),
      top_p: Number(incoming.topP ?? incoming.top_p ?? baseLlm.top_p ?? 0.8),
      timeout_sec: Number(incoming.timeoutSec ?? incoming.timeout_sec ?? baseLlm.timeout_sec ?? 60),
      max_retries: Number(incoming.maxRetries ?? incoming.max_retries ?? baseLlm.max_retries ?? 1),
      anti_repeat: Boolean(
        incoming.antiRepeat ??
          incoming.anti_repeat ??
          baseLlm.anti_repeat ??
          baseLlm.antiRepeat ??
          false,
      ),
      use_responses: useResponses,
      api_mode: apiMode ?? baseLlm.api_mode ?? baseLlm.apiMode ?? undefined,
      responses_path:
        incoming.responsesPath ??
        incoming.responses_path ??
        baseLlm.responses_path ??
        baseLlm.responsesPath ??
        "",
      reasoning_effort:
        incoming.reasoningEffort ??
        incoming.reasoning_effort ??
        baseLlm.reasoning_effort ??
        baseLlm.reasoningEffort,
      max_output_tokens: Number(
        incoming.maxOutputTokens ??
          incoming.max_output_tokens ??
          baseLlm.max_output_tokens ??
          baseLlm.maxOutputTokens ??
          0,
      ),
      reuse_prefix: Boolean(
        incoming.reusePrefix ??
          incoming.reuse_prefix ??
          baseLlm.reuse_prefix ??
          baseLlm.reusePrefix ??
          false,
      ),
      display_name: displayName || profileId,
    };
  }

  upsertLlmProfile(
    apiConfig: ItApiConfig,
    environment: string,
    profileId: string,
    profile: Record<string, any>,
  ): ItApiConfig {
    const envConfig = {
      ...(apiConfig.environments?.[environment] || {}),
    };
    const llmProfiles = { ...(envConfig.llm_profiles || {}) };
    llmProfiles[profileId] = profile;
    return this.applyEnvConfig(apiConfig, environment, {
      ...envConfig,
      llm_profiles: llmProfiles,
    });
  }

  removeLlmProfile(
    apiConfig: ItApiConfig,
    environment: string,
    profileId: string,
  ): ItApiConfig {
    const envConfig = {
      ...(apiConfig.environments?.[environment] || {}),
    };
    const llmProfiles = { ...(envConfig.llm_profiles || {}) };
    if (llmProfiles[profileId]) {
      delete llmProfiles[profileId];
    }
    return this.applyEnvConfig(apiConfig, environment, {
      ...envConfig,
      llm_profiles: llmProfiles,
    });
  }

}
