import path from "path";
import { it_makeSlug } from "../utils/it_text";
import type { ItSessionsConfig, ItTopicMeta } from "./it_sessionsTypes";
import {
  it_ensureDir,
  it_ensureDirAsync,
  it_readJson,
  it_readJsonAsync,
  it_writeJson,
  it_writeJsonAsync,
} from "./it_sessionsFs";
import { it_findExistingTopicDir, it_findExistingTopicDirAsync } from "./it_sessionsMatch";

export function it_resolveTopicDir(
  workspaceRoot: string,
  topicTitle: string,
  questionText: string,
  questionList: string[],
  cfg: ItSessionsConfig,
): string {
  const sessionsRoot = it_ensureDir(path.join(workspaceRoot, cfg.sessionsDir));
  const existing = it_findExistingTopicDir(
    sessionsRoot,
    topicTitle,
    questionText,
    questionList,
    cfg,
  );
  if (existing) {
    return existing;
  }
  const slug = it_makeSlug(topicTitle, cfg.allowUnicode, cfg.maxSlugLen);
  const dateDir = it_ensureDir(
    path.join(sessionsRoot, new Date().toISOString().slice(0, 10).replace(/-/g, "")),
  );
  return it_ensureDir(path.join(dateDir, slug));
}

export async function it_resolveTopicDirAsync(
  workspaceRoot: string,
  topicTitle: string,
  questionText: string,
  questionList: string[],
  cfg: ItSessionsConfig,
): Promise<string> {
  const sessionsRoot = await it_ensureDirAsync(path.join(workspaceRoot, cfg.sessionsDir));
  const existing = await it_findExistingTopicDirAsync(
    sessionsRoot,
    topicTitle,
    questionText,
    questionList,
    cfg,
  );
  if (existing) {
    return existing;
  }
  const slug = it_makeSlug(topicTitle, cfg.allowUnicode, cfg.maxSlugLen);
  const dateDir = await it_ensureDirAsync(
    path.join(sessionsRoot, new Date().toISOString().slice(0, 10).replace(/-/g, "")),
  );
  return it_ensureDirAsync(path.join(dateDir, slug));
}

export function it_readTopicMeta(topicDir: string): Partial<ItTopicMeta> {
  return it_readJson(path.join(topicDir, "meta.json"));
}

export function it_writeTopicMeta(topicDir: string, payload: ItTopicMeta): void {
  it_writeJson(path.join(topicDir, "meta.json"), payload);
}

export async function it_readTopicMetaAsync(
  topicDir: string,
): Promise<Partial<ItTopicMeta>> {
  return it_readJsonAsync(path.join(topicDir, "meta.json"));
}

export async function it_writeTopicMetaAsync(
  topicDir: string,
  payload: ItTopicMeta,
): Promise<void> {
  await it_writeJsonAsync(path.join(topicDir, "meta.json"), payload);
}