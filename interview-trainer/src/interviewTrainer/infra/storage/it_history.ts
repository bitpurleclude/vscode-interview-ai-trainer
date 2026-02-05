import fs from "fs";
import path from "path";
import { ItHistoryItem } from "../../../protocol/interviewTrainer";
import { it_makeSlug } from "../utils/it_text";
import { ItSessionsConfig } from "./it_sessions";

async function it_pickReportPath(
  topicDir: string,
  meta: any,
  cfg?: Partial<ItSessionsConfig>,
): Promise<string> {
  const allowUnicode = cfg?.allowUnicode ?? true;
  const maxSlugLen = cfg?.maxSlugLen ?? 16;
  const centerSubdir = cfg?.centerSubdir;
  const title = String(meta?.topicTitle || meta?.questionText || "未命名");
  const preferredName = `${it_makeSlug(title, allowUnicode, maxSlugLen)}.md`;
  const candidateDirs = centerSubdir
    ? [path.join(topicDir, centerSubdir), topicDir]
    : [topicDir];

  for (const dir of candidateDirs) {
    let entries: fs.Dirent[] = [];
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    const mdFiles = entries
      .filter((file) => file.isFile() && file.name.endsWith(".md"))
      .map((file) => file.name);
    if (!mdFiles.length) {
      continue;
    }
    const preferred = mdFiles.find((name) => name === preferredName);
    if (preferred) {
      return path.join(dir, preferred);
    }
    let latest: { name: string; mtime: number } | null = null;
    for (const name of mdFiles) {
      try {
        const stat = await fs.promises.stat(path.join(dir, name));
        if (!latest || stat.mtimeMs > latest.mtime) {
          latest = { name, mtime: stat.mtimeMs };
        }
      } catch {
        continue;
      }
    }
    if (latest) {
      return path.join(dir, latest.name);
    }
  }
  return "";
}

export async function it_listHistoryItems(
  sessionsRoot: string,
  query?: string,
  limit?: number,
  cfg?: Partial<ItSessionsConfig>,
): Promise<ItHistoryItem[]> {
  try {
    await fs.promises.access(sessionsRoot);
  } catch {
    return [];
  }
  const items: ItHistoryItem[] = [];
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
        continue;
      }
      if (entry.name !== "meta.json") {
        continue;
      }
      try {
        const raw = await fs.promises.readFile(fullPath, "utf-8");
        const meta = JSON.parse(raw);
        const match =
          !query ||
          (meta.topicTitle || "").includes(query) ||
          (meta.questionText || "").includes(query);
        if (!match) {
          continue;
        }
        const topicDir = path.dirname(fullPath);
        const reportPath = await it_pickReportPath(topicDir, meta, cfg);
        items.push({
          topicTitle: meta.topicTitle || "未命名",
          reportPath: reportPath || "",
          topicDir,
          timestamp: meta.updatedAt || meta.createdAt || "",
          overallScore: meta.overallScore,
        });
      } catch {
        continue;
      }
    }
  }
  items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return limit ? items.slice(0, limit) : items;
}
