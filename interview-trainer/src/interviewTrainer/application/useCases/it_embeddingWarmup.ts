import path from "path";
import { it_resolveBindingTemplate } from "../services/it_templateGateway";
import { it_buildCorpusAsync, it_prepareEmbeddingCache } from "../services/it_notesGateway";
import { it_hashText } from "../services/it_textGateway";
import { it_normalizeWorkspaceKey } from "../services/it_configSnapshot";
import {
  it_clampInteger,
  it_getRetrievalGuardrails,
} from "../services/it_guardrails";

export type ItEmbeddingWarmupHost = {
  context: import("vscode").ExtensionContext;
  state: import("../../../protocol/interviewTrainer").ItState;
  configBundle: import("../services/it_configGateway").ItConfigBundle;
  configService: import("../services/it_configGateway").ItConfigService;
  embeddingWarmupTimer: ReturnType<typeof setTimeout> | null;
  embeddingWarmupAbort: { aborted: boolean } | null;
  embeddingWarmupRunning: boolean;
  corpusDirty: boolean;
  corpusDirtyFiles: Set<string>;
  updateEmbeddingWarmup: (next: Partial<import("../../../protocol/interviewTrainer").ItEmbeddingWarmupState>) => void;
  logCorpusTrace: (message: string, detail?: Record<string, unknown>) => void;
  requireWorkspaceRoot: () => string;
  isIdleForWarmup: () => boolean;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
};

export function it_isIdleForWarmup(host: ItEmbeddingWarmupHost): boolean {
  if (host.state.recordingState !== "idle") {
    return false;
  }
  return !host.state.steps.some((step) => step.status === "running");
}




export function it_scheduleEmbeddingWarmup(
  host: ItEmbeddingWarmupHost,
  reason: string,
  delayMs: number = 2500,
): void {
  if (host.embeddingWarmupTimer) {
    clearTimeout(host.embeddingWarmupTimer);
    host.embeddingWarmupTimer = null;
  }
  host.embeddingWarmupTimer = setTimeout(() => {
    host.embeddingWarmupTimer = null;
    void it_runEmbeddingWarmup(host, reason);
  }, delayMs);
}

