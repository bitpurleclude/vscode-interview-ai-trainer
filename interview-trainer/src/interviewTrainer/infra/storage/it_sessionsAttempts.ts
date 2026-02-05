import fs from "fs";
import path from "path";
import type { ItSessionsConfig } from "./it_sessionsTypes";
import { it_makeSlug } from "../utils/it_text";
import { it_readJson, it_readJsonAsync, it_writeJson, it_writeJsonAsync, it_ensureDir, it_ensureDirAsync } from "./it_sessionsFs";

export function it_appendAttemptData(topicDir: string, payload: any): string {
  const dataPath = path.join(topicDir, "attempts.json");
  const existing = it_readJson(dataPath);
  const list = Array.isArray(existing) ? existing : [];
  list.push(payload);
  it_writeJson(dataPath, list);
  return dataPath;
}

export async function it_appendAttemptDataAsync(
  topicDir: string,
  payload: any,
): Promise<string> {
  const dataPath = path.join(topicDir, "attempts.json");
  const existing = await it_readJsonAsync(dataPath);
  const list = Array.isArray(existing) ? existing : [];
  list.push(payload);
  await it_writeJsonAsync(dataPath, list);
  return dataPath;
}

export function it_nextAttemptIndex(reportPath: string): number {
  if (!fs.existsSync(reportPath)) {
    return 1;
  }
  const text = fs.readFileSync(reportPath, "utf-8");
  const matches = text.match(/^##\s/gm);
  return (matches?.length || 0) + 1;
}

export async function it_nextAttemptIndexAsync(reportPath: string): Promise<number> {
  try {
    const text = await fs.promises.readFile(reportPath, "utf-8");
    const matches = text.match(/^##\s/gm);
    return (matches?.length || 0) + 1;
  } catch {
    return 1;
  }
}

export function it_storeAudioCopy(
  audioPath: string,
  topicDir: string,
  attemptIndex: number,
): string {
  const ext = path.extname(audioPath) || ".wav";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(
    topicDir,
    `attempt-${String(attemptIndex).padStart(2, "0")}-${timestamp}${ext}`,
  );
  if (path.resolve(audioPath) !== path.resolve(target)) {
    fs.copyFileSync(audioPath, target);
  }
  return target;
}

export function it_reportPathForTopic(
  topicDir: string,
  topicTitle: string,
  cfg: ItSessionsConfig,
): string {
  const filename = it_makeSlug(topicTitle, cfg.allowUnicode, cfg.maxSlugLen);
  const reportDir = cfg.centerSubdir
    ? it_ensureDir(path.join(topicDir, cfg.centerSubdir))
    : topicDir;
  return path.join(reportDir, `${filename}.md`);
}

export async function it_reportPathForTopicAsync(
  topicDir: string,
  topicTitle: string,
  cfg: ItSessionsConfig,
): Promise<string> {
  const filename = it_makeSlug(topicTitle, cfg.allowUnicode, cfg.maxSlugLen);
  const reportDir = cfg.centerSubdir
    ? await it_ensureDirAsync(path.join(topicDir, cfg.centerSubdir))
    : topicDir;
  return path.join(reportDir, `${filename}.md`);
}