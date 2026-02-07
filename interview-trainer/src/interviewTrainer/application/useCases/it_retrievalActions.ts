import type * as vscode from "vscode";
import type {
  ItConfigSnapshot,
  ItEmbeddingWarmupState,
} from "../../../protocol/interviewTrainer";
import type {
  ItConfigBundle,
  ItConfigService,
} from "../services/it_configGateway";
import { it_clearEmbeddingMemoryCache } from "../services/it_notesGateway";
import {
  it_removeCorpusCacheDirAsync,
  it_removeEmbeddingCacheDirAsync,
} from "../services/it_storageGateway";
import { it_hashText } from "../services/it_textGateway";

export type ItRetrievalUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  requireWorkspaceRoot: () => string;
  normalizeWorkspaceKey: (root: string) => string;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  updateEmbeddingWarmup: (next: Partial<ItEmbeddingWarmupState>) => void;
};

export type ItRetrievalHostPatch = {
  corpusDirty?: boolean;
};

export type ItRetrievalResult<T> = {
  configBundle: ItConfigBundle;
  value: T;
  patch?: ItRetrievalHostPatch;
};

export type ItRetrievalConfigResult<T> = ItRetrievalResult<T> & {
  configSnapshot: ItConfigSnapshot;
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_toNumber(value: unknown, fallback: number): number {
  return Number(value ?? fallback);
}

export async function it_setRetrievalEnabledFromWebview(params: {
  context: ItRetrievalUseCaseContext;
  payload: unknown;
}): Promise<ItRetrievalConfigResult<{ enabled: boolean }>> {
  const payload = it_asRecord(params.payload);
  const enabled = Boolean(payload.enabled);
  const configBundle = params.context.configService.loadBundle();
  configBundle.skill = {
    ...configBundle.skill,
    retrieval: {
      ...configBundle.skill.retrieval,
      enabled,
    },
  };
  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();
  if (enabled) {
    params.context.scheduleEmbeddingWarmup("retrieval-toggle");
  }
  return {
    configBundle,
    configSnapshot,
    value: { enabled },
  };
}

export async function it_updateRetrievalSettingsFromWebview(params: {
  context: ItRetrievalUseCaseContext;
  payload: unknown;
}): Promise<ItRetrievalConfigResult<ItConfigSnapshot>> {
  const payload = it_asRecord(params.payload);
  const incoming = it_asRecord(payload.retrieval);
  const incomingVector = it_asRecord(incoming.vector);
  const configBundle = params.context.configService.loadBundle();
  const current = configBundle.skill.retrieval || {};
  const currentVector = current.vector || {};

  configBundle.skill = {
    ...configBundle.skill,
    retrieval: {
      ...current,
      enabled: incoming.enabled ?? current.enabled,
      mode: String(incoming.mode || current.mode || "vector"),
      top_k: it_toNumber(incoming.topK, Number(current.top_k ?? 5)),
      top_k_notes: it_toNumber(incoming.topKNotes, Number(current.top_k_notes ?? current.top_k ?? 5)),
      top_k_knowledge: it_toNumber(
        incoming.topKKnowledge,
        Number(current.top_k_knowledge ?? current.top_k ?? 5),
      ),
      top_k_rubrics: it_toNumber(
        incoming.topKRubrics,
        Number(current.top_k_rubrics ?? current.top_k ?? 5),
      ),
      top_k_examples: it_toNumber(
        incoming.topKExamples,
        Number(current.top_k_examples ?? current.top_k ?? 5),
      ),
      max_concurrency: it_toNumber(incoming.maxConcurrency, Number(current.max_concurrency ?? 3)),
      embedding_max_concurrency: it_toNumber(
        incoming.embeddingMaxConcurrency,
        Number(current.embedding_max_concurrency ?? 1),
      ),
      min_score: it_toNumber(incoming.minScore, Number(current.min_score ?? 0.2)),
      vector: {
        ...currentVector,
        batch_size: it_toNumber(incomingVector.batchSize, Number(currentVector.batch_size ?? 16)),
        query_max_chars: it_toNumber(
          incomingVector.queryMaxChars,
          Number(currentVector.query_max_chars ?? 1500),
        ),
      },
    },
  };

  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();
  params.context.scheduleEmbeddingWarmup("retrieval-update");
  return {
    configBundle,
    configSnapshot,
    value: configSnapshot,
  };
}

export async function it_clearEmbeddingCacheFromWebview(params: {
  context: ItRetrievalUseCaseContext;
}): Promise<ItRetrievalResult<{ cleared: boolean; path: string }>> {
  const configBundle = params.context.configService.loadBundle();
  const workspaceRoot = params.context.requireWorkspaceRoot();
  const cacheRoot = params.context.extensionContext.globalStorageUri?.fsPath;
  if (!cacheRoot) {
    throw new Error("????????");
  }
  const workspaceHash = it_hashText(
    params.context.normalizeWorkspaceKey(workspaceRoot),
  );

  let result: { cleared: boolean; path: string };
  try {
    result = await it_removeEmbeddingCacheDirAsync(cacheRoot, workspaceHash);
  } catch (error) {
    throw new Error(
      `???????${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!result.cleared) {
    return { configBundle, value: result };
  }

  it_clearEmbeddingMemoryCache();
  params.context.updateEmbeddingWarmup({
    status: "running",
    progress: 0,
    total: 0,
    done: 0,
    message: "????????",
  });
  params.context.scheduleEmbeddingWarmup("clear-cache", 1000);
  return { configBundle, value: result };
}

export async function it_clearCorpusCacheFromWebview(params: {
  context: ItRetrievalUseCaseContext;
}): Promise<ItRetrievalResult<{ cleared: boolean; path: string }>> {
  const configBundle = params.context.configService.loadBundle();
  const cacheRoot = params.context.extensionContext.globalStorageUri?.fsPath;
  if (!cacheRoot) {
    throw new Error("Cache root not available");
  }

  let result: { cleared: boolean; path: string };
  try {
    result = await it_removeCorpusCacheDirAsync(cacheRoot);
  } catch (error) {
    throw new Error(
      `Failed to clear corpus cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  it_clearEmbeddingMemoryCache();
  if (!result.cleared) {
    return { configBundle, value: result };
  }

  params.context.updateEmbeddingWarmup({
    status: "running",
    progress: 0,
    total: 0,
    done: 0,
    message: "Rebuilding corpus index",
  });
  params.context.scheduleEmbeddingWarmup("clear-corpus-cache", 1000);
  return {
    configBundle,
    value: result,
    patch: {
      corpusDirty: true,
    },
  };
}
