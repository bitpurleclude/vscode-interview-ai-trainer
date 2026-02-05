import type { ItAnalyzeResponse } from "../../../protocol/interviewTrainer";
import { it_formatSeconds } from "../utils/it_text";
import { it_indentLines, it_renderOutline } from "./it_reportOutline";
import type { ItReportConfig } from "./it_reportTypes";

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
  lines.push("- 优点:\n");
  response.evaluation.strengths.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("- 问题:\n");
  response.evaluation.issues.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("- 改进建议:\n");
  response.evaluation.improvements.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("- 练习重点:\n");
  response.evaluation.nextFocus.forEach((item) => {
    lines.push(`  - ${item}\n`);
  });
  lines.push("\n");

  if (
    (response.evaluation.noteUsage && response.evaluation.noteUsage.length) ||
    (response.evaluation.noteSuggestions && response.evaluation.noteSuggestions.length)
  ) {
    lines.push("### 参考素材与笔记\n\n");
    lines.push("已汇总至 reference_notes.md（同题共用，避免重复）。\n\n");
  }

  if (response.evaluation.revisedAnswers?.length) {
    lines.push("### 示范性修改\n\n");
    response.evaluation.revisedAnswers.forEach((item, idx) => {
      lines.push(`${idx + 1}. ${item.question}\n`);
      if (item.estimatedTimeMin !== undefined) {
        lines.push(`   - 建议用时: ${item.estimatedTimeMin}分钟\n`);
      }
      lines.push("   - 原回答\n");
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