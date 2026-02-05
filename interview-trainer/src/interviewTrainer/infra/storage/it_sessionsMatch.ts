import { it_hashText, it_normalizeText } from "../utils/it_text";
import type { ItSessionsConfig } from "./it_sessionsTypes";
import { it_readJson, it_readJsonAsync } from "./it_sessionsFs";
import fs from "fs";
import path from "path";

function it_normalizeForMatch(text: string): string {
  return String(text || "")
    .toLowerCase()
    .replace(/[\s.,;:!?，。？！（）；：、“”‘’()（）【】《》\[\]{}<>«»\-_/\\]+/g, "");
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