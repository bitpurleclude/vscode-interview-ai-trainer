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
  logTrace: (message: string, detail?: Record<string, unknown>) => void;
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

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceCore(
  context: ItCoreUseCaseContext,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  context.logTrace(`core ${action} ${status}`, {
    event: `application.core.${action}`,
    status,
    ...(detail || {}),
  });
}

export function it_getStateFromWebview(params: {
  context: ItCoreUseCaseContext;
}): ItCoreResult<ItState> {
  it_traceCore(params.context, "get_state", "success");
  return {
    value: params.context.state,
  };
}

export async function it_getConfigFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<ItConfigSnapshot>> {
  it_traceCore(params.context, "get_config", "start");
  try {
    const configSnapshot = await params.context.refreshConfigSnapshot();
    params.context.scheduleEmbeddingWarmup("config");
    it_traceCore(params.context, "get_config", "success", {
      retrievalMode: configSnapshot.retrieval.mode,
      streamingEnabled: configSnapshot.streaming?.enabled !== false,
    });
    return {
      value: configSnapshot,
      configSnapshot,
    };
  } catch (error) {
    it_traceCore(params.context, "get_config", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export function it_enableTraceLogsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): ItCoreResult<{ enabled: true }> {
  params.context.setTraceLogsEnabled(true);
  params.context.showOutput();
  params.context.logTrace("trace logging enabled", {
    event: "config.trace.enabled",
    source: "webview",
  });
  it_traceCore(params.context, "enable_trace_logs", "success");
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
  const query = typeof payload.query === "string" ? payload.query : undefined;
  const limitRaw = Number(payload.limit);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined;

  it_traceCore(params.context, "list_history", "start", {
    queryLength: query?.length || 0,
    limit: limit ?? null,
  });
  try {
    const configBundle = params.context.configService.loadBundle();
    const workspaceRoot = params.context.requireWorkspaceRoot();
    const sessionsRoot = path.join(
      workspaceRoot,
      configBundle.skill.sessions_dir || "sessions",
    );
    const filenames = configBundle.skill.filenames ?? {};
    const topics = configBundle.skill.topics ?? {};
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
    it_traceCore(params.context, "list_history", "success", {
      sessionsRoot,
      historyCount: Array.isArray(history) ? history.length : undefined,
    });
    return {
      value: history,
      configBundle,
    };
  } catch (error) {
    it_traceCore(params.context, "list_history", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_openSettingsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ opened: true; path: string }>> {
  it_traceCore(params.context, "open_settings", "start");
  try {
    it_ensureConfigFiles(params.context.extensionContext);
    const configDir = params.context.extensionContext.globalStorageUri.fsPath;
    const target = path.join(configDir, "interview_trainer", "templates.yaml");
    await params.context.openFile(target);
    it_traceCore(params.context, "open_settings", "success", {
      target,
    });
    return {
      value: {
        opened: true,
        path: target,
      },
    };
  } catch (error) {
    it_traceCore(params.context, "open_settings", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_openMicSettingsFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ opened: boolean; target?: string }>> {
  it_traceCore(params.context, "open_mic_settings", "start", {
    platform: params.context.platform,
  });
  try {
    if (params.context.platform === "win32") {
      const target = "ms-settings:privacy-microphone";
      await params.context.openExternal(target);
      it_traceCore(params.context, "open_mic_settings", "success", {
        platform: params.context.platform,
        target,
      });
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
      it_traceCore(params.context, "open_mic_settings", "success", {
        platform: params.context.platform,
        target,
      });
      return {
        value: {
          opened: true,
          target,
        },
      };
    }

    params.context.showInfo("???????????????????");
    it_traceCore(params.context, "open_mic_settings", "manual", {
      platform: params.context.platform,
    });
    return {
      value: {
        opened: false,
      },
    };
  } catch (error) {
    it_traceCore(params.context, "open_mic_settings", "error", {
      platform: params.context.platform,
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_reloadWindowFromWebview(params: {
  context: ItCoreUseCaseContext;
}): Promise<ItCoreResult<{ reloaded: true }>> {
  it_traceCore(params.context, "reload_window", "start");
  try {
    await params.context.reloadWindow();
    it_traceCore(params.context, "reload_window", "success");
    return {
      value: {
        reloaded: true,
      },
    };
  } catch (error) {
    it_traceCore(params.context, "reload_window", "error", {
      error: it_errorMessage(error),
    });
    throw error;
  }
}
