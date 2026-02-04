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
  ItTemplateCategory,
  ItTemplateRequest,
  ItTemplateResponse,
  ItTemplateStreaming,
} from "../../protocol/interviewTrainer";

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
      param_options: {
        reasoning_effort: ["low", "medium", "high", "xhigh"],
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

  async ensureTemplatesConfig(bundle: ItConfigBundle): Promise<ItConfigBundle> {
    const templatesConfig = bundle.templates || { version: 1, environments: {} };
    const env = bundle.api.active?.environment || "prod";
    const envConfig = templatesConfig.environments?.[env];
    const hasTemplates = Boolean(
      envConfig && envConfig.templates && Object.keys(envConfig.templates).length > 0,
    );
    if (hasTemplates) {
      return bundle;
    }
    const migrated = await this.migrateTemplatesFromLegacy(bundle, env);
    if (!migrated) {
      return bundle;
    }
    this.saveTemplatesConfig(migrated);
    return {
      ...bundle,
      templates: migrated,
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

  private buildTemplateId(category: ItTemplateCategory, rawId: string): string {
    const cleaned = String(rawId || "default").trim() || "default";
    return `${category}:${cleaned}`;
  }

  private buildTemplateBaseHeaders(): Record<string, string> {
    return {
      Authorization: "Bearer {{apiKey}}",
      "Content-Type": "application/json",
    };
  }

  private buildOpenAiChatUrl(base: string): string {
    const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    return trimmed.toLowerCase().endsWith("/chat/completions")
      ? trimmed
      : `${trimmed}/chat/completions`;
  }

  private buildOpenAiResponsesUrl(base: string, responsesPath?: string): string {
    const trimmed = (base || "https://api.openai.com/v1").trim().replace(/\/$/, "");
    const path = String(responsesPath || "").trim();
    if (path) {
      if (/^https?:\/\//i.test(path)) {
        return path.replace(/\/$/, "");
      }
      return `${trimmed}${path.startsWith("/") ? path : `/${path}`}`;
    }
    return trimmed.toLowerCase().endsWith("/responses")
      ? trimmed
      : `${trimmed}/responses`;
  }

  private buildDoubaoChatUrl(base: string): string {
    const trimmed = (base || "https://ark.cn-beijing.volces.com").trim().replace(/\/$/, "");
    const lower = trimmed.toLowerCase();
    if (lower.includes("/api/v3/chat/completions") || lower.endsWith("/chat/completions")) {
      return trimmed;
    }
    if (lower.endsWith("/api/v3")) {
      return `${trimmed}/chat/completions`;
    }
    if (lower.endsWith("/api/v3/chat")) {
      return `${trimmed}/completions`;
    }
    return `${trimmed}/api/v3/chat/completions`;
  }

  private buildDoubaoResponsesUrl(base: string): string {
    const trimmed = (base || "https://ark.cn-beijing.volces.com").trim().replace(/\/$/, "");
    const lower = trimmed.toLowerCase();
    if (lower.includes("/api/v3/responses") || lower.endsWith("/responses")) {
      return trimmed;
    }
    if (lower.endsWith("/api/v3")) {
      return `${trimmed}/responses`;
    }
    if (lower.endsWith("/api/v3/")) {
      return `${trimmed}responses`;
    }
    return `${trimmed}/api/v3/responses`;
  }

  private buildLlmTemplateFromConfig(args: {
    id: string;
    name: string;
    llm: Record<string, any>;
  }): ItApiTemplate {
    const { id, name, llm } = args;
    const { apiMode, useResponses } = this.resolveLlmMode(llm, llm);
    const provider = llm.provider || "openai_compatible";
    const mode = apiMode ?? (useResponses ? "responses" : "chat");
    const baseUrl = llm.base_url || llm.baseUrl || "";
    const responsesPath = llm.responses_path ?? llm.responsesPath ?? "";
    const url =
      provider === "volc_doubao"
        ? mode === "responses"
          ? this.buildDoubaoResponsesUrl(baseUrl)
          : this.buildDoubaoChatUrl(baseUrl)
        : mode === "responses"
          ? this.buildOpenAiResponsesUrl(baseUrl, responsesPath)
          : this.buildOpenAiChatUrl(baseUrl);

    const request: ItTemplateRequest = {
      method: "POST",
      url,
      headers: this.buildTemplateBaseHeaders(),
      body:
        mode === "responses"
          ? {
              model: llm.model || "",
              input: "{{input}}",
              instructions: "{{instructions}}",
              stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
              reasoning:
                llm.reasoning_effort || llm.reasoningEffort
                  ? { effort: llm.reasoning_effort ?? llm.reasoningEffort }
                  : undefined,
            }
          : {
              model: llm.model || "",
              messages: "{{messages}}",
              temperature: Number(llm.temperature ?? 0.8),
              top_p: Number(llm.top_p ?? 0.8),
              stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
            },
    };

    const response: ItTemplateResponse = {
      mode: mode === "responses" ? "sse" : "json",
      textPath: mode === "responses" ? "output_text" : "choices[0].message.content",
    };

    const streaming: ItTemplateStreaming =
      mode === "responses"
        ? { dataPrefix: "data:", deltaPath: "output_text", doneSignals: ["[DONE]"] }
        : {
            dataPrefix: "data:",
            deltaPath: "choices[0].delta.content",
            doneSignals: ["[DONE]"],
          };

    return {
      id: this.buildTemplateId("llm", id),
      name,
      category: "llm",
      request,
      response,
      streaming,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildAsrTemplateFromConfig(args: {
    id: string;
    name: string;
    asr: Record<string, any>;
  }): ItApiTemplate {
    const { id, name, asr } = args;
    const request: ItTemplateRequest = {
      method: "POST",
      url: asr.base_url || asr.baseUrl || "",
      headers: {
        "Content-Type": "application/json",
      },
      body: {
        audio: "{{audioFile}}",
        lang: "{{asr.lang}}",
        dev_pid: "{{asr.dev_pid}}",
      },
      timeoutSec: Number(asr.timeout_sec ?? asr.timeoutSec ?? 120),
    };
    const response: ItTemplateResponse = {
      mode: "json",
      textPath: "result[0]",
    };
    return {
      id: this.buildTemplateId("asr", id),
      name,
      category: "asr",
      request,
      response,
      updatedAt: new Date().toISOString(),
    };
  }

  private buildEmbeddingTemplateFromConfig(args: {
    id: string;
    name: string;
    vector: Record<string, any>;
  }): ItApiTemplate {
    const { id, name, vector } = args;
    const request: ItTemplateRequest = {
      method: "POST",
      url: vector.base_url || vector.baseUrl || "",
      headers: this.buildTemplateBaseHeaders(),
      body: {
        model: vector.model || "",
        input: "{{embeddingInput}}",
      },
      timeoutSec: Number(vector.timeout_sec ?? vector.timeoutSec ?? 30),
    };
    const response: ItTemplateResponse = {
      mode: "json",
      textPath: "data[0].embedding",
    };
    return {
      id: this.buildTemplateId("embedding", id),
      name,
      category: "embedding",
      request,
      response,
      updatedAt: new Date().toISOString(),
    };
  }

  private async migrateTemplatesFromLegacy(
    bundle: ItConfigBundle,
    environment: string,
  ): Promise<ItTemplatesConfig | null> {
    const templatesConfig: ItTemplatesConfig = bundle.templates || {
      version: 1,
      environments: {},
    };
    const ensured = this.ensureTemplateEnvironment(templatesConfig, environment);
    const envConfig = ensured.environments?.[environment] || {};
    const apiEnv = bundle.api.environments?.[environment] || {};
    const skillConfig = bundle.skill || {};

    const templates: Record<string, ItApiTemplate> = { ...(envConfig.templates || {}) };
    const bindings: ItTemplateBindings = {
      ...(envConfig.bindings || {}),
      llm: { ...(envConfig.bindings?.llm || {}) },
      asr: { ...(envConfig.bindings?.asr || {}) },
      embedding: { ...(envConfig.bindings?.embedding || {}) },
    };

    const llmProfileIdMap: Record<string, string> = {};
    const baseLlm = apiEnv.llm || {};
    if (Object.keys(baseLlm).length) {
      const template = this.buildLlmTemplateFromConfig({
        id: "default",
        name: "LLM / 默认",
        llm: baseLlm,
      });
      templates[template.id] = template;
      llmProfileIdMap.default = template.id;
      const key = String(baseLlm.api_key || baseLlm.apiKey || "").trim();
      if (key) {
        await this.context.secrets.store(
          `interviewTrainer.${environment}.template.${template.id}.apiKey`,
          key,
        );
      }
    }

    const profiles = apiEnv.llm_profiles || {};
    for (const profileId of Object.keys(profiles)) {
      const profile = profiles[profileId] || {};
      const template = this.buildLlmTemplateFromConfig({
        id: profileId,
        name: `LLM / ${profileId}`,
        llm: profile,
      });
      templates[template.id] = template;
      llmProfileIdMap[profileId] = template.id;
      const key = String(profile.api_key || profile.apiKey || "").trim();
      if (key) {
        await this.context.secrets.store(
          `interviewTrainer.${environment}.template.${template.id}.apiKey`,
          key,
        );
      }
    }

    const tasks = skillConfig.llm_tasks || {};
    const resolveTask = (raw: string): string => {
      const trimmed = String(raw || "").trim();
      if (trimmed && llmProfileIdMap[trimmed]) {
        return llmProfileIdMap[trimmed];
      }
      return llmProfileIdMap.default || "";
    };
    bindings.llm = {
      questionParse: resolveTask(tasks.question_parse || tasks.questionParse),
      segment: resolveTask(tasks.segment || tasks.segment_align || tasks.segmentAlign),
      evaluation: resolveTask(tasks.evaluation || tasks.evaluate),
    };

    const asrConfig = apiEnv.asr || {};
    if (Object.keys(asrConfig).length) {
      const template = this.buildAsrTemplateFromConfig({
        id: "default",
        name: "ASR / 默认",
        asr: asrConfig,
      });
      templates[template.id] = template;
      bindings.asr = { transcription: template.id };
      const apiKey = String(asrConfig.api_key || asrConfig.apiKey || "").trim();
      if (apiKey) {
        await this.context.secrets.store(
          `interviewTrainer.${environment}.template.${template.id}.apiKey`,
          apiKey,
        );
      }
      const secretKey = String(
        asrConfig.secret_key || asrConfig.secretKey || "",
      ).trim();
      if (secretKey) {
        await this.context.secrets.store(
          `interviewTrainer.${environment}.template.${template.id}.secretKey`,
          secretKey,
        );
      }
    }

    const retrieval = skillConfig.retrieval || {};
    const vector = retrieval.vector || {};
    const embeddingProvider =
      retrieval.embedding_provider || vector.provider || "";
    const providerProfile =
      embeddingProvider && bundle.providers?.[embeddingProvider]?.embedding
        ? bundle.providers?.[embeddingProvider]?.embedding
        : {};
    const mergedVector = {
      ...providerProfile,
      ...vector,
      provider: embeddingProvider || vector.provider || providerProfile?.provider,
    };
    if (Object.keys(mergedVector).length) {
      const template = this.buildEmbeddingTemplateFromConfig({
        id: "default",
        name: "Embedding / 默认",
        vector: mergedVector,
      });
      templates[template.id] = template;
      bindings.embedding = { retrieval: template.id };
      const key = String(mergedVector.api_key || mergedVector.apiKey || "").trim();
      if (key) {
        await this.context.secrets.store(
          `interviewTrainer.${environment}.template.${template.id}.apiKey`,
          key,
        );
      }
    }

    const nextEnvConfig = {
      ...envConfig,
      templates,
      bindings,
      param_options: {
        ...(envConfig.param_options || {}),
        reasoning_effort:
          envConfig.param_options?.reasoning_effort ||
          ["low", "medium", "high", "xhigh"],
      },
    };

    return this.applyTemplateEnvConfig(ensured, environment, nextEnvConfig);
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
