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
import type { ItTokenService } from "../services/it_tokens";

export type ItTemplateUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  tokenService: ItTokenService;
};

export type ItTemplateConfigResult<T> = {
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  value: T;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_activeEnvironment(configBundle: ItConfigBundle): string {
  return configBundle.api.active?.environment || "prod";
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
    throw new Error("missing secret name");
  }

  const hasValue = Object.prototype.hasOwnProperty.call(payload, "value");
  const value = hasValue ? String(payload.value ?? "") : "";
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const envConfig = templatesConfig.environments?.[env] || {};
  const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
  templatesConfig = params.context.configService.saveTemplateSecrets(templatesConfig, env, [
    ...existing,
    name,
  ]);
  params.context.configService.saveTemplatesConfig(templatesConfig);

  if (hasValue) {
    await params.context.extensionContext.secrets.store(
      `interviewTrainer.${env}.secret.${name}`,
      value,
    );
  }

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_deleteTemplateSecretFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("missing secret name");
  }

  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const envConfig = templatesConfig.environments?.[env] || {};
  const existing = Array.isArray(envConfig.secrets) ? envConfig.secrets : [];
  const nextSecrets = existing.filter((item: string) => item !== name);
  templatesConfig = params.context.configService.saveTemplateSecrets(
    templatesConfig,
    env,
    nextSecrets,
  );
  params.context.configService.saveTemplatesConfig(templatesConfig);
  await params.context.extensionContext.secrets.delete(
    `interviewTrainer.${env}.secret.${name}`,
  );

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}

export async function it_refreshTokenFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<{ ok: true }> {
  const payload = it_asRecord(params.payload);
  const name = String(payload.name || "").trim();
  if (!name) {
    throw new Error("missing token name");
  }
  await params.context.tokenService.refreshTokenByName(name);
  return { ok: true };
}

export async function it_refreshAllTokensFromWebview(params: {
  context: ItTemplateUseCaseContext;
}): Promise<{ ok: true }> {
  await params.context.tokenService.refreshAll();
  return { ok: true };
}

export async function it_setTokenAutoRefreshFromWebview(params: {
  context: ItTemplateUseCaseContext;
  payload: unknown;
}): Promise<ItTemplateConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const enabled = payload.enabled !== false;
  const configBundle = params.context.configService.loadBundle();
  const env = it_activeEnvironment(configBundle);
  let templatesConfig = configBundle.templates || { version: 1, environments: {} };
  templatesConfig = params.context.configService.saveTokenOptions(templatesConfig, env, {
    auto_refresh: Boolean(enabled),
  });
  params.context.configService.saveTemplatesConfig(templatesConfig);

  const nextBundle = params.context.configService.loadBundle();
  return it_withConfigSnapshot(params.context, nextBundle);
}
