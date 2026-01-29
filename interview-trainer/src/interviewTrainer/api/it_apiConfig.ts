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
  local?: Record<string, any>;
  ccswitch?: Record<string, any>;
}

export interface ItConfigBundle {
  api: ItApiConfig;
  skill: Record<string, any>;
  app: Record<string, any>;
  providers: Record<string, any>;
}

const IT_CONFIG_DIR = "config";
const IT_DEFAULT_FILES = ["api_config.yaml", "skill_config.yaml", "app_config.yaml"];
const IT_PROVIDER_DIR = "providers";

function it_readYamlFile(filePath: string): any {
  const raw = fs.readFileSync(filePath, "utf-8");
  return YAML.parse(raw) ?? {};
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
  const skill = it_readYamlFile(path.join(baseDir, "skill_config.yaml"));
  const app = it_readYamlFile(path.join(baseDir, "app_config.yaml"));
  const providers = it_readProviderConfigs(providerDir);

  return {
    api,
    skill,
    app,
    providers,
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

export function it_saveProviderConfig(
  context: vscode.ExtensionContext,
  providerId: string,
  payload: any,
): void {
  const providerDir = it_getUserProviderDir(context);
  it_writeProviderConfig(providerDir, providerId, payload);
}

export async function it_applySecretOverrides(
  context: vscode.ExtensionContext,
  apiConfig: ItApiConfig,
): Promise<ItApiConfig> {
  const env = apiConfig.active?.environment || "prod";
  const envConfig = apiConfig.environments?.[env] ?? {};

  const llmKey =
    (await context.secrets.get(`interviewTrainer.${env}.llm.apiKey`)) ||
    envConfig.llm?.api_key ||
    "";
  const asrKey =
    (await context.secrets.get(`interviewTrainer.${env}.asr.apiKey`)) ||
    envConfig.asr?.api_key ||
    "";
  const asrSecret =
    (await context.secrets.get(`interviewTrainer.${env}.asr.secretKey`)) ||
    envConfig.asr?.secret_key ||
    "";

  return {
    ...apiConfig,
    environments: {
      ...apiConfig.environments,
      [env]: {
        ...envConfig,
        llm: { ...envConfig.llm, api_key: llmKey },
        asr: { ...envConfig.asr, api_key: asrKey, secret_key: asrSecret },
      },
    },
  };
}
