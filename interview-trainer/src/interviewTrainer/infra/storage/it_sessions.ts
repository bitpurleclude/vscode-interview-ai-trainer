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

function it_normalizeForMatch(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s.,;:!?，。？！；：、"'“”‘’()（）【】\[\]{}<>《》\-_/\\]+/g, "");
}

function it_buildBigrams(text: string): Map<string, number> {
  const map = new Map<string, number>();
  for (let i = 0; i < text.length - 1; i += 1) {
    const token = text.slice(i, i + 2);
    map.set(token, (map.get(token) ?? 0) + 1);
  }
  return map;
}

function it_similarityRatio(a: string, b: string): number {
  const left = it_normalizeForMatch(a);
  const right = it_normalizeForMatch(b);
  if (!left || !right) {
    return 0;
  }
  if (left === right) {
    return 1;
  }
  if (left.length < 2 || right.length < 2) {
    return left === right ? 1 : 0;
  }
  const leftMap = it_buildBigrams(left);
  const rightMap = it_buildBigrams(right);
  let matches = 0;
  let total = 0;
  leftMap.forEach((count) => {
    total += count;
  });
  rightMap.forEach((count, key) => {
    total += count;
    const hit = leftMap.get(key);
    if (hit) {
      matches += Math.min(hit, count);
    }
  });
  return total ? (2 * matches) / total : 0;
}

export function it_buildQuestionFingerprint(
  questionText: string,
  questionList?: string[],
): string {
  const parts: string[] = [];
  const normalizedText = it_normalizeForMatch(questionText);
  if (normalizedText) {
    parts.push(normalizedText);
  }
  if (questionList && questionList.length) {
    const normalizedList = questionList
      .map((item) => it_normalizeForMatch(item))
      .filter(Boolean);
    if (normalizedList.length) {
      parts.push(normalizedList.join("|"));
    }
  }
  return parts.join("|");
}

export function it_findExistingTopicDir(
  sessionsRoot: string,
  candidateTitle: string,
  candidateText: string,
  candidateQuestions: string[] | undefined,
  cfg: ItSessionsConfig,
): string | null {
  const threshold = cfg.similarityThreshold;
  const candidateBase =
    candidateText || (candidateQuestions?.length ? candidateQuestions.join(" ") : "") || candidateTitle;
  const candidateFingerprint = it_buildQuestionFingerprint(
    candidateText,
    candidateQuestions,
  );
  const candidateHash = it_hashText(
    candidateFingerprint || it_normalizeText(candidateBase || candidateTitle),
  );
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
    const metaQuestions = Array.isArray(meta.questionList)
      ? meta.questionList.join(" ")
      : "";
    const metaBase = meta.questionText || metaQuestions || meta.topicTitle || "";
    const score = Math.max(
      it_similarityRatio(candidateBase || "", metaBase),
      it_similarityRatio(candidateTitle || "", meta.topicTitle || ""),
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
  candidateQuestions: string[] | undefined,
  cfg: ItSessionsConfig,
): Promise<string | null> {
  const threshold = cfg.similarityThreshold;
  const candidateBase =
    candidateText || (candidateQuestions?.length ? candidateQuestions.join(" ") : "") || candidateTitle;
  const candidateFingerprint = it_buildQuestionFingerprint(
    candidateText,
    candidateQuestions,
  );
  const candidateHash = it_hashText(
    candidateFingerprint || it_normalizeText(candidateBase || candidateTitle),
  );
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
    const metaQuestions = Array.isArray(meta.questionList)
      ? meta.questionList.join(" ")
      : "";
    const metaBase = meta.questionText || metaQuestions || meta.topicTitle || "";
    const score = Math.max(
      it_similarityRatio(candidateBase || "", metaBase),
      it_similarityRatio(candidateTitle || "", meta.topicTitle || ""),
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
