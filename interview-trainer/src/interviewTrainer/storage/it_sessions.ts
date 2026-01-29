import fs from "fs";
import path from "path";
import { it_hashText, it_makeSlug, it_normalizeText } from "../utils/it_text";

export interface ItSessionsConfig {
  sessionsDir: string;
  allowUnicode: boolean;
  maxSlugLen: number;
  similarityThreshold: number;
  centerSubdir?: string;
}

export interface ItTopicMeta {
  topicTitle: string;
  questionText: string;
  questionList: string[];
  questionHash: string;
  createdAt: string;
  updatedAt: string;
  overallScore?: number;
}

function it_ensureDir(dirPath: string): string {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

async function it_ensureDirAsync(dirPath: string): Promise<string> {
  await fs.promises.mkdir(dirPath, { recursive: true });
  return dirPath;
}

function it_readJson(filePath: string): any {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const raw = fs.readFileSync(filePath, "utf-8");
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function it_writeJson(filePath: string, payload: any): void {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

async function it_readJsonAsync(filePath: string): Promise<any> {
  try {
    const raw = await fs.promises.readFile(filePath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function it_writeJsonAsync(filePath: string, payload: any): Promise<void> {
  await fs.promises.writeFile(filePath, JSON.stringify(payload, null, 2), "utf-8");
}

function it_similarityRatio(a: string, b: string): number {
  if (!a || !b) {
    return 0;
  }
  const shorter = a.length <= b.length ? a : b;
  const longer = a.length > b.length ? a : b;
  let hits = 0;
  for (let i = 0; i < shorter.length; i += 1) {
    if (shorter[i] === longer[i]) {
      hits += 1;
    }
  }
  return hits / longer.length;
}

export function it_findExistingTopicDir(
  sessionsRoot: string,
  candidateTitle: string,
  candidateText: string,
  cfg: ItSessionsConfig,
): string | null {
  const threshold = cfg.similarityThreshold;
  const candidateHash = it_hashText(it_normalizeText(candidateTitle || candidateText));
  let bestMatch: string | null = null;
  let bestScore = 0;

  if (!fs.existsSync(sessionsRoot)) {
    return null;
  }
  const metaFiles: string[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === "meta.json") {
        metaFiles.push(fullPath);
      }
    }
  };
  walk(sessionsRoot);

  for (const metaPath of metaFiles) {
    const meta = it_readJson(metaPath);
    if (meta.questionHash && meta.questionHash === candidateHash) {
      return path.dirname(metaPath);
    }
    const score = Math.max(
      it_similarityRatio(candidateTitle || "", meta.topicTitle || ""),
      it_similarityRatio(candidateTitle || "", (meta.questionText || "").slice(0, 64)),
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = path.dirname(metaPath);
    }
  }
  return bestMatch;
}

export async function it_findExistingTopicDirAsync(
  sessionsRoot: string,
  candidateTitle: string,
  candidateText: string,
  cfg: ItSessionsConfig,
): Promise<string | null> {
  const threshold = cfg.similarityThreshold;
  const candidateHash = it_hashText(it_normalizeText(candidateTitle || candidateText));
  let bestMatch: string | null = null;
  let bestScore = 0;

  try {
    await fs.promises.access(sessionsRoot);
  } catch {
    return null;
  }

  const metaFiles: string[] = [];
  const stack = [sessionsRoot];
  while (stack.length) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.name === "meta.json") {
        metaFiles.push(fullPath);
      }
    }
  }

  for (const metaPath of metaFiles) {
    const meta = await it_readJsonAsync(metaPath);
    if (meta.questionHash && meta.questionHash === candidateHash) {
      return path.dirname(metaPath);
    }
    const score = Math.max(
      it_similarityRatio(candidateTitle || "", meta.topicTitle || ""),
      it_similarityRatio(candidateTitle || "", (meta.questionText || "").slice(0, 64)),
    );
    if (score >= threshold && score > bestScore) {
      bestScore = score;
      bestMatch = path.dirname(metaPath);
    }
  }
  return bestMatch;
}

export function it_resolveTopicDir(
  workspaceRoot: string,
  topicTitle: string,
  questionText: string,
  cfg: ItSessionsConfig,
): string {
  const sessionsRoot = it_ensureDir(path.join(workspaceRoot, cfg.sessionsDir));
  const existing = it_findExistingTopicDir(sessionsRoot, topicTitle, questionText, cfg);
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
  cfg: ItSessionsConfig,
): Promise<string> {
  const sessionsRoot = await it_ensureDirAsync(path.join(workspaceRoot, cfg.sessionsDir));
  const existing = await it_findExistingTopicDirAsync(
    sessionsRoot,
    topicTitle,
    questionText,
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

export function it_storeAudioCopy(
  audioPath: string,
  topicDir: string,
  attemptIndex: number,
): string {
  const ext = path.extname(audioPath) || ".wav";
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(topicDir, `attempt-${String(attemptIndex).padStart(2, "0")}-${timestamp}${ext}`);
  if (path.resolve(audioPath) !== path.resolve(target)) {
    fs.copyFileSync(audioPath, target);
  }
  return target;
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
