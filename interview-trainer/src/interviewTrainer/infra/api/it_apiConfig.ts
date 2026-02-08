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
