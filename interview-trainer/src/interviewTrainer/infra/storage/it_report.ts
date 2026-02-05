import fs from "fs";
import path from "path";
import { ItAnalyzeResponse, ItEvaluation } from "../../../protocol/interviewTrainer";
import { it_formatSeconds } from "../utils/it_text";

export interface ItReportConfig {
  attemptHeading: string;
  segmentHeading: string;
  attemptNote?: string;
}

function it_indentLines(text: string, prefix: string): string {
  const raw = String(text || "").replace(/\r\n/g, "\n");
  if (!raw.trim()) {
    return `${prefix}（空）\n`;
  }
  return raw
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}

interface ItOutlineNode {
  text: string;
  children: ItOutlineNode[];
}

function it_extractOutlinePaths(items: string[]): string[][] {
  const paths: string[][] = [];
  let currentLevel1: string | null = null;
  let currentLevel2: string | null = null;
  const level1Pattern = /^([一二三四五六七八九十]+|\d+)[、.]/;
  const level2Pattern = /^[（(]([一二三四五六七八九十]+|\d+)[）)]/;
  const markerPattern =
    /^(?<indent>\s*)(?:[-*+]\s+|\d+[.)]\s+)(?<text>.+)$/;
  const stack: Array<{ depth: number; text: string }> = [];

  items.forEach((item) => {
    const rawLine = String(item || "").replace(/\t/g, "  ");
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return;
    }
    if (trimmed.includes("->")) {
      const parts = trimmed
        .split("->")
        .map((part) => part.trim())
        .filter(Boolean);
      if (parts.length) {
        stack.length = 0;
        parts.forEach((part, idx) => stack.push({ depth: idx, text: part }));
        currentLevel1 = parts[0] || currentLevel1;
        currentLevel2 = parts.length > 1 ? parts[1] : null;
        paths.push(parts);
      }
      return;
    }
    const markerMatch = rawLine.match(markerPattern);
    if (markerMatch?.groups?.text) {
      const indentRaw = markerMatch.groups.indent || "";
      const indentLen = indentRaw.replace(/\t/g, "  ").length;
      const depth = Math.max(0, Math.floor(indentLen / 2));
      const text = markerMatch.groups.text.trim();
      if (!text) {
        return;
      }
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        stack.pop();
      }
      stack.push({ depth, text });
      paths.push(stack.map((node) => node.text));
      currentLevel1 = stack[0]?.text ?? currentLevel1;
      currentLevel2 = stack[1]?.text ?? null;
      return;
    }
    if (level1Pattern.test(trimmed)) {
      currentLevel1 = trimmed;
      currentLevel2 = null;
      stack.length = 0;
      stack.push({ depth: 0, text: trimmed });
      paths.push([trimmed]);
      return;
    }
    if (level2Pattern.test(trimmed) && currentLevel1) {
      currentLevel2 = trimmed;
      stack.length = 0;
      stack.push({ depth: 0, text: currentLevel1 });
      stack.push({ depth: 1, text: trimmed });
      paths.push([currentLevel1, trimmed]);
      return;
    }
    if (currentLevel1) {
      if (currentLevel2) {
        paths.push([currentLevel1, currentLevel2, trimmed]);
      } else {
        paths.push([currentLevel1, trimmed]);
      }
      return;
    }
    paths.push([trimmed]);
  });
  return paths;
}

