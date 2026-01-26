import fs from "fs";
import { ItAnalyzeResponse } from "core/protocol/interviewTrainer";
import { it_formatSeconds } from "../utils/it_text";

export interface ItReportConfig {
  attemptHeading: string;
  segmentHeading: string;
  attemptNote?: string;
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

  if (response.notes.length) {
    lines.push("### 检索笔记\n\n");
    response.notes.forEach((note) => {
      lines.push(`- (${note.score}) ${note.source} :: ${note.snippet}\n`);
    });
    lines.push("\n");
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
