import fs from "fs";
import type { ItAnalyzeResponse } from "../../../protocol/interviewTrainer";
import type { ItReportConfig } from "./it_reportTypes";
import { it_renderReport } from "./it_reportRender";

function it_writeReportHeader(
  topicTitle: string,
  questionText: string | undefined,
  questionList: string[] | undefined,
): string {
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
  return header.join("");
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
    fs.writeFileSync(
      reportPath,
      it_writeReportHeader(topicTitle, questionText, questionList),
      "utf-8",
    );
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
    await fs.promises.writeFile(
      reportPath,
      it_writeReportHeader(topicTitle, questionText, questionList),
      "utf-8",
    );
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