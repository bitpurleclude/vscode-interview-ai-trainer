import type { ItApiConfig, ItConfigBundle } from "./it_configGateway";
import type { ItLlmConfig } from "./it_llmGateway";

export function it_firstNonEmpty(
  ...values: Array<string | undefined | null>
): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value;
    }
  }
  return "";
}

export function it_getLlmConfig(
  configBundle: ItConfigBundle,
  profileId?: string,
  options?: { allowMissingAuth?: boolean },
): ItLlmConfig | null {
  const env = configBundle.api.active?.environment || "prod";
  const envConfig = configBundle.api.environments?.[env] ?? {};
  const providerId =
    envConfig.llm_provider || envConfig.llm?.provider || configBundle.api.active?.llm;
  const providerProfile =
    providerId && configBundle.providers?.[providerId]?.llm
      ? configBundle.providers?.[providerId]?.llm
      : undefined;
  const baseLlm = {
    ...(providerProfile || {}),
    ...(envConfig.llm || {}),
    provider: providerId || envConfig.llm?.provider,
  };
  const profile =
    profileId && envConfig.llm_profiles ? envConfig.llm_profiles[profileId] : undefined;
  const llm = {
    ...baseLlm,
    ...(profile || {}),
    provider: profile?.provider || baseLlm.provider,
    api_key: profile?.api_key || profile?.apiKey || baseLlm.api_key,
    base_url: profile?.base_url || profile?.baseUrl || baseLlm.base_url,
    model: profile?.model || baseLlm.model,
  };
  const provider = llm.provider || providerId || "openai_compatible";
  const apiKey = llm.api_key || "";
  if (!provider || (!apiKey && !options?.allowMissingAuth)) {
    return null;
  }

  const isDoubao = provider === "volc_doubao";
  const defaultBase = isDoubao
    ? "https://ark.cn-beijing.volces.com"
    : "https://qianfan.baidubce.com/v2";
  const apiModeRaw = llm.api_mode ?? llm.apiMode;
  const apiMode = apiModeRaw
    ? String(apiModeRaw).toLowerCase() === "responses"
      ? "responses"
      : "chat"
    : undefined;
  const useResponses = apiMode
    ? apiMode === "responses"
    : Boolean(llm.use_responses ?? llm.useResponses ?? (isDoubao ? true : false));

  return {
    provider,
    apiKey,
    baseUrl: llm.base_url || defaultBase,
    model:
      llm.model ||
      (isDoubao ? "doubao-seed-1-8-251228" : "ernie-4.5-turbo-128k"),
    temperature: Number(llm.temperature ?? 0.8),
    topP: Number(llm.top_p ?? 0.8),
    timeoutSec: Number(llm.timeout_sec ?? 60),
    maxRetries: Number(llm.max_retries ?? 1),
    antiRepeat: Boolean(llm.anti_repeat ?? llm.antiRepeat ?? false),
    useResponses,
    apiMode,
    responsesPath: llm.responses_path ?? llm.responsesPath ?? "",
    reasoningEffort:
      llm.reasoning_effort ?? llm.reasoningEffort ?? (isDoubao ? "medium" : undefined),
    maxOutputTokens: Number(llm.max_output_tokens ?? llm.maxOutputTokens ?? 800),
    reusePrefix: Boolean(
      llm.reuse_prefix ?? llm.reusePrefix ?? (isDoubao ? true : false),
    ),
    stream: Boolean(llm.stream ?? llm.stream_enabled ?? true),
  };
}

export function it_resolveApiConfigWithProviders(
  configBundle: ItConfigBundle,
  apiConfig: ItApiConfig,
): ItApiConfig {
  const env = apiConfig.active?.environment || "prod";
  const envConfig = apiConfig.environments?.[env] ?? {};
  const providers = configBundle.providers || {};
  const llmProvider =
    envConfig.llm_provider || envConfig.llm?.provider || apiConfig.active?.llm;
  const asrProvider =
    envConfig.asr_provider || envConfig.asr?.provider || apiConfig.active?.asr;
  const llmProfile = llmProvider ? providers[llmProvider]?.llm : undefined;
  const asrProfile = asrProvider ? providers[asrProvider]?.asr : undefined;
  const mergedLlm = llmProfile
    ? {
        ...llmProfile,
        ...(envConfig.llm || {}),
        provider: llmProvider,
      }
    : envConfig.llm;
  const mergedAsr = asrProfile
    ? {
        ...asrProfile,
        ...(envConfig.asr || {}),
        provider: asrProvider,
      }
    : envConfig.asr;

  return {
    ...apiConfig,
    environments: {
      ...apiConfig.environments,
      [env]: {
        ...envConfig,
        llm: mergedLlm,
        asr: mergedAsr,
      },
    },
  };
}
