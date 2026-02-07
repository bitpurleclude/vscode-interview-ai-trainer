import path from "path";
import { it_ensureConfigFiles } from "../services/it_configGateway";
import type {
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";
import { it_listHistoryItems } from "../services/it_storageGateway";
import type {
  ItConfigSnapshot,
  ItState,
} from "../../../protocol/interviewTrainer";
import type * as vscode from "vscode";

export type ItCoreUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  state: ItState;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  requireWorkspaceRoot: () => string;
  setTraceLogsEnabled: (enabled: boolean) => void;
  showOutput: () => void;
  appendOutputLine: (line: string) => void;
  nowIso: () => string;
  platform: NodeJS.Platform;
  openFile: (filePath: string) => Promise<void>;
  openExternal: (uri: string) => Promise<void>;
  showInfo: (message: string) => void;
  reloadWindow: () => Promise<void>;
};

export type ItCoreResult<T> = {
  value: T;
  configBundle?: ItConfigBundle;
  configSnapshot?: ItConfigSnapshot;
};

export function it_getStateFromWebview(params: {
  context: ItCoreUseCaseContext;
}): ItCoreResult<ItState> {
  return {
    value: params.context.state,
  };
}

export async function it_getConfigFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<ItConfigSnapshot>> {
  const configSnapshot = await params.context.refreshConfigSnapshot();
  const configBundle = params.context.configService.loadBundle();
  params.context.scheduleEmbeddingWarmup("config");
  return {
    value: configSnapshot,
    configSnapshot,
    configBundle,
  };
}

export function it_enableTraceLogsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): ItCoreResult<{ enabled: true }> {
  params.context.setTraceLogsEnabled(true);
  params.context.showOutput();
  params.context.appendOutputLine(
    `[${params.context.nowIso()}] ???????????`,
  );
  return {
    value: { enabled: true },
  };
}

export async function it_listHistoryFromWebview(params: {
  context: ItCoreUseCaseContext;
  payload: unknown;
}): Promise<ItCoreResult<unknown>> {
  const payload =
    params.payload && typeof params.payload === "object"
      ? (params.payload as Record<string, unknown>)
      : {};
  const configBundle = params.context.configService.loadBundle();
  const workspaceRoot = params.context.requireWorkspaceRoot();
  const sessionsRoot = path.join(
    workspaceRoot,
    configBundle.skill.sessions_dir || "sessions",
  );
  const filenames = configBundle.skill.filenames ?? {};
  const topics = configBundle.skill.topics ?? {};
  const query = typeof payload.query === "string" ? payload.query : undefined;
  const limitRaw = Number(payload.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;
  const history = await it_listHistoryItems(
    sessionsRoot,
    query,
    limit,
    {
      allowUnicode: filenames.allow_unicode ?? true,
      maxSlugLen: filenames.max_slug_len ?? 16,
      centerSubdir: topics.center_subdir || "",
    },
  );
  return {
    value: history,
    configBundle,
  };
}

export async function it_openSettingsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ opened: true; path: string }>> {
  it_ensureConfigFiles(params.context.extensionContext);
  const configDir = params.context.extensionContext.globalStorageUri.fsPath;
  const target = path.join(configDir, "interview_trainer", "templates.yaml");
  await params.context.openFile(target);
  return {
    value: {
      opened: true,
      path: target,
    },
  };
}

export async function it_openMicSettingsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ opened: boolean; target?: string }>> {
  if (params.context.platform === "win32") {
    const target = "ms-settings:privacy-microphone";
    await params.context.openExternal(target);
    return {
      value: {
        opened: true,
        target,
      },
    };
  }
  if (params.context.platform === "darwin") {
    const target =
      "x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone";
    await params.context.openExternal(target);
    return {
      value: {
        opened: true,
        target,
      },
    };
  }

  params.context.showInfo("??????????????????");
  return {
    value: {
      opened: false,
    },
  };
}

export async function it_reloadWindowFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ reloaded: true }>> {
  await params.context.reloadWindow();
  return {
    value: {
      reloaded: true,
    },
  };
}
