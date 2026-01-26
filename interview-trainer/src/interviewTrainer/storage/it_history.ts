import fs from "fs";
import path from "path";
import { ItHistoryItem } from "../../protocol/interviewTrainer";

export function it_listHistoryItems(
  sessionsRoot: string,
  query?: string,
  limit?: number,
): ItHistoryItem[] {
  if (!fs.existsSync(sessionsRoot)) {
    return [];
  }
  const items: ItHistoryItem[] = [];
  const walk = (dir: string) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.name === "meta.json") {
        try {
          const meta = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
          const match =
            !query ||
            (meta.topicTitle || "").includes(query) ||
            (meta.questionText || "").includes(query);
          if (!match) {
            continue;
          }
          const topicDir = path.dirname(fullPath);
          const reportPath = fs
            .readdirSync(topicDir, { withFileTypes: true })
            .filter((file) => file.isFile() && file.name.endsWith(".md"))
            .map((file) => path.join(topicDir, file.name))[0];
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
  };
  walk(sessionsRoot);
  items.sort((a, b) => (b.timestamp || "").localeCompare(a.timestamp || ""));
  return limit ? items.slice(0, limit) : items;
}
