import path from "path";
import fs from "fs";
import {
  it_clearEmbeddingMemoryCache,
  it_hashText,
} from "../../application/services/it_infraBridge";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerRetrievalHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/setRetrievalEnabled", async (msg) => {
    const enabled = Boolean(msg.data?.enabled);
    host.configBundle = host.configService.loadBundle();
    host.configBundle.skill = {
      ...host.configBundle.skill,
      retrieval: {
        ...host.configBundle.skill.retrieval,
        enabled,
      },
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    if (enabled) {
      host.scheduleEmbeddingWarmup("retrieval-toggle");
    }
    return { enabled };
  });
  host.webviewProtocol.on("it/updateRetrievalSettings", async (msg) => {
    const payload = msg.data || {};
    const incoming = payload.retrieval || {};
    host.configBundle = host.configService.loadBundle();
    const current = host.configBundle.skill.retrieval || {};
    const currentVector = current.vector || {};
    const incomingVector = incoming.vector || {};
    host.configBundle.skill = {
      ...host.configBundle.skill,
      retrieval: {
        ...current,
        enabled: incoming.enabled ?? current.enabled,
        mode: incoming.mode || current.mode || "vector",
        top_k: Number(incoming.topK ?? current.top_k ?? 5),
        top_k_notes: Number(incoming.topKNotes ?? current.top_k_notes ?? current.top_k ?? 5),
        top_k_knowledge: Number(
          incoming.topKKnowledge ?? current.top_k_knowledge ?? current.top_k ?? 5,
        ),
        top_k_rubrics: Number(
          incoming.topKRubrics ?? current.top_k_rubrics ?? current.top_k ?? 5,
        ),
        top_k_examples: Number(
          incoming.topKExamples ?? current.top_k_examples ?? current.top_k ?? 5,
        ),
        max_concurrency: Number(incoming.maxConcurrency ?? current.max_concurrency ?? 3),
        embedding_max_concurrency: Number(
          incoming.embeddingMaxConcurrency ?? current.embedding_max_concurrency ?? 1,
        ),
        min_score: Number(incoming.minScore ?? current.min_score ?? 0.2),
        vector: {
          ...currentVector,
          batch_size: Number(incomingVector.batchSize ?? currentVector.batch_size ?? 16),
          query_max_chars: Number(
            incomingVector.queryMaxChars ?? currentVector.query_max_chars ?? 1500,
          ),
        },
      },
    };
    host.configService.saveSkillConfig(host.configBundle.skill);
    host.configSnapshot = await host.refreshConfigSnapshot();
    host.webviewProtocol.send("it/configUpdate", host.configSnapshot);
    host.scheduleEmbeddingWarmup("retrieval-update");
    return host.configSnapshot;
  });
  host.webviewProtocol.on("it/clearEmbeddingCache", async () => {
    const workspaceRoot = host.requireWorkspaceRoot();
    const cacheRoot = host.context.globalStorageUri?.fsPath;
    if (!cacheRoot) {
      throw new Error("无法定位缓存目录");
    }
    const cacheDir = path.join(
      cacheRoot,
      "embedding_cache",
      it_hashText(host.normalizeWorkspaceKey(workspaceRoot)),
    );
    try {
      await fs.promises.access(cacheDir);
    } catch {
      return { cleared: false, path: cacheDir };
    }
    try {
      await fs.promises.rm(cacheDir, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 50,
      });
    } catch (error) {
      throw new Error(
        `清理缓存失败：${error instanceof Error ? error.message : String(error)}`,
      );
    }
    it_clearEmbeddingMemoryCache();
    host.updateEmbeddingWarmup({
      status: "running",
      progress: 0,
      total: 0,
      done: 0,
      message: "向量预计算准备中",
    });
    host.scheduleEmbeddingWarmup("clear-cache", 1000);
    return { cleared: true, path: cacheDir };
  });
  host.webviewProtocol.on("it/clearCorpusCache", async () => {
    const cacheRoot = host.context.globalStorageUri?.fsPath;
    if (!cacheRoot) {
      throw new Error("Cache root not available");
    }
    const cacheDir = path.join(cacheRoot, "corpus_cache");
    try {
      await fs.promises.access(cacheDir);
    } catch {
      it_clearEmbeddingMemoryCache();
      return { cleared: false, path: cacheDir };
    }
    try {
      await fs.promises.rm(cacheDir, {
        recursive: true,
        force: true,
        maxRetries: 2,
        retryDelay: 50,
      });
    } catch (error) {
      throw new Error(
        `Failed to clear corpus cache: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    it_clearEmbeddingMemoryCache();
    host.corpusDirty = true;
    host.updateEmbeddingWarmup({
      status: "running",
      progress: 0,
      total: 0,
      done: 0,
      message: "Rebuilding corpus index",
    });
    host.scheduleEmbeddingWarmup("clear-corpus-cache", 1000);
    return { cleared: true, path: cacheDir };
  });
}
