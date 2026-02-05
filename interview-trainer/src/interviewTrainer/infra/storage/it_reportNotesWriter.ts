import fs from "fs";
import path from "path";
import type { ItEvaluation } from "../../../protocol/interviewTrainer";
import { it_mergeUnique, it_parseSection } from "./it_reportNotes";

export async function it_updateReferenceNotesFileAsync(
  topicDir: string,
  evaluation: ItEvaluation,
): Promise<void> {
  const noteUsage = evaluation.noteUsage ?? [];
  const noteSuggestions = evaluation.noteSuggestions ?? [];
  if (!noteUsage.length && !noteSuggestions.length) {
    return;
  }
  const filePath = path.join(topicDir, "reference_notes.md");
  let existing = "";
  try {
    existing = await fs.promises.readFile(filePath, "utf-8");
  } catch {
    existing = "";
  }

  const mergedUsage = it_mergeUnique(
    it_parseSection(existing, "引用笔记"),
    noteUsage,
  );
  const mergedSuggestions = it_mergeUnique(
    it_parseSection(existing, "可用素材/可参考思路"),
    noteSuggestions,
  );
  const updatedAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push("# 参考素材与笔记\n\n");
  lines.push(`更新时间: ${updatedAt}\n\n`);
  lines.push("## 引用笔记\n\n");
  mergedUsage.forEach((item) => {
    lines.push(`- ${item}\n`);
  });
  lines.push("\n");
  lines.push("## 可用素材/可参考思路\n\n");
  mergedSuggestions.forEach((item) => {
    lines.push(`- ${item}\n`);
  });
  lines.push("\n");
  await fs.promises.writeFile(filePath, lines.join(""), "utf-8");
}