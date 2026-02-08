import fs from "fs";
import path from "path";

type ItCacheTraceSink = (message: string, detail?: Record<string, unknown>) => void;

function it_cacheTrace(
  onTrace: ItCacheTraceSink | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.(`storage cache ${action} ${status}`, {
    event: `infra.storage.cache.${action}`,
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

async function it_removeDirIfExists(
  cacheDir: string,
  onTrace?: ItCacheTraceSink,
): Promise<{ cleared: boolean; path: string }> {
  it_cacheTrace(onTrace, "remove_dir", "start", {
    path: cacheDir,
  });
  try {
    await fs.promises.access(cacheDir);
  } catch {
    it_cacheTrace(onTrace, "remove_dir", "noop", {
      path: cacheDir,
    });
    return { cleared: false, path: cacheDir };
  }

  try {
    await fs.promises.rm(cacheDir, {
      recursive: true,
      force: true,
      maxRetries: 2,
      retryDelay: 50,
    });
    it_cacheTrace(onTrace, "remove_dir", "success", {
      path: cacheDir,
    });
    return { cleared: true, path: cacheDir };
  } catch (error) {
    it_cacheTrace(onTrace, "remove_dir", "error", {
      path: cacheDir,
      error: it_errorMessage(error),
    });
    throw error;
  }
}

export async function it_removeEmbeddingCacheDirAsync(
  cacheRoot: string,
  workspaceHash: string,
  onTrace?: ItCacheTraceSink,
): Promise<{ cleared: boolean; path: string }> {
  const cacheDir = path.join(cacheRoot, "embedding_cache", workspaceHash);
  return it_removeDirIfExists(cacheDir, onTrace);
}

export async function it_removeCorpusCacheDirAsync(
  cacheRoot: string,
  onTrace?: ItCacheTraceSink,
): Promise<{ cleared: boolean; path: string }> {
  const cacheDir = path.join(cacheRoot, "corpus_cache");
  return it_removeDirIfExists(cacheDir, onTrace);
}
