import * as vscode from "vscode";
import type { ItAnalyzeResponse } from "../../../protocol/interviewTrainer";
import { it_appendReportAsync, it_updateReferenceNotesFileAsync } from "../../infra/storage/it_report";
import {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
  it_storeAudioCopy,
  it_readTopicMetaAsync,
  it_writeTopicMetaAsync,
} from "../../infra/storage/it_sessions";
import { it_hashText, it_normalizeText } from "../../infra/utils/it_text";
import { it_deriveTopicTitle, it_sanitizeTopicTitle } from "../../domain/analyze/result";
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
      payload.topicTitle || response.evaluation?.topicTitle || "",
    );
    const skillConfig = host.configBundle.skill || {};
    const maxTitleLen = Number(skillConfig.topics?.max_title_len ?? 18);
    let resolvedTitle = topicTitle.trim();
    if (!resolvedTitle) {
      resolvedTitle = it_deriveTopicTitle(
        questionText,
        questionList,
        response.transcript,
        maxTitleLen,
      );
    }
    resolvedTitle = it_sanitizeTopicTitle(resolvedTitle, maxTitleLen);
    const sessionsConfig = {
      sessionsDir: skillConfig.sessions_dir || "sessions",
      allowUnicode: skillConfig.filenames?.allow_unicode ?? true,
      maxSlugLen: skillConfig.filenames?.max_slug_len ?? 16,
      similarityThreshold: Number(skillConfig.topics?.similarity_threshold ?? 0.72),
      centerSubdir: skillConfig.topics?.center_subdir || "",
    };
    const workspaceRoot = host.requireWorkspaceRoot();
    const topicDir = await it_resolveTopicDirAsync(
      workspaceRoot,
      resolvedTitle,
      questionText,
      questionList,
      sessionsConfig,
    );
    const reportPath = await it_reportPathForTopicAsync(
      topicDir,
      resolvedTitle,
      sessionsConfig,
    );
    const attemptIndex = await it_nextAttemptIndexAsync(reportPath);
    const storedAudioPath =
      topicDir !== response.topicDir && response.audioPath
        ? it_storeAudioCopy(response.audioPath, topicDir, attemptIndex)
        : response.audioPath;
    await it_appendReportAsync(
      reportPath,
      resolvedTitle,
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
    await it_updateReferenceNotesFileAsync(topicDir, response.evaluation);
    const attemptData = {
      attemptIndex,
      timestamp: new Date().toISOString(),
      audioPath: storedAudioPath,
      durationSec: response.acoustic.durationSec,
      transcript: response.transcript,
      detailedTranscript: response.detailedTranscript,
      evaluation: response.evaluation,
      notes: response.notes,
      audioSegments: response.audioSegments,
      questionTimings: response.questionTimings,
    };
    await it_appendAttemptDataAsync(topicDir, attemptData);

    const meta = await it_readTopicMetaAsync(topicDir);
    const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
    const normalized = fingerprint || it_normalizeText(questionText || resolvedTitle);
    const now = new Date().toISOString();
    await it_writeTopicMetaAsync(topicDir, {
      topicTitle: meta.topicTitle || resolvedTitle,
      questionText: questionText || meta.questionText || "",
      questionList: questionList.length ? questionList : meta.questionList || [],
      questionHash: meta.questionHash || it_hashText(normalized),
      createdAt: meta.createdAt || now,
      updatedAt: now,
      overallScore: response.evaluation.overallScore,
    });
    return { ok: true, attemptIndex, reportPath };
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