function it_buildOutlineTree(items: string[]): ItOutlineNode[] {
  const roots: ItOutlineNode[] = [];
  const findOrCreate = (list: ItOutlineNode[], text: string): ItOutlineNode => {
    const existing = list.find((node) => node.text === text);
    if (existing) {
      return existing;
    }
    const node = { text, children: [] };
    list.push(node);
    return node;
  };
  const paths = it_extractOutlinePaths(items);
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

function it_renderOutlineTree(
  nodes: ItOutlineNode[],
  prefix: string,
  level: number,
): string {
  const indent = "  ".repeat(level);
  let lines = "";
  nodes.forEach((node) => {
    lines += `${prefix}${indent}- ${node.text}\n`;
    if (node.children.length) {
      lines += it_renderOutlineTree(node.children, prefix, level + 1);
    }
  });
  return lines;
}

function it_renderOutline(items: string[], prefix: string): string {
  if (!items.length) {
    return `${prefix}- （空）\n`;
  }
  const tree = it_buildOutlineTree(items);
  return it_renderOutlineTree(tree, prefix, 0);
}

function it_parseSection(content: string, title: string): string[] {
  const lines = content.split(/\r?\n/);
  const items: string[] = [];
  let inSection = false;
  for (const line of lines) {
    if (line.startsWith("## ")) {
      inSection = line.trim() === `## ${title}`;
      continue;
    }
    if (inSection && line.trim().startsWith("- ")) {
      items.push(line.trim().slice(2).trim());
    }
  }
  return items;
}

function it_mergeUnique(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  incoming.forEach((item) => {
    if (!item) {
      return;
    }
    if (seen.has(item)) {
      return;
    }
    seen.add(item);
    merged.push(item);
  });
  return merged;
}

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

export function it_renderReport(
  topicTitle: string,
  questionText: string | undefined,
  questionList: string[] | undefined,
  attemptIndex: number,
  response: ItAnalyzeResponse,
  config: ItReportConfig,
): string {
  const lines: string[] = [];

  const heading = config.attemptHeading.replace("{n}", String(attemptIndex));
  lines.push(`## ${heading}\n\n`);
  lines.push(`Timestamp: ${new Date().toISOString()}\n`);
  lines.push(`Audio file: ${response.audioPath}\n`);
  lines.push(`Total duration: ${it_formatSeconds(response.acoustic.durationSec)}\n\n`);

  if (questionText) {
    lines.push(`题干: ${questionText}\n\n`);
  }
  if (questionList && questionList.length) {
    lines.push("小题列表:\n");
    questionList.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}\n`);
    });
    lines.push("\n");
  }

  if (config.attemptNote) {
    lines.push(`> ${config.attemptNote}\n\n`);
  }

  lines.push("### 转写文本\n\n");
  lines.push(`${response.transcript}\n\n`);

  lines.push("### 声学分析\n\n");
  lines.push("| 指标 | 数值 |\n| --- | --- |\n");
  lines.push(`| 时长 | ${response.acoustic.durationSec.toFixed(2)}s |\n`);
  lines.push(`| 语速 | ${response.acoustic.speechRateWpm ?? "-"} |\n`);
  lines.push(`| 停顿次数 | ${response.acoustic.pauseCount} |\n`);
  lines.push(`| 平均停顿 | ${response.acoustic.pauseAvgSec.toFixed(2)}s |\n`);
  lines.push(`| 最长停顿 | ${response.acoustic.pauseMaxSec.toFixed(2)}s |\n`);
  lines.push(`| RMS均值 | ${response.acoustic.rmsDbMean.toFixed(2)}dB |\n`);
  lines.push(`| RMS波动 | ${response.acoustic.rmsDbStd.toFixed(2)}dB |\n`);
  lines.push(`| SNR | ${response.acoustic.snrDb ?? "-"} |\n\n`);

  lines.push("### 面试评价\n\n");
  lines.push(`- 总结: ${response.evaluation.topicSummary}\n`);
  lines.push("- 维度评分:\n");
  Object.entries(response.evaluation.scores || {}).forEach(([key, value]) => {
    lines.push(`  - ${key}: ${value}\n`);
  });
  lines.push(`- 总分: ${response.evaluation.overallScore}\n`);
  lines.push(`- 优点:\n`);
  response.evaluation.strengths.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 问题:\n`);
  response.evaluation.issues.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 改进建议:\n`);
  response.evaluation.improvements.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 练习重点:\n`);
  response.evaluation.nextFocus.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("\n");

  if (
    (response.evaluation.noteUsage && response.evaluation.noteUsage.length) ||
    (response.evaluation.noteSuggestions &&
      response.evaluation.noteSuggestions.length)
  ) {
    lines.push("### 参考素材与笔记\n\n");
    lines.push("已汇总至 reference_notes.md（同题共享，避免重复）。\n\n");
  }

  if (response.evaluation.revisedAnswers?.length) {
    lines.push("### 示范性修改\n\n");
    response.evaluation.revisedAnswers.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.question}\n`);
      if (item.estimatedTimeMin !== undefined) {
        lines.push(`   - 建议用时: ${item.estimatedTimeMin}分钟\n`);
      }
      lines.push("   - 原回答:\n");
      lines.push(`${it_indentLines(item.original, "     ")}\n`);
      lines.push("   - 答题提纲（你的回答）:\n");
      lines.push(`${it_renderOutline(item.outlineOriginal ?? [], "     ")}\n`);
      lines.push("   - 示范:\n");
      lines.push(`${it_indentLines(item.revised, "     ")}\n`);
      lines.push("   - 答题提纲（示范）:\n");
      lines.push(`${it_renderOutline(item.outlineRevised ?? [], "     ")}\n`);
    });
    lines.push("\n");
  }

  if (response.questionTimings && response.questionTimings.length) {
    lines.push("### 题目用时\n\n");
    response.questionTimings.forEach((item, idx) => {
      const note = item.note ? `（${item.note}）` : "";
      const start = it_formatSeconds(item.startSec);
      const end = it_formatSeconds(item.endSec);
      const duration = it_formatSeconds(item.durationSec);
      lines.push(`${idx + 1}. ${item.question} - [${start}-${end}] 用时 ${duration}${note}\n`);
    });
    lines.push("\n");
  } else if (response.questionTimingNote) {
    lines.push("### 题目用时\n\n");
    lines.push(`${response.questionTimingNote}\n\n`);
  }

  return lines.join("");
}

export function it_appendReport(
  reportPath: string,
  topicTitle: string,
  questionText: string | undefined,
  questionList: string[] | undefined,
  attemptIndex: number,
  response: ItAnalyzeResponse,
  config: ItReportConfig,
): void {
  if (!fs.existsSync(reportPath)) {
    const header: string[] = [];
    header.push(`# ${topicTitle}\n\n`);
    if (questionText) {
      header.push("题干正文:\n");
      header.push(`${questionText}\n\n`);
    }
    if (questionList && questionList.length) {
      header.push("小题列表:\n");
      questionList.forEach((item, idx) => {
        header.push(`${idx + 1}. ${item}\n`);
      });
      header.push("\n");
    }
    fs.writeFileSync(reportPath, header.join(""), "utf-8");
  }

  const content = it_renderReport(
    topicTitle,
    questionText,
    questionList,
    attemptIndex,
    response,
    config,
  );
  fs.appendFileSync(reportPath, content, "utf-8");
}

export async function it_appendReportAsync(
  reportPath: string,
  topicTitle: string,
  questionText: string | undefined,
  questionList: string[] | undefined,
  attemptIndex: number,
  response: ItAnalyzeResponse,
  config: ItReportConfig,
): Promise<void> {
  const exists = await fs.promises
    .access(reportPath)
    .then(() => true)
    .catch(() => false);
  if (!exists) {
    const header: string[] = [];
    header.push(`# ${topicTitle}\n\n`);
    if (questionText) {
      header.push("题干正文:\n");
      header.push(`${questionText}\n\n`);
    }
    if (questionList && questionList.length) {
      header.push("小题列表:\n");
      questionList.forEach((item, idx) => {
        header.push(`${idx + 1}. ${item}\n`);
      });
      header.push("\n");
    }
    await fs.promises.writeFile(reportPath, header.join(""), "utf-8");
  }

  const content = it_renderReport(
    topicTitle,
    questionText,
    questionList,
    attemptIndex,
    response,
    config,
  );
  await fs.promises.appendFile(reportPath, content, "utf-8");
}



