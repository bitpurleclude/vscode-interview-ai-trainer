import * as vscode from "vscode";
import type { ItAnalyzeResponse } from "../../protocol/interviewTrainer";
import { it_appendReportAsync, it_updateReferenceNotesFileAsync } from "../infra/storage/it_report";
import {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_writeTopicMetaAsync,
} from "../infra/storage/it_sessions";
import { it_hashText, it_normalizeText } from "../infra/utils/it_text";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerResultHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("openFile", async (msg) => {
    const target = msg.data?.path;
    if (!target) {
      return;
    }
    await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
  });
  host.webviewProtocol.on("it/analyzeAudio", async (msg) => {
    return await host.handleAnalyze(msg.data);
  });
  host.webviewProtocol.on("it/saveCurrentResult", async (msg) => {
    const payload = msg.data || {};
    const response = payload.response as ItAnalyzeResponse | undefined;
    if (!response || !response.reportPath || !response.topicDir) {
      throw new Error("缺少可保存的结果");
    }
    const questionText = String(
      payload.questionText ?? response.questionText ?? "",
    );
    const questionList = Array.isArray(payload.questionList)
      ? payload.questionList.map((item: any) => String(item)).filter(Boolean)
      : Array.isArray(response.questionList)
        ? response.questionList.map((item: any) => String(item)).filter(Boolean)
        : [];
    const topicTitle = String(
      payload.topicTitle || response.evaluation?.topicTitle || "未命名",
    );
    const attemptIndex = await it_nextAttemptIndexAsync(response.reportPath);
    await it_appendReportAsync(
      response.reportPath,
      topicTitle,
      questionText || undefined,
      questionList.length ? questionList : undefined,
      attemptIndex,
      response,
      {
        attemptHeading: "第{n}次作答",
        segmentHeading: "小题{n}",
        attemptNote: "评分仅供参考，请结合标准文件自评。",
      },
    );
    await it_updateReferenceNotesFileAsync(response.topicDir, response.evaluation);
    const attemptData = {
      attemptIndex,
      timestamp: new Date().toISOString(),
      audioPath: response.audioPath,
      durationSec: response.acoustic.durationSec,
      transcript: response.transcript,
      detailedTranscript: response.detailedTranscript,
      evaluation: response.evaluation,
      notes: response.notes,
      audioSegments: response.audioSegments,
      questionTimings: response.questionTimings,
    };
    await it_appendAttemptDataAsync(response.topicDir, attemptData);

    const meta = await it_readTopicMetaAsync(response.topicDir);
    const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
    const normalized = fingerprint || it_normalizeText(questionText || topicTitle);
    const now = new Date().toISOString();
    await it_writeTopicMetaAsync(response.topicDir, {
      topicTitle: meta.topicTitle || topicTitle,
      questionText: questionText || meta.questionText || "",
      questionList: questionList.length ? questionList : meta.questionList || [],
      questionHash: meta.questionHash || it_hashText(normalized),
      createdAt: meta.createdAt || now,
      updatedAt: now,
      overallScore: response.evaluation.overallScore,
    });
    return { ok: true, attemptIndex, reportPath: response.reportPath };
  });
  host.webviewProtocol.on("it/cancelAnalyze", () => {
    if (host.analysisAbort) {
      host.analysisAbort.aborted = true;
    }
    host.updateState({
      statusMessage: "已请求停止分析",
      lastError: undefined,
      steps: host.state.steps.map((step) =>
        step.status === "running"
          ? { ...step, status: "error", progress: step.progress }
          : step,
      ),
    });
    return { cancelled: true };
  });
}
