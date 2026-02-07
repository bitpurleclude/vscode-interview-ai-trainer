import { describe, expect, it } from "vitest";
import type { ItConfigBundle } from "./it_configGateway";
import {
  it_firstNonEmpty,
  it_getLlmConfig,
  it_resolveApiConfigWithProviders,
} from "./it_extensionConfig";

function buildBundle(overrides: Partial<ItConfigBundle> = {}): ItConfigBundle {
  return {
    api: {
      version: 1,
      active: {
        environment: "prod",
        llm: "providerA",
        asr: "providerA",
        acoustic: "default",
      },
      environments: {
        prod: {
          llm_provider: "providerA",
          asr_provider: "providerA",
          llm: {
            model: "env-model",
            top_p: 0.7,
          },
          asr: {
            timeout_sec: 90,
          },
        },
      },
    },
    templates: {
      version: 1,
      environments: {},
    },
    skill: {},
    providers: {
      providerA: {
        llm: {
          api_key: "provider-key",
          base_url: "https://provider.example.com",
          model: "provider-model",
          timeout_sec: 30,
        },
        asr: {
          timeout_sec: 120,
          language: "zh",
        },
      },
    },
    ...overrides,
  };
}

describe("it_firstNonEmpty", () => {
  it("returns first non-empty string", () => {
    expect(it_firstNonEmpty(undefined, "", "  ", "ok", "fallback")).toBe("ok");
  });

  it("returns empty string when all values are empty", () => {
    expect(it_firstNonEmpty(undefined, null, "", " ")).toBe("");
  });
});

describe("it_getLlmConfig", () => {
  it("builds llm config from provider + env values", () => {
    const bundle = buildBundle();
    const config = it_getLlmConfig(bundle);

    expect(config).not.toBeNull();
    expect(config?.provider).toBe("providerA");
    expect(config?.apiKey).toBe("provider-key");
    expect(config?.model).toBe("env-model");
    expect(config?.baseUrl).toBe("https://provider.example.com");
    expect(config?.topP).toBe(0.7);
    expect(config?.timeoutSec).toBe(30);
  });

  it("supports profile override", () => {
    const bundle = buildBundle({
      api: {
        version: 1,
        active: {
          environment: "prod",
          llm: "providerA",
          asr: "providerA",
          acoustic: "default",
        },
        environments: {
          prod: {
            llm_provider: "providerA",
            llm: {
              model: "env-model",
            },
            llm_profiles: {
              custom: {
                provider: "volc_doubao",
                api_key: "profile-key",
                model: "profile-model",
              },
            },
          },
        },
      },
    });

    const config = it_getLlmConfig(bundle, "custom");

    expect(config).not.toBeNull();
    expect(config?.provider).toBe("volc_doubao");
    expect(config?.apiKey).toBe("profile-key");
    expect(config?.model).toBe("profile-model");
    expect(config?.useResponses).toBe(true);
  });

  it("returns null when auth is missing and not allowed", () => {
    const bundle = buildBundle({
      providers: {
        providerA: {
          llm: {
            model: "provider-model",
          },
        },
      },
    });

    expect(it_getLlmConfig(bundle)).toBeNull();
    expect(it_getLlmConfig(bundle, undefined, { allowMissingAuth: true })).not.toBeNull();
  });
});

describe("it_resolveApiConfigWithProviders", () => {
  it("merges provider profiles into active environment", () => {
    const bundle = buildBundle();
    const resolved = it_resolveApiConfigWithProviders(bundle, bundle.api);
    const env = resolved.environments.prod;

    expect(env.llm.provider).toBe("providerA");
    expect(env.llm.api_key).toBe("provider-key");
    expect(env.llm.model).toBe("env-model");

    expect(env.asr.provider).toBe("providerA");
    expect(env.asr.timeout_sec).toBe(90);
    expect(env.asr.language).toBe("zh");
  });
});
