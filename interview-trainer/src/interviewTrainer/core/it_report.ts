import fs from "fs";
import path from "path";
import { ItAnalyzeResponse, ItEvaluation } from "../../protocol/interviewTrainer";
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
  items.forEach((item) => {
    const parts = String(item || "")
      .split("->")
      .map((part) => part.trim())
      .filter(Boolean);
    if (!parts.length) {
      return;
    }
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
    it_parseSection(existing, "寮曠敤绗旇"),
    noteUsage,
  );
  const mergedSuggestions = it_mergeUnique(
    it_parseSection(existing, "鍙敤绱犳潗/鍙弬鑰冩€濊矾"),
    noteSuggestions,
  );
  const updatedAt = new Date().toISOString();
  const lines: string[] = [];
  lines.push("# 鍙傝€冪礌鏉愪笌绗旇\n\n");
  lines.push(`鏇存柊鏃堕棿: ${updatedAt}\n\n`);
  lines.push("## 寮曠敤绗旇\n\n");
  mergedUsage.forEach((item) => {
    lines.push(`- ${item}\n`);
  });
  lines.push("\n");
  lines.push("## 鍙敤绱犳潗/鍙弬鑰冩€濊矾\n\n");
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
    lines.push(`棰樺共: ${questionText}\n\n`);
  }
  if (questionList && questionList.length) {
    lines.push("灏忛鍒楄〃:\n");
    questionList.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item}\n`);
    });
    lines.push("\n");
  }

  if (config.attemptNote) {
    lines.push(`> ${config.attemptNote}\n\n`);
  }

  lines.push("### 杞啓鏂囨湰\n\n");
  lines.push(`${response.transcript}\n\n`);

  lines.push("### 澹板鍒嗘瀽\n\n");
  lines.push("| 鎸囨爣 | 鏁板€?|\n| --- | --- |\n");
  lines.push(`| 鏃堕暱 | ${response.acoustic.durationSec.toFixed(2)}s |\n`);
  lines.push(`| 璇€?| ${response.acoustic.speechRateWpm ?? "-"} |\n`);
  lines.push(`| 鍋滈】娆℃暟 | ${response.acoustic.pauseCount} |\n`);
  lines.push(`| 骞冲潎鍋滈】 | ${response.acoustic.pauseAvgSec.toFixed(2)}s |\n`);
  lines.push(`| 鏈€闀垮仠椤?| ${response.acoustic.pauseMaxSec.toFixed(2)}s |\n`);
  lines.push(`| RMS鍧囧€?| ${response.acoustic.rmsDbMean.toFixed(2)}dB |\n`);
  lines.push(`| RMS娉㈠姩 | ${response.acoustic.rmsDbStd.toFixed(2)}dB |\n`);
  lines.push(`| SNR | ${response.acoustic.snrDb ?? "-"} |\n\n`);

  lines.push("### 闈㈣瘯璇勪环\n\n");
  lines.push(`- 鎬荤粨: ${response.evaluation.topicSummary}\n`);
  lines.push("- 缁村害璇勫垎:\n");
  Object.entries(response.evaluation.scores || {}).forEach(([key, value]) => {
    lines.push(`  - ${key}: ${value}\n`);
  });
  lines.push(`- 鎬诲垎: ${response.evaluation.overallScore}\n`);
  lines.push(`- 浼樼偣:\n`);
  response.evaluation.strengths.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 闂:\n`);
  response.evaluation.issues.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 鏀硅繘寤鸿:\n`);
  response.evaluation.improvements.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push(`- 缁冧範閲嶇偣:\n`);
  response.evaluation.nextFocus.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("\n");

  if (
    (response.evaluation.noteUsage && response.evaluation.noteUsage.length) ||
    (response.evaluation.noteSuggestions &&
      response.evaluation.noteSuggestions.length)
  ) {
    lines.push("### 鍙傝€冪礌鏉愪笌绗旇\n\n");
    lines.push("宸叉眹鎬昏嚦 reference_notes.md锛堝悓棰樺叡浜紝閬垮厤閲嶅锛夈€俓n\n");
  }

  if (response.evaluation.revisedAnswers?.length) {
    lines.push("### 绀鸿寖鎬т慨鏀筡n\n");
    response.evaluation.revisedAnswers.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.question}\n`);
      if (item.estimatedTimeMin !== undefined) {
        lines.push(`   - 寤鸿鐢ㄦ椂: ${item.estimatedTimeMin}鍒嗛挓\n`);
      }
      lines.push("   - 鍘熷洖绛?\n");
      lines.push(`${it_indentLines(item.original, "     ")}\n`);
      lines.push("   - 绛旈鎻愮翰锛堜綘鐨勫洖绛旓級:\n");
      lines.push(`${it_renderOutline(item.outlineOriginal ?? [], "     ")}\n`);
      lines.push("   - 绀鸿寖:\n");
      lines.push(`${it_indentLines(item.revised, "     ")}\n`);
      lines.push("   - 绛旈鎻愮翰锛堢ず鑼冿級:\n");
      lines.push(`${it_renderOutline(item.outlineRevised ?? [], "     ")}\n`);
    });
    lines.push("\n");
  }

  if (response.questionTimings && response.questionTimings.length) {
    lines.push("### 棰樼洰鐢ㄦ椂\n\n");
    response.questionTimings.forEach((item, idx) => {
      const note = item.note ? `锛?{item.note}` : "";
      const start = it_formatSeconds(item.startSec);
      const end = it_formatSeconds(item.endSec);
      const duration = it_formatSeconds(item.durationSec);
      lines.push(`${idx + 1}. ${item.question} - [${start}-${end}] 鐢ㄦ椂 ${duration}${note}\n`);
    });
    lines.push("\n");
  } else if (response.questionTimingNote) {
    lines.push("### ????\n\n");
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
      header.push("棰樺共姝ｆ枃:\n");
      header.push(`${questionText}\n\n`);
    }
    if (questionList && questionList.length) {
      header.push("灏忛鍒楄〃:\n");
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
      header.push("棰樺共姝ｆ枃:\n");
      header.push(`${questionText}\n\n`);
    }
    if (questionList && questionList.length) {
      header.push("灏忛鍒楄〃:\n");
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