export async function it_runEmbeddingWarmup(
  host: ItEmbeddingWarmupHost,
  reason: string,
): Promise<void> {
  if (host.embeddingWarmupRunning) {
    return;
  }
  if (!host.isIdleForWarmup()) {
    return;
  }
  let workspaceRoot = "";
  try {
    workspaceRoot = host.requireWorkspaceRoot();
  } catch {
    return;
  }
  host.configBundle = host.configService.loadBundle();
  host.configBundle = await host.configService.ensureTemplatesConfig(host.configBundle);
  const retrievalEnabled = host.configBundle.skill.retrieval?.enabled !== false;
  if (!retrievalEnabled) {
    host.updateEmbeddingWarmup({
      status: "idle",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算跳过：检索已关闭",
    });
    return;
  }
  const retrievalMode = String(host.configBundle.skill.retrieval?.mode || "vector");
  if (retrievalMode !== "vector") {
    host.updateEmbeddingWarmup({
      status: "idle",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算跳过：当前为词面模式",
    });
    return;
  }
  const retrievalCfg = host.configBundle.skill.retrieval ?? {};
  const retrievalGuardrails = it_getRetrievalGuardrails(host.configBundle);
  const env = host.configBundle.api.active?.environment || "prod";
  const templatesConfig = host.configBundle.templates || { version: 1, environments: {} };
  const embeddingTemplate = it_resolveBindingTemplate(
    templatesConfig,
    env,
    "embedding",
    "retrieval",
  );
  const warmupConcurrency = it_clampInteger(
    retrievalCfg.embedding_max_concurrency ?? retrievalCfg.embeddingMaxConcurrency,
    Number(
      retrievalCfg.embedding_max_concurrency ??
        retrievalCfg.embeddingMaxConcurrency ??
        retrievalGuardrails.warmupConcurrency.min,
    ),
    retrievalGuardrails.warmupConcurrency,
  );
  const cacheRoot = host.context.globalStorageUri?.fsPath;
  const corpusCacheMb = Number(
    retrievalCfg.corpus_cache_mb ?? retrievalCfg.corpus_cache_max_mb ?? 25,
  );
  const corpusCacheBytes = Number.isFinite(corpusCacheMb)
    ? Math.max(0, corpusCacheMb) * 1024 * 1024
    : undefined;
  const workspaceCfg = host.configBundle.skill.workspace ?? {};
  const skipMtimeCheck = !host.corpusDirty;
  const corpus = await it_buildCorpusAsync({
    notes: path.join(workspaceRoot, workspaceCfg.notes_dir || "inputs/notes"),
    prompts: path.join(
      workspaceRoot,
      workspaceCfg.prompts_dir || "inputs/prompts/guangdong",
    ),
    rubrics: path.join(
      workspaceRoot,
      workspaceCfg.rubrics_dir || "inputs/rubrics",
    ),
    knowledge: path.join(
      workspaceRoot,
      workspaceCfg.knowledge_dir || "inputs/knowledge",
    ),
    examples: path.join(
      workspaceRoot,
      workspaceCfg.examples_dir || "inputs/examples",
    ),
  }, {
    cacheDir: cacheRoot,
    maxCacheBytes: corpusCacheBytes,
    skipMtimeCheck,
    dirtyFiles: Array.from(host.corpusDirtyFiles),
    onTrace: (message, detail) => host.logCorpusTrace(message, detail),
  });
  host.corpusDirty = false;
  host.corpusDirtyFiles.clear();
  if (!corpus.length) {
    host.updateEmbeddingWarmup({
      status: "success",
      progress: 100,
      total: 0,
      done: 0,
      message: "向量预计算完成：暂无可用笔记",
    });
    return;
  }

  const vectorCfg = retrievalCfg.vector ?? {};
  const providerProfiles = host.configBundle.providers ?? {};
  const embeddingProvider =
    retrievalCfg.embedding_provider || vectorCfg.provider || "";
  const providerEmbedding =
    (embeddingProvider && providerProfiles[embeddingProvider]?.embedding) || {};
  const resolvedVector = {
    provider: providerEmbedding.provider || vectorCfg.provider || embeddingProvider,
    baseUrl: providerEmbedding.base_url || vectorCfg.base_url || "",
    apiKey: providerEmbedding.api_key || vectorCfg.api_key || "",
    model: providerEmbedding.model || vectorCfg.model || "",
    timeoutSec: Number(providerEmbedding.timeout_sec ?? vectorCfg.timeout_sec ?? 30),
    maxRetries: Number(providerEmbedding.max_retries ?? vectorCfg.max_retries ?? 1),
    batchSize: it_clampInteger(
      vectorCfg.batch_size,
      Number(vectorCfg.batch_size ?? 16),
      retrievalGuardrails.vectorBatchSize,
    ),
    queryMaxChars: it_clampInteger(
      vectorCfg.query_max_chars,
      Number(vectorCfg.query_max_chars ?? 1500),
      retrievalGuardrails.vectorQueryMaxChars,
    ),
    embeddingRequestSplitThreshold: retrievalGuardrails.embeddingRequestSplitThreshold,
    template: embeddingTemplate || undefined,
    templateEnv: env,
    templateContext: host.context,
  };
  if (!embeddingTemplate) {
    host.updateEmbeddingWarmup({
      status: "idle",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算跳过：Embedding 模板未绑定",
    });
    return;
  }
  if (
    !resolvedVector.template &&
    (!resolvedVector.provider ||
      !resolvedVector.apiKey ||
      !resolvedVector.baseUrl ||
      !resolvedVector.model)
  ) {
    host.updateEmbeddingWarmup({
      status: "idle",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算跳过：Embedding 配置不完整",
    });
    return;
  }

  if (!cacheRoot) {
    host.updateEmbeddingWarmup({
      status: "error",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算失败：无法定位缓存目录",
    });
    return;
  }
  const cacheDir = path.join(
    cacheRoot,
    "embedding_cache",
    it_hashText(it_normalizeWorkspaceKey(workspaceRoot)),
  );

  host.embeddingWarmupRunning = true;
  host.embeddingWarmupAbort = { aborted: false };
  host.updateEmbeddingWarmup({
    status: "running",
    progress: 0,
    total: 0,
    done: 0,
    message: `向量预计算准备中 · ${reason}`,
  });
  try {
    const result = await it_prepareEmbeddingCache(corpus, resolvedVector, {
      cacheDir,
      signal: host.embeddingWarmupAbort,
      maxConcurrency: warmupConcurrency,
      onTrace: (message, detail) => host.logCorpusTrace(message, detail),
      onProgress: (done, total) => {
        const progress = total ? Math.round((done / total) * 100) : 100;
        const message = total
          ? `向量预计算 ${done}/${total}`
          : "向量缓存已是最新";
        host.updateEmbeddingWarmup({
          status: "running",
          progress,
          total,
          done,
          message,
        });
      },
    });
    if (result.aborted) {
      host.updateEmbeddingWarmup({
        status: "idle",
        progress: 0,
        total: 0,
        done: 0,
        message: "向量预计算已取消",
      });
      return;
    }
    host.updateEmbeddingWarmup({
      status: "success",
      progress: 100,
      total: result.total,
      done: result.created + result.cached,
      message: "向量预计算完成",
    });
  } catch (error) {
    host.updateEmbeddingWarmup({
      status: "error",
      progress: 0,
      total: 0,
      done: 0,
      message: error instanceof Error ? error.message : "向量预计算失败",
    });
  } finally {
    host.embeddingWarmupRunning = false;
    host.embeddingWarmupAbort = null;
  }
}
