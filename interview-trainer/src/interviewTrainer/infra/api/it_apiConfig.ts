import fs from "fs";
import path from "path";
import * as vscode from "vscode";
import YAML from "yaml";

export interface ItApiConfig {
  version: number;
  active: {
    environment: string;
    llm: string;
    asr: string;
    acoustic: string;
  };
  environments: Record<string, any>;
}

export interface ItTemplatesConfig {
  version: number;
  environments: Record<string, any>;
}

export interface ItGuardrailsConfig {
  version: number;
  retrieval?: {
    limits?: {
      top_k?: { min?: number; max?: number };
      max_concurrency?: { min?: number; max?: number };
      embedding_max_concurrency?: { min?: number; max?: number };
      warmup_concurrency?: { min?: number; max?: number };
      min_score?: { min?: number; max?: number };
      vector_batch_size?: { min?: number; max?: number };
      vector_query_max_chars?: { min?: number; max?: number };
      query_window_size?: { min?: number; max?: number };
      question_max_concurrency?: { min?: number; max?: number };
      kind_max_concurrency?: { min?: number; max?: number };
    };
    defaults?: {
      query_window_size?: number;
      question_max_concurrency?: number;
      kind_max_concurrency?: number;
    };
    embedding_request_split_threshold?: number;
  };
  logging?: {
    limits?: {
      message_max_chars?: number;
      detail_max_chars?: number;
      detail_max_depth?: number;
      detail_max_keys_per_object?: number;
      detail_max_items_per_array?: number;
    };
    policy?: {
      emit_error_when_trace_disabled?: boolean;
    };
  };
}

export interface ItConfigBundle {
  api: ItApiConfig;
  templates: ItTemplatesConfig;
  skill: Record<string, any>;
  providers: Record<string, any>;
  guardrails?: ItGuardrailsConfig;
}

const IT_CONFIG_DIR = "config";
const IT_DEFAULT_FILES = [
  "api_config.yaml",
  "skill_config.yaml",
  "templates.yaml",
  "guardrails.yaml",
];
const IT_PROVIDER_DIR = "providers";
const IT_TEMPLATE_EXAMPLE_PATTERN = /^templates\..+\.example\.(yaml|yml)$/i;

function it_readYamlFile(filePath: string): any {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return YAML.parse(raw) ?? {};
  } catch {
    return {};
  }
}

function it_writeYamlFile(filePath: string, payload: any): void {
  const text = YAML.stringify(payload);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text, "utf-8");
}

function it_isPlainObject(value: unknown): value is Record<string, any> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_uniqueStrings(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  return Array.from(new Set(normalized));
}

