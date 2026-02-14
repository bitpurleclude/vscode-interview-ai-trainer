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
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
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

type ItWorkspaceTraceLevel = "debug" | "info" | "warn" | "error";

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

function it_normalizeWorkspaceDirSetting(
  workspaceRoot: string,
  selectedPath: string,
): { normalized: string; outsideWorkspace: boolean } {
  const inWorkspace = it_normalizeRelativePath(workspaceRoot, selectedPath);
  if (inWorkspace) {
    return {
      normalized: inWorkspace,
      outsideWorkspace: false,
    };
  }
  return {
    normalized: path.resolve(selectedPath).split(path.sep).join("/"),
    outsideWorkspace: true,
  };
}

function it_traceWorkspace(
  context: ItWorkspaceUseCaseContext,
  event: string,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItWorkspaceTraceLevel = "info",
): void {
  context.logCorpusTrace?.(`workspace ${action} ${status}`, {
    event,
    status,
    level,
    module: "it_workspaceActions",
    ...(detail || {}),
  });
}

export async function it_selectWorkspaceDirFromWebview(params: {
  context: ItWorkspaceUseCaseContext;
  payload: unknown;
}): Promise<ItWorkspaceResult<{ canceled?: boolean; kind?: string; path?: string }>> {
  const payload = it_asRecord(params.payload);
  const kind = String(payload.kind || "") as ItWorkspaceSelectionKind;
  const targetKey = WORKSPACE_DIR_KEY_MAP[kind];
  if (!targetKey) {
    it_traceWorkspace(
      params.context,
      "application.workspace.select_dir",
      "select_dir",
      "error",
      { kind },
      "error",
    );
    throw new Error("invalid workspace kind");
  }

  const configBundle = params.context.configService.loadBundle();
  const workspaceRoot = params.context.requireWorkspaceRoot();
  const skillConfig = (configBundle.skill || {}) as Record<string, unknown>;
  const workspaceConfig = (skillConfig.workspace || {}) as Record<string, unknown>;
  const current = String(workspaceConfig[targetKey] ?? skillConfig[targetKey] ?? "").trim();
  const defaultPath = current
    ? path.isAbsolute(current)
      ? current
      : path.join(workspaceRoot, current)
    : workspaceRoot;

  it_traceWorkspace(params.context, "application.workspace.select_dir", "select_dir", "start", {
    kind,
    targetKey,
    defaultPath,
    current,
  });

  const selectedPath = await params.context.selectDirectory({
    openLabel: "选择目录",
    defaultPath,
  });
  if (!selectedPath) {
    it_traceWorkspace(
      params.context,
      "application.workspace.select_dir",
      "select_dir",
      "canceled",
      {
        kind,
        targetKey,
        reason: "user_cancelled",
      },
    );
    return { configBundle, value: { canceled: true } };
  }

  const normalizedSelection = it_normalizeWorkspaceDirSetting(workspaceRoot, selectedPath);
  const normalized = normalizedSelection.normalized;
  if (normalizedSelection.outsideWorkspace) {
    params.context.showWarning(
      "Selected directory is outside workspace. It will be stored as an absolute path.",
    );
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

  it_traceWorkspace(params.context, "application.workspace.select_dir", "select_dir", "success", {
    kind,
    targetKey,
    selectedPath,
    normalizedPath: normalized || ".",
    outsideWorkspace: normalizedSelection.outsideWorkspace,
  });

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

  it_traceWorkspace(
    params.context,
    "application.workspace.select_sessions_dir",
    "select_sessions_dir",
    "start",
    { defaultPath: workspaceRoot },
  );

  const selectedPath = await params.context.selectDirectory({
    openLabel: "选择会话目录",
    defaultPath: workspaceRoot,
  });
  if (!selectedPath) {
    it_traceWorkspace(
      params.context,
      "application.workspace.select_sessions_dir",
      "select_sessions_dir",
      "canceled",
      { reason: "user_cancelled" },
    );
    return { configBundle, value: { canceled: true } };
  }

  const normalized = it_normalizeRelativePath(workspaceRoot, selectedPath);
  if (!normalized) {
    params.context.showWarning("所选目录必须位于当前工作区内。");
    it_traceWorkspace(
      params.context,
      "application.workspace.select_sessions_dir",
      "select_sessions_dir",
      "rejected",
      {
        selectedPath,
        reason: "outside_workspace",
      },
      "warn",
    );
    return { configBundle, value: { canceled: true } };
  }

  configBundle.skill = {
    ...configBundle.skill,
    sessions_dir: normalized || "sessions",
  };
  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();

  it_traceWorkspace(
    params.context,
    "application.workspace.select_sessions_dir",
    "select_sessions_dir",
    "success",
    {
      selectedPath,
      normalizedPath: normalized || "sessions",
    },
  );

  return {
    configBundle,
    configSnapshot,
    value: { sessionsDir: normalized || "sessions" },
  };
}
