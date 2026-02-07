import path from "path";
import type { ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import type {
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";

export type ItWorkspaceSelectionKind =
  | "notes"
  | "prompts"
  | "rubrics"
  | "knowledge"
  | "examples";

export type ItWorkspaceSelectOptions = {
  defaultPath: string;
  openLabel: string;
};

export type ItWorkspaceUseCaseContext = {
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  requireWorkspaceRoot: () => string;
  selectDirectory: (options: ItWorkspaceSelectOptions) => Promise<string | null>;
  showWarning: (message: string) => void;
};

export type ItWorkspaceResult<T> = {
  configBundle: ItConfigBundle;
  value: T;
  configSnapshot?: ItConfigSnapshot;
};

const WORKSPACE_DIR_KEY_MAP: Record<ItWorkspaceSelectionKind, string> = {
  notes: "notes_dir",
  prompts: "prompts_dir",
  rubrics: "rubrics_dir",
  knowledge: "knowledge_dir",
  examples: "examples_dir",
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_normalizeRelativePath(workspaceRoot: string, selectedPath: string): string | null {
  const relative = path.relative(workspaceRoot, selectedPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return null;
  }
  return relative ? relative.split(path.sep).join("/") : ".";
}

export async function it_selectWorkspaceDirFromWebview(params: {
  context: ItWorkspaceUseCaseContext;
  payload: unknown;
}): Promise<ItWorkspaceResult<{ canceled?: boolean; kind?: string; path?: string }>> {
  const payload = it_asRecord(params.payload);
  const kind = String(payload.kind || "") as ItWorkspaceSelectionKind;
  const targetKey = WORKSPACE_DIR_KEY_MAP[kind];
  if (!targetKey) {
    throw new Error("invalid workspace kind");
  }

  const configBundle = params.context.configService.loadBundle();
  const workspaceRoot = params.context.requireWorkspaceRoot();
  const skillConfig = (configBundle.skill || {}) as Record<string, unknown>;
  const workspaceConfig = (skillConfig.workspace || {}) as Record<string, unknown>;
  const current = String(workspaceConfig[targetKey] ?? skillConfig[targetKey] ?? "").trim();
  const selectedPath = await params.context.selectDirectory({
    openLabel: "选择目录",
    defaultPath: current ? path.join(workspaceRoot, current) : workspaceRoot,
  });
  if (!selectedPath) {
    return { configBundle, value: { canceled: true } };
  }

  const normalized = it_normalizeRelativePath(workspaceRoot, selectedPath);
  if (!normalized) {
    params.context.showWarning("所选目录必须位于当前工作区内");
    return { configBundle, value: { canceled: true } };
  }

  const nextSkill = {
    ...(configBundle.skill || {}),
    workspace: {
      ...((configBundle.skill?.workspace || {}) as Record<string, unknown>),
      [targetKey]: normalized || ".",
    },
  } as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(nextSkill, targetKey)) {
    delete nextSkill[targetKey];
  }
  configBundle.skill = {
    ...nextSkill,
  };
  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();

  return {
    configBundle,
    configSnapshot,
    value: { kind, path: normalized || "." },
  };
}

export async function it_selectSessionsDirFromWebview(params: {
  context: ItWorkspaceUseCaseContext;
}): Promise<ItWorkspaceResult<{ canceled?: boolean; sessionsDir?: string }>> {
  const configBundle = params.context.configService.loadBundle();
  const workspaceRoot = params.context.requireWorkspaceRoot();
  const selectedPath = await params.context.selectDirectory({
    openLabel: "选择会话目录",
    defaultPath: workspaceRoot,
  });
  if (!selectedPath) {
    return { configBundle, value: { canceled: true } };
  }

  const normalized = it_normalizeRelativePath(workspaceRoot, selectedPath);
  if (!normalized) {
    params.context.showWarning("所选目录必须位于当前工作区内");
    return { configBundle, value: { canceled: true } };
  }

  configBundle.skill = {
    ...configBundle.skill,
    sessions_dir: normalized || "sessions",
  };
  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();

  return {
    configBundle,
    configSnapshot,
    value: { sessionsDir: normalized || "sessions" },
  };
}