function it_mergeTemplateExampleConfigs(defaultDir: string, targetDir: string): void {
  try {
    const targetPath = path.join(targetDir, "templates.yaml");
    if (!fs.existsSync(targetPath) || !fs.existsSync(defaultDir)) {
      return;
    }

    const targetRaw = it_readYamlFile(targetPath);
    const targetConfig = it_isPlainObject(targetRaw) ? { ...targetRaw } : {};
    const targetEnvs = it_isPlainObject(targetConfig.environments)
      ? { ...targetConfig.environments }
      : {};
    targetConfig.environments = targetEnvs;

    const entries = fs
      .readdirSync(defaultDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && IT_TEMPLATE_EXAMPLE_PATTERN.test(entry.name));

    let changed = false;

    entries.forEach((entry) => {
      const srcPath = path.join(defaultDir, entry.name);
      const srcRaw = it_readYamlFile(srcPath);
      if (!it_isPlainObject(srcRaw)) {
        return;
      }
      const srcEnvs = it_isPlainObject(srcRaw.environments) ? srcRaw.environments : {};

      Object.entries(srcEnvs).forEach(([envName, envValue]) => {
        if (!it_isPlainObject(envValue)) {
          return;
        }

        const existingEnvRaw = targetEnvs[envName];
        const envConfig = it_isPlainObject(existingEnvRaw) ? { ...existingEnvRaw } : {};
        let envChanged = false;

        const srcTemplates = it_isPlainObject(envValue.templates) ? envValue.templates : {};
        const dstTemplates = it_isPlainObject(envConfig.templates) ? { ...envConfig.templates } : {};
        Object.entries(srcTemplates).forEach(([templateKey, templateValue]) => {
          if (!it_isPlainObject(templateValue)) {
            return;
          }
          const templateId = String(templateValue.id || templateKey || "").trim();
          const resolvedKey = templateId || templateKey;
          if (!resolvedKey || dstTemplates[resolvedKey]) {
            return;
          }
          dstTemplates[resolvedKey] = {
            ...templateValue,
            id: templateId || resolvedKey,
          };
          envChanged = true;
        });
        if (Object.keys(dstTemplates).length) {
          envConfig.templates = dstTemplates;
        }

        const srcBindings = it_isPlainObject(envValue.bindings) ? envValue.bindings : {};
        const dstBindings = it_isPlainObject(envConfig.bindings) ? { ...envConfig.bindings } : {};
        Object.entries(srcBindings).forEach(([groupKey, groupValue]) => {
          if (!it_isPlainObject(groupValue)) {
            return;
          }
          const dstGroup = it_isPlainObject(dstBindings[groupKey])
            ? { ...dstBindings[groupKey] }
            : {};
          let groupChanged = false;
          Object.entries(groupValue).forEach(([bindingKey, bindingValue]) => {
            const nextValue = String(bindingValue || "").trim();
            const currentValue = String(dstGroup[bindingKey] || "").trim();
            if (!currentValue && nextValue) {
              dstGroup[bindingKey] = nextValue;
              groupChanged = true;
            }
          });
          if (groupChanged || (!dstBindings[groupKey] && Object.keys(dstGroup).length)) {
            dstBindings[groupKey] = dstGroup;
            envChanged = true;
          }
        });
        if (Object.keys(dstBindings).length) {
          envConfig.bindings = dstBindings;
        }

        const srcSecrets = it_uniqueStrings(envValue.secrets);
        const dstSecrets = it_uniqueStrings(envConfig.secrets);
        const mergedSecrets = Array.from(new Set([...dstSecrets, ...srcSecrets]));
        if (mergedSecrets.length && mergedSecrets.length !== dstSecrets.length) {
          envConfig.secrets = mergedSecrets;
          envChanged = true;
        }

        const srcReasoning = it_uniqueStrings(envValue?.param_options?.reasoning_effort);
        if (srcReasoning.length) {
          const dstParamOptions = it_isPlainObject(envConfig.param_options)
            ? { ...envConfig.param_options }
            : {};
          const dstReasoning = it_uniqueStrings(dstParamOptions.reasoning_effort);
          const mergedReasoning = Array.from(new Set([...dstReasoning, ...srcReasoning]));
          if (
            mergedReasoning.length &&
            (mergedReasoning.length !== dstReasoning.length ||
              !Array.isArray(dstParamOptions.reasoning_effort))
          ) {
            dstParamOptions.reasoning_effort = mergedReasoning;
            envConfig.param_options = dstParamOptions;
            envChanged = true;
          }
        }

        const srcAutoRefresh = envValue?.token_options?.auto_refresh;
        if (srcAutoRefresh !== undefined) {
          const dstTokenOptions = it_isPlainObject(envConfig.token_options)
            ? { ...envConfig.token_options }
            : {};
          if (dstTokenOptions.auto_refresh === undefined) {
            dstTokenOptions.auto_refresh = Boolean(srcAutoRefresh);
            envConfig.token_options = dstTokenOptions;
            envChanged = true;
          }
        }

        if (envChanged || !it_isPlainObject(existingEnvRaw)) {
          targetEnvs[envName] = envConfig;
          changed = true;
        }
      });
    });

    if (!changed) {
      return;
    }
    if (!Number.isFinite(Number(targetConfig.version))) {
      targetConfig.version = 1;
    }
    it_writeYamlFile(targetPath, targetConfig);
  } catch {
    // ignore template example merge failures
  }
}

function it_getDefaultConfigDir(context: vscode.ExtensionContext): string {
  return path.join(context.extensionPath, IT_CONFIG_DIR);
}

export function it_getUserConfigDir(context: vscode.ExtensionContext): string {
  return path.join(context.globalStorageUri.fsPath, "interview_trainer");
}

