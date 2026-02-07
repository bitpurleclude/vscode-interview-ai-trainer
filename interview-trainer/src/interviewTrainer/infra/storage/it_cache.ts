import fs from "fs";
import path from "path";

async function it_removeDirIfExists(cacheDir: string): Promise<{ cleared: boolean; path: string }> {
  try {
    await fs.promises.access(cacheDir);
  } catch {
    return { cleared: false, path: cacheDir };
  }
  await fs.promises.rm(cacheDir, {
    recursive: true,
    force: true,
    maxRetries: 2,
    retryDelay: 50,
  });
  return { cleared: true, path: cacheDir };
}

export async function it_removeEmbeddingCacheDirAsync(
  cacheRoot: string,
  workspaceHash: string,
): Promise<{ cleared: boolean; path: string }> {
  const cacheDir = path.join(cacheRoot, "embedding_cache", workspaceHash);
  return it_removeDirIfExists(cacheDir);
}

export async function it_removeCorpusCacheDirAsync(
  cacheRoot: string,
): Promise<{ cleared: boolean; path: string }> {
  const cacheDir = path.join(cacheRoot, "corpus_cache");
  return it_removeDirIfExists(cacheDir);
}
