import type * as vscode from "vscode";
import type {
  ItApiTemplate,
  ItConfigSnapshot,
  ItTemplateBindings,
} from "../../../protocol/interviewTrainer";
import type {
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";

export type ItTemplateTokenService = {
  refreshTokenByName: (name: string) => Promise<void>;
  refreshAll: () => Promise<void>;
};

export type ItTemplateUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  tokenService: ItTemplateTokenService;
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
};

export type ItTemplateConfigResult<T> = {
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  value: T;
};

type ItTemplateTraceLevel = "debug" | "info" | "warn" | "error";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_activeEnvironment(configBundle: ItConfigBundle): string {
  return configBundle.api.active?.environment || "prod";
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_isValidSecretName(name: string): boolean {
  return /^[a-zA-Z0-9_.-]+$/.test(name);
}

function it_buildSecretHint(value: string): string {
  const normalized = String(value || "");
  if (!normalized) {
    return "";
  }
  if (normalized.length <= 2) {
    return `${normalized[0] || "*"}***${normalized.slice(-1) || "*"}`;
  }
  if (normalized.length <= 6) {
    return `${normalized.slice(0, 1)}***${normalized.slice(-1)}`;
  }
  return `${normalized.slice(0, 3)}***${normalized.slice(-3)}`;
}

function it_traceTemplate(
  context: ItTemplateUseCaseContext,
  event: string,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItTemplateTraceLevel = "info",
): void {
  context.logCorpusTrace?.(`template ${action} ${status}`, {
    event,
    status,
    level,
    module: "it_templateActions",
    ...(detail || {}),
  });
}

async function it_withConfigSnapshot(
  context: ItTemplateUseCaseContext,
  configBundle: ItConfigBundle,
): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const configSnapshot = await context.refreshConfigSnapshot();
  return {
    configBundle,
    configSnapshot,
    value: configSnapshot,
  };
}