function it_getDefaultProviderDir(context: vscode.ExtensionContext): string {
  return path.join(it_getDefaultConfigDir(context), IT_PROVIDER_DIR);
}

export function it_getUserProviderDir(context: vscode.ExtensionContext): string {
  return path.join(it_getUserConfigDir(context), IT_PROVIDER_DIR);
}

function it_readProviderConfigs(dirPath: string): Record<string, any> {
  if (!fs.existsSync(dirPath)) {
    return {};
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const profiles: Record<string, any> = {};
  entries.forEach((entry) => {
    if (!entry.isFile()) {
      return;
    }
    if (!entry.name.endsWith(".yaml") && !entry.name.endsWith(".yml")) {
      return;
    }
    const providerId = entry.name.replace(/\.(yaml|yml)$/i, "");
    try {
      const data = it_readYamlFile(path.join(dirPath, entry.name));
      if (data) {
        profiles[providerId] = { ...data };
      }
    } catch {
      // ignore invalid provider file
    }
  });
  return profiles;
}

function it_writeProviderConfig(
  dirPath: string,
  providerId: string,
  payload: any,
): void {
  const filename = `${providerId}.yaml`;
  fs.mkdirSync(dirPath, { recursive: true });
  it_writeYamlFile(path.join(dirPath, filename), payload);
}

export function it_ensureConfigFiles(context: vscode.ExtensionContext): void {
  const defaultDir = it_getDefaultConfigDir(context);
  const targetDir = it_getUserConfigDir(context);
  fs.mkdirSync(targetDir, { recursive: true });

  for (const filename of IT_DEFAULT_FILES) {
    const src = path.join(defaultDir, filename);
    const dest = path.join(targetDir, filename);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
    }
  }

  it_mergeTemplateExampleConfigs(defaultDir, targetDir);

  const providerSrc = it_getDefaultProviderDir(context);
  const providerDest = it_getUserProviderDir(context);
  if (fs.existsSync(providerSrc)) {
    fs.mkdirSync(providerDest, { recursive: true });
    const entries = fs.readdirSync(providerSrc, { withFileTypes: true });
    entries.forEach((entry) => {
      if (!entry.isFile()) {
        return;
      }
      const src = path.join(providerSrc, entry.name);
      const dest = path.join(providerDest, entry.name);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    });
  }
}

export function it_loadConfigBundle(
  context: vscode.ExtensionContext,
): ItConfigBundle {
  it_ensureConfigFiles(context);
  const baseDir = it_getUserConfigDir(context);
  const providerDir = it_getUserProviderDir(context);

  const api = it_readYamlFile(path.join(baseDir, "api_config.yaml")) as ItApiConfig;
  const templates = it_readYamlFile(path.join(baseDir, "templates.yaml")) as ItTemplatesConfig;
  const skill = it_readYamlFile(path.join(baseDir, "skill_config.yaml"));
  const guardrails = it_readYamlFile(path.join(baseDir, "guardrails.yaml")) as ItGuardrailsConfig;
  const providers = it_readProviderConfigs(providerDir);

  return {
    api,
    templates: templates || { version: 1, environments: {} },
    skill,
    providers,
    guardrails: guardrails || { version: 1 },
  };
}

export function it_saveApiConfig(
  context: vscode.ExtensionContext,
  apiConfig: ItApiConfig,
): void {
  const baseDir = it_getUserConfigDir(context);
  it_writeYamlFile(path.join(baseDir, "api_config.yaml"), apiConfig);
}

export function it_saveSkillConfig(
  context: vscode.ExtensionContext,
  skillConfig: Record<string, any>,
): void {
  const baseDir = it_getUserConfigDir(context);
  it_writeYamlFile(path.join(baseDir, "skill_config.yaml"), skillConfig);
}

export function it_saveTemplatesConfig(
  context: vscode.ExtensionContext,
  templatesConfig: ItTemplatesConfig,
): void {
  const baseDir = it_getUserConfigDir(context);
  it_writeYamlFile(path.join(baseDir, "templates.yaml"), templatesConfig);
}

export function it_saveProviderConfig(
  context: vscode.ExtensionContext,
  providerId: string,
  payload: any,
): void {
  const providerDir = it_getUserProviderDir(context);
  it_writeProviderConfig(providerDir, providerId, payload);
}
