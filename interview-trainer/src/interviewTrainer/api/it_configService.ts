import * as vscode from "vscode";
import {
  ItApiConfig,
  ItConfigBundle,
  it_loadConfigBundle,
  it_saveApiConfig,
  it_saveProviderConfig,
  it_saveSkillConfig,
} from "./it_apiConfig";

type ItResolvedApiMode = {
  apiMode?: "chat" | "responses";
  useResponses: boolean;
};

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
    const { apiMode, useResponses } = this.resolveLlmMode(incoming, baseLlm);
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
      tools_preset:
        incoming.toolsPreset ??
        incoming.tools_preset ??
        baseLlm.tools_preset ??
        baseLlm.toolsPreset ??
        "",
      web_search: Boolean(
        incoming.webSearch ??
          incoming.web_search ??
          baseLlm.web_search ??
          baseLlm.webSearch ??
          false,
      ),
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

  buildLlmConfigFromForm(args: {
    form: Record<string, any>;
    baseLlm: Record<string, any>;
    fallbackProvider?: string;
    defaultBase: string;
    defaultModel: string;
    storedKey?: string;
  }): Record<string, any> {
    const { form, baseLlm, fallbackProvider, defaultBase, defaultModel, storedKey } = args;
    const { apiMode, useResponses } = this.resolveLlmMode(form, baseLlm);
    return {
      ...(baseLlm || {}),
      provider:
        form.provider ||
        baseLlm.provider ||
        fallbackProvider ||
        "baidu_qianfan",
      base_url: form.baseUrl ?? baseLlm.base_url ?? defaultBase,
      model: form.model ?? baseLlm.model ?? defaultModel,
      api_key: this.firstNonEmpty(form.apiKey, baseLlm.api_key, storedKey),
      temperature: Number(form.temperature ?? baseLlm.temperature ?? 0.8),
      top_p: Number(form.topP ?? baseLlm.top_p ?? 0.8),
      timeout_sec: Number(form.timeoutSec ?? baseLlm.timeout_sec ?? 60),
      max_retries: Number(form.maxRetries ?? baseLlm.max_retries ?? 1),
      anti_repeat: Boolean(
        form.antiRepeat ?? baseLlm.anti_repeat ?? baseLlm.antiRepeat ?? false,
      ),
      use_responses: useResponses,
      api_mode: apiMode ?? baseLlm.api_mode ?? baseLlm.apiMode ?? undefined,
      responses_path:
        form.responsesPath ??
        baseLlm.responses_path ??
        baseLlm.responsesPath ??
        "",
      tools_preset:
        form.toolsPreset ?? baseLlm.tools_preset ?? baseLlm.toolsPreset ?? "",
      reasoning_effort:
        form.reasoningEffort ?? baseLlm.reasoning_effort ?? baseLlm.reasoningEffort,
      max_output_tokens: Number(
        form.maxOutputTokens ??
          baseLlm.max_output_tokens ??
          baseLlm.maxOutputTokens ??
          800,
      ),
      web_search: Boolean(
        form.webSearch ?? baseLlm.web_search ?? baseLlm.webSearch ?? false,
      ),
      reuse_prefix: Boolean(
        form.reusePrefix ?? baseLlm.reuse_prefix ?? baseLlm.reusePrefix ?? false,
      ),
    };
  }

  buildAsrConfigFromForm(args: {
    form: Record<string, any>;
    baseAsr: Record<string, any>;
    fallbackProvider?: string;
    storedKey?: string;
    storedSecret?: string;
  }): Record<string, any> {
    const { form, baseAsr, fallbackProvider, storedKey, storedSecret } = args;
    return {
      ...(baseAsr || {}),
      provider:
        form.provider ||
        baseAsr.provider ||
        fallbackProvider ||
        "baidu_vop",
      base_url: form.baseUrl ?? baseAsr.base_url ?? "https://vop.baidu.com/server_api",
      api_key: this.firstNonEmpty(form.apiKey, baseAsr.api_key, storedKey),
      secret_key: this.firstNonEmpty(form.secretKey, baseAsr.secret_key, storedSecret),
      mock_text: form.mockText ?? baseAsr.mock_text ?? "",
      language: form.language ?? baseAsr.language ?? "zh",
      dev_pid: Number(form.devPid ?? baseAsr.dev_pid ?? 1537),
      max_chunk_sec: Number(form.maxChunkSec ?? baseAsr.max_chunk_sec ?? 50),
      max_concurrency: Number(form.maxConcurrency ?? baseAsr.max_concurrency ?? 1),
      timeout_sec: Number(form.timeoutSec ?? baseAsr.timeout_sec ?? 120),
      max_retries: Number(form.maxRetries ?? baseAsr.max_retries ?? 1),
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

  private resolveLlmMode(incoming?: Record<string, any>, base?: Record<string, any>): ItResolvedApiMode {
    const apiModeRaw = incoming?.apiMode ?? incoming?.api_mode ?? base?.api_mode ?? base?.apiMode;
    const resolvedApiMode = apiModeRaw
      ? String(apiModeRaw).toLowerCase() === "responses"
        ? "responses"
        : "chat"
      : undefined;
    const resolvedUseResponses =
      resolvedApiMode === "responses"
        ? true
        : resolvedApiMode === "chat"
          ? false
          : Boolean(
              incoming?.useResponses ??
                incoming?.use_responses ??
                base?.use_responses ??
                base?.useResponses ??
                false,
            );
    return { apiMode: resolvedApiMode, useResponses: resolvedUseResponses };
  }

  private firstNonEmpty(...values: Array<string | undefined | null>): string {
    for (const value of values) {
      if (typeof value === "string" && value.trim()) {
        return value;
      }
    }
    return "";
  }
}