export async function it_saveTemplateFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const template = payload.template as ItApiTemplate | undefined;
  if (!template || !template.id) {
    throw new Error("missing template id");
  }

  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = params.context.configService.upsertTemplate(templatesConfig, env, template);
  params.context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_deleteTemplateFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const templateId = String(payload.templateId || "").trim();
  if (!templateId) {
    throw new Error("missing templateId");
  }

  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = params.context.configService.removeTemplate(templatesConfig, env, templateId);
  params.context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_saveTemplateBindingsFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const bindings = (payload.bindings || {}) as ItTemplateBindings;
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = params.context.configService.saveTemplateBindings(
    templatesConfig,
    env,
    bindings,
  );
  params.context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_saveTemplateParamOptionsFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const options = it_asRecord(payload.options) as { reasoning_effort?: string[] };
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = params.context.configService.saveTemplateParamOptions(
    templatesConfig,
    env,
    options,
  );
  params.context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_saveTemplateSecretFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    it_traceTemplate(
      params.context,
      "application.template_secret.save",
      "save_secret",
      "error",
      { reason: "missing_secret_name" },
      "error",
    );
    throw new Error("missing secret name");
  }
  if (!it_isValidSecretName(name)) {
    it_traceTemplate(
      params.context,
      "application.template_secret.save",
      "save_secret",
      "error",
      { reason: "invalid_secret_name", name },
      "error",
    );
    throw new Error("invalid secret name");
  }

  const hasValue = Object.prototype.hasOwnProperty.call(payload, "value");
  const value = hasValue ? String(payload.value ?? "") : "";
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const envConfig = templatesConfig.environments?.[env] || {};
  const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
  const replacing = existing.includes(name);

  it_traceTemplate(params.context, "application.template_secret.save", "save_secret", "start", {
    env,
    name,
    hasValue,
    replacing,
  });

  try {
    templatesConfig = params.context.configService.saveTemplateSecrets(templatesConfig, env, [
      ...existing,
      name,
    ]);

    const nextEnvConfig = it_asRecord(templatesConfig.environments?.[env]);
    const nextSecretHints = {
      ...it_asRecord(nextEnvConfig.secret_hints),
    };
    if (hasValue) {
      const hint = it_buildSecretHint(value);
      if (hint) {
        nextSecretHints[name] = hint;
      } else {
        delete nextSecretHints[name];
      }
    }
    templatesConfig = {
      ...templatesConfig,
      environments: {
        ...(templatesConfig.environments || {}),
        [env]: {
          ...nextEnvConfig,
          secret_hints: nextSecretHints,
        },
      },
    };

    params.context.configService.saveTemplatesConfig(templatesConfig);

    if (hasValue) {
      await params.context.extensionContext.secrets.store(
        `interviewTrainer.${env}.secret.${name}`,
        value,
      );
    }

    const nextBundle = params.context.configService.loadBundle();
    const result = await it_withConfigSnapshot(params.context, nextBundle);

    it_traceTemplate(params.context, "application.template_secret.save", "save_secret", "success", {
      env,
      name,
      hasValue,
      replacing,
    });

    return result;
  } catch (error) {
    it_traceTemplate(
      params.context,
      "application.template_secret.save",
      "save_secret",
      "error",
      {
        env,
        name,
        hasValue,
        replacing,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_deleteTemplateSecretFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    it_traceTemplate(
      params.context,
      "application.template_secret.delete",
      "delete_secret",
      "error",
      { reason: "missing_secret_name" },
      "error",
    );
    throw new Error("missing secret name");
  }

  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const envConfig = templatesConfig.environments?.[env] || {};
  const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
  const existed = existing.includes(name);

  it_traceTemplate(params.context, "application.template_secret.delete", "delete_secret", "start", {
    env,
    name,
    existed,
  });

  try {
    const nextSecrets = existing.filter((item: string) => item !== name);
    templatesConfig = params.context.configService.saveTemplateSecrets(
      templatesConfig,
      env,
      nextSecrets,
    );

    const nextEnvConfig = it_asRecord(templatesConfig.environments?.[env]);
    const nextSecretHints = {
      ...it_asRecord(nextEnvConfig.secret_hints),
    };
    delete nextSecretHints[name];
    templatesConfig = {
      ...templatesConfig,
      environments: {
        ...(templatesConfig.environments || {}),
        [env]: {
          ...nextEnvConfig,
          secret_hints: nextSecretHints,
        },
      },
    };

    params.context.configService.saveTemplatesConfig(templatesConfig);
    await params.context.extensionContext.secrets.delete(
      `interviewTrainer.${env}.secret.${name}`,
    );

    const nextBundle = params.context.configService.loadBundle();
    const result = await it_withConfigSnapshot(params.context, nextBundle);

    it_traceTemplate(
      params.context,
      "application.template_secret.delete",
      "delete_secret",
      "success",
      {
        env,
        name,
        existed,
      },
    );

    return result;
  } catch (error) {
    it_traceTemplate(
      params.context,
      "application.template_secret.delete",
      "delete_secret",
      "error",
      {
        env,
        name,
        existed,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_refreshTokenFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<{ ok: true }> {
  const payload = it_asRecord(params.payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    it_traceTemplate(
      params.context,
      "application.template_token.refresh",
      "refresh_token",
      "error",
      { reason: "missing_token_name" },
      "error",
    );
    throw new Error("missing token name");
  }

  it_traceTemplate(params.context, "application.template_token.refresh", "refresh_token", "start", {
    name,
  });

  try {
    await params.context.tokenService.refreshTokenByName(name);
    it_traceTemplate(
      params.context,
      "application.template_token.refresh",
      "refresh_token",
      "success",
      { name },
    );
    return { ok: true };
  } catch (error) {
    it_traceTemplate(
      params.context,
      "application.template_token.refresh",
      "refresh_token",
      "error",
      {
        name,
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_refreshAllTokensFromWebview(params: {
  context: ItTemplateUseCaseContext;
}): Promise<{ ok: true }> {
  it_traceTemplate(
    params.context,
    "application.template_token.refresh_all",
    "refresh_all_tokens",
    "start",
  );
  try {
    await params.context.tokenService.refreshAll();
    it_traceTemplate(
      params.context,
      "application.template_token.refresh_all",
      "refresh_all_tokens",
      "success",
    );
    return { ok: true };
  } catch (error) {
    it_traceTemplate(
      params.context,
      "application.template_token.refresh_all",
      "refresh_all_tokens",
      "error",
      {
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}

export async function it_setTokenAutoRefreshFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const enabled = payload.enabled !== false;
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);

  it_traceTemplate(
    params.context,
    "application.template_token.set_auto_refresh",
    "set_token_auto_refresh",
    "start",
    {
      env,
      enabled: Boolean(enabled),
    },
  );

  try {
    let templatesConfig = configBundle.templates || { version: 1, environments: {} };
    templatesConfig = params.context.configService.saveTokenOptions(templatesConfig, env, {
      auto_refresh: Boolean(enabled),
    });
    params.context.configService.saveTemplatesConfig(templatesConfig);

    const nextBundle = params.context.configService.loadBundle();
    const result = await it_withConfigSnapshot(params.context, nextBundle);

    it_traceTemplate(
      params.context,
      "application.template_token.set_auto_refresh",
      "set_token_auto_refresh",
      "success",
      {
        env,
        enabled: Boolean(enabled),
      },
    );

    return result;
  } catch (error) {
    it_traceTemplate(
      params.context,
      "application.template_token.set_auto_refresh",
      "set_token_auto_refresh",
      "error",
      {
        env,
        enabled: Boolean(enabled),
        error: it_errorMessage(error),
      },
      "error",
    );
    throw error;
  }
}
