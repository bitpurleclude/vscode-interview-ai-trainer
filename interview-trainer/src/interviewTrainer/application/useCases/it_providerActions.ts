import path from "path";
import type * as vscode from "vscode";
import type { ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import type {
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";
import { it_getUserProviderDir } from "../services/it_configGateway";

export type ItProviderUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  buildConfigSnapshot: (apiConfig: ItConfigBundle["api"]) => ItConfigSnapshot;
  openFile: (filePath: string) => Promise<void>;
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
};

export type ItProviderConfigResult<T> = {
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  value: T;
};

type ItProviderTraceLevel = "debug" | "info" | "warn" | "error";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceProvider(
  context: ItProviderUseCaseContext,
  event: string,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItProviderTraceLevel = "info",
): void {
  context.logCorpusTrace?.(`provider ${action} ${status}`, {
    event,
    status,
    level,
    module: "it_providerActions",
    ...(detail || {}),
  });
}

function it_validateProviderId(providerId: string): void {
  if (!providerId || !/^[a-zA-Z0-9_-]+$/.test(providerId)) {
    throw new Error("providerId 只能包含字母、数字、_、-");
  }
}

function it_buildDefaultProviderProfile(providerId: string, displayName: string): Record<string, unknown> {
  return {
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
}

function it_buildConfigResult(
  context: ItProviderUseCaseContext,
  configBundle: ItConfigBundle,
): ItProviderConfigResult<ItConfigSnapshot> {
  const configSnapshot = context.buildConfigSnapshot(configBundle.api);
  return {
    configBundle,
    configSnapshot,
    value: configSnapshot,
  };
}

export async function it_createProviderConfigFromWebview(params: {
  context: ItProviderUseCaseContext;
  payload: unknown;
}): Promise<ItProviderConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const providerId = String(payload.providerId || "").trim();
  const displayName = String(payload.displayName || "").trim();

  it_traceProvider(
    params.context,
    "application.provider.create_config",
    "create_config",
    "start",
    { providerId, hasDisplayName: Boolean(displayName) },
  );

  try {
    it_validateProviderId(providerId);

    const configBundle = params.context.configService.loadBundle();
    if (configBundle.providers?.[providerId]) {
      throw new Error("Provider 已存在");
    }
    const profile = it_buildDefaultProviderProfile(providerId, displayName);

    params.context.configService.saveProviderConfig(providerId, profile);
    const nextBundle = params.context.configService.loadBundle();
    const result = it_buildConfigResult(params.context, nextBundle);

    it_traceProvider(
      params.context,
      "application.provider.create_config",
      "create_config",
      "success",
      { providerId, hasDisplayName: Boolean(displayName) },
    );

    return result;
  } catch (error) {
    it_traceProvider(
      params.context,
      "application.provider.create_config",
      "create_config",
      "error",
      {
        providerId,
        hasDisplayName: Boolean(displayName),
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_saveProviderConfigFromWebview(params: {
  context: ItProviderUseCaseContext;
  payload: unknown;
}): Promise<ItProviderConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const providerId = String(payload.providerId || "").trim();
  if (!providerId) {
    it_traceProvider(
      params.context,
      "application.provider.save_config",
      "save_config",
      "error",
      { reason: "missing_provider_id" },
      "error",
    );
    throw new Error("missing providerId");
  }

  const incoming = it_asRecord(payload.profile);
  it_traceProvider(
    params.context,
    "application.provider.save_config",
    "save_config",
    "start",
    {
      providerId,
      incomingKeyCount: Object.keys(incoming).length,
      hasLlm: Boolean(incoming.llm),
      hasEmbedding: Boolean(incoming.embedding),
      hasAsr: Boolean(incoming.asr),
    },
  );

  try {
    const configBundle = params.context.configService.loadBundle();
    const existing = it_asRecord(configBundle.providers?.[providerId] || { provider: providerId });
    const next = {
      ...existing,
      ...incoming,
      provider: providerId,
      llm: {
        ...it_asRecord(existing.llm),
        ...it_asRecord(incoming.llm),
      },
      embedding: {
        ...it_asRecord(existing.embedding),
        ...it_asRecord(incoming.embedding),
      },
      asr: {
        ...it_asRecord(existing.asr),
        ...it_asRecord(incoming.asr),
      },
    };

    params.context.configService.saveProviderConfig(providerId, next);
    const nextBundle = params.context.configService.loadBundle();
    const result = it_buildConfigResult(params.context, nextBundle);

    it_traceProvider(
      params.context,
      "application.provider.save_config",
      "save_config",
      "success",
      {
        providerId,
        incomingKeyCount: Object.keys(incoming).length,
      },
    );

    return result;
  } catch (error) {
    it_traceProvider(
      params.context,
      "application.provider.save_config",
      "save_config",
      "error",
      {
        providerId,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_openProviderConfigFromWebview(params: {
  context: ItProviderUseCaseContext;
  payload: unknown;
}): Promise<{ opened: boolean; path?: string }> {
  const payload = it_asRecord(params.payload);
  const providerId = String(payload.providerId || "").trim();
  if (!providerId) {
    it_traceProvider(
      params.context,
      "application.provider.open_config",
      "open_config",
      "skipped",
      { reason: "missing_provider_id" },
      "warn",
    );
    return { opened: false };
  }

  const providerDir = it_getUserProviderDir(params.context.extensionContext);
  const target = path.join(providerDir, `${providerId}.yaml`);
  it_traceProvider(
    params.context,
    "application.provider.open_config",
    "open_config",
    "start",
    { providerId, path: target },
  );

  try {
    await params.context.openFile(target);
    it_traceProvider(
      params.context,
      "application.provider.open_config",
      "open_config",
      "success",
      { providerId, path: target },
    );
    return { opened: true, path: target };
  } catch (error) {
    it_traceProvider(
      params.context,
      "application.provider.open_config",
      "open_config",
      "error",
      {
        providerId,
        path: target,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}
