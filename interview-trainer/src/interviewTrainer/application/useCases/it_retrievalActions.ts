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
import {
  it_clampFloat,
  it_clampInteger,
  it_getRetrievalGuardrails,
} from "../services/it_guardrails";

export type ItRetrievalUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  refreshConfigSnapshot: () => Promise<ItConfigSnapshot>;
  requireWorkspaceRoot: () => string;
  normalizeWorkspaceKey: (root: string) => string;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
  updateEmbeddingWarmup: (next: Partial<ItEmbeddingWarmupState>) => void;
  logCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
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


function it_traceRetrieval(
  context: ItRetrievalUseCaseContext,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  context.logCorpusTrace?.(`retrieval ${action} ${status}`, {
    event: `application.retrieval.${action}`,
    status,
    ...(detail || {}),
  });
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceClampChange(
  context: ItRetrievalUseCaseContext,
  field: string,
  rawValue: unknown,
  clampedValue: number,
): boolean {
  if (rawValue === undefined) {
    return false;
  }
  const normalized = typeof rawValue === "number" ? rawValue : Number(rawValue);
  const comparable = Number.isFinite(normalized) ? normalized : rawValue;
  if (comparable === clampedValue) {
    return false;
  }
  it_traceRetrieval(context, "guardrail_clamp", "warn", {
    field,
    rawValue: comparable,
    clampedValue,
  });
  return true;
}

export async function it_setRetrievalEnabledFromWebview(params: {
  context: ItRetrievalUseCaseContext;
  payload: unknown;
}): Promise<ItRetrievalConfigResult<{ enabled: boolean }>> {
  const payload = it_asRecord(params.payload);
  const enabled = Boolean(payload.enabled);
  it_traceRetrieval(params.context, "set_enabled", "start", {
    enabled,
  });
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
  it_traceRetrieval(params.context, "set_enabled", "success", {
    enabled,
  });
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
  it_traceRetrieval(params.context, "update_settings", "start");
  const incomingVector = it_asRecord(incoming.vector);
  const configBundle = params.context.configService.loadBundle();
  const current = configBundle.skill.retrieval || {};
  const currentVector = current.vector || {};
  const guardrails = it_getRetrievalGuardrails(configBundle);

  const modeCandidate = String(incoming.mode || current.mode || "vector");
  const mode = modeCandidate === "keyword" ? "keyword" : "vector";

  const topK = it_clampInteger(incoming.topK, Number(current.top_k ?? 5), guardrails.topK);
  const topKNotes = it_clampInteger(
    incoming.topKNotes,
    Number(current.top_k_notes ?? current.top_k ?? 5),
    guardrails.topK,
  );
  const topKKnowledge = it_clampInteger(
    incoming.topKKnowledge,
    Number(current.top_k_knowledge ?? current.top_k ?? 5),
    guardrails.topK,
  );
  const topKRubrics = it_clampInteger(
    incoming.topKRubrics,
    Number(current.top_k_rubrics ?? current.top_k ?? 5),
    guardrails.topK,
  );
  const topKExamples = it_clampInteger(
    incoming.topKExamples,
    Number(current.top_k_examples ?? current.top_k ?? 5),
    guardrails.topK,
  );
  const maxConcurrency = it_clampInteger(
    incoming.maxConcurrency,
    Number(current.max_concurrency ?? 3),
    guardrails.maxConcurrency,
  );
  const embeddingMaxConcurrency = it_clampInteger(
    incoming.embeddingMaxConcurrency,
    Number(current.embedding_max_concurrency ?? 2),
    guardrails.embeddingMaxConcurrency,
  );
  const minScore = it_clampFloat(
    incoming.minScore,
    Number(current.min_score ?? 0.2),
    guardrails.minScore,
  );
  const queryWindowSize = it_clampInteger(
    incoming.queryWindowSize,
    Number(current.query_window_size ?? guardrails.defaults.queryWindowSize),
    guardrails.queryWindowSize,
  );
  const questionMaxConcurrency = it_clampInteger(
    incoming.questionMaxConcurrency,
    Number(current.question_max_concurrency ?? guardrails.defaults.questionMaxConcurrency),
    guardrails.questionMaxConcurrency,
  );
  const kindMaxConcurrency = it_clampInteger(
    incoming.kindMaxConcurrency,
    Number(current.kind_max_concurrency ?? guardrails.defaults.kindMaxConcurrency),
    guardrails.kindMaxConcurrency,
  );
  const vectorBatchSize = it_clampInteger(
    incomingVector.batchSize,
    Number(currentVector.batch_size ?? 16),
    guardrails.vectorBatchSize,
  );
  const vectorQueryMaxChars = it_clampInteger(
    incomingVector.queryMaxChars,
    Number(currentVector.query_max_chars ?? 1500),
    guardrails.vectorQueryMaxChars,
  );

  let clampCount = 0;
  clampCount += Number(
    it_traceClampChange(params.context, "top_k", incoming.topK, topK),
  );
  clampCount += Number(
    it_traceClampChange(params.context, "top_k_notes", incoming.topKNotes, topKNotes),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "top_k_knowledge",
      incoming.topKKnowledge,
      topKKnowledge,
    ),
  );
  clampCount += Number(
    it_traceClampChange(params.context, "top_k_rubrics", incoming.topKRubrics, topKRubrics),
  );
  clampCount += Number(
    it_traceClampChange(params.context, "top_k_examples", incoming.topKExamples, topKExamples),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "max_concurrency",
      incoming.maxConcurrency,
      maxConcurrency,
    ),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "embedding_max_concurrency",
      incoming.embeddingMaxConcurrency,
      embeddingMaxConcurrency,
    ),
  );
  clampCount += Number(
    it_traceClampChange(params.context, "min_score", incoming.minScore, minScore),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "query_window_size",
      incoming.queryWindowSize,
      queryWindowSize,
    ),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "question_max_concurrency",
      incoming.questionMaxConcurrency,
      questionMaxConcurrency,
    ),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "kind_max_concurrency",
      incoming.kindMaxConcurrency,
      kindMaxConcurrency,
    ),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "vector.batch_size",
      incomingVector.batchSize,
      vectorBatchSize,
    ),
  );
  clampCount += Number(
    it_traceClampChange(
      params.context,
      "vector.query_max_chars",
      incomingVector.queryMaxChars,
      vectorQueryMaxChars,
    ),
  );

  configBundle.skill = {
    ...configBundle.skill,
    retrieval: {
      ...current,
      enabled: incoming.enabled ?? current.enabled,
      mode,
      top_k: topK,
      top_k_notes: topKNotes,
      top_k_knowledge: topKKnowledge,
      top_k_rubrics: topKRubrics,
      top_k_examples: topKExamples,
      max_concurrency: maxConcurrency,
      embedding_max_concurrency: embeddingMaxConcurrency,
      min_score: minScore,
      query_window_size: queryWindowSize,
      question_max_concurrency: questionMaxConcurrency,
      kind_max_concurrency: kindMaxConcurrency,
      vector: {
        ...currentVector,
        batch_size: vectorBatchSize,
        query_max_chars: vectorQueryMaxChars,
      },
    },
  };

  params.context.configService.saveSkillConfig(configBundle.skill);
  const configSnapshot = await params.context.refreshConfigSnapshot();
  params.context.scheduleEmbeddingWarmup("retrieval-update");
  it_traceRetrieval(params.context, "update_settings", "success", {
    mode,
    topK: configBundle.skill.retrieval?.top_k,
    clampCount,
  });
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
  it_traceRetrieval(params.context, "clear_embedding_cache", "start", {
    workspaceRoot,
  });
  const cacheRoot = params.context.extensionContext.globalStorageUri?.fsPath;
  if (!cacheRoot) {
    throw new Error("缓存目录不可用");
  }
  const workspaceHash = it_hashText(
    params.context.normalizeWorkspaceKey(workspaceRoot),
  );

  let result: { cleared: boolean; path: string };
  try {
    result = await it_removeEmbeddingCacheDirAsync(
      cacheRoot,
      workspaceHash,
      params.context.logCorpusTrace,
    );
  } catch (error) {
    it_traceRetrieval(params.context, "clear_embedding_cache", "error", {
      error: it_errorMessage(error),
    });
    throw new Error(
      `清理向量缓存失败：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  if (!result.cleared) {
    it_traceRetrieval(params.context, "clear_embedding_cache", "noop", {
      path: result.path,
    });
    return { configBundle, value: result };
  }

  it_clearEmbeddingMemoryCache();
  params.context.updateEmbeddingWarmup({
    status: "running",
    progress: 0,
    total: 0,
    done: 0,
    message: "向量缓存已清理，准备重新预热",
  });
  params.context.scheduleEmbeddingWarmup("clear-cache", 1000);
  it_traceRetrieval(params.context, "clear_embedding_cache", "success", {
    path: result.path,
    cleared: result.cleared,
  });
  return { configBundle, value: result };
}

export async function it_clearCorpusCacheFromWebview(params: {
  context: ItRetrievalUseCaseContext;
}): Promise<ItRetrievalResult<{ cleared: boolean; path: string }>> {
  const configBundle = params.context.configService.loadBundle();
  const cacheRoot = params.context.extensionContext.globalStorageUri?.fsPath;
  it_traceRetrieval(params.context, "clear_corpus_cache", "start", {
    cacheRoot,
  });
  if (!cacheRoot) {
    throw new Error("Cache root not available");
  }

  let result: { cleared: boolean; path: string };
  try {
    result = await it_removeCorpusCacheDirAsync(
      cacheRoot,
      params.context.logCorpusTrace,
    );
  } catch (error) {
    it_traceRetrieval(params.context, "clear_corpus_cache", "error", {
      error: it_errorMessage(error),
    });
    throw new Error(
      `Failed to clear corpus cache: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  it_clearEmbeddingMemoryCache();
  if (!result.cleared) {
    it_traceRetrieval(params.context, "clear_corpus_cache", "noop", {
      path: result.path,
    });
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
  it_traceRetrieval(params.context, "clear_corpus_cache", "success", {
    path: result.path,
    cleared: result.cleared,
  });
  return {
    configBundle,
    value: result,
    patch: {
      corpusDirty: true,
    },
  };
}
