import fs from "fs";
import path from "path";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItEvaluation,
  ItQuestionTiming,
  ItAudioSegment,
} from "../../protocol/interviewTrainer";
import { v4 as uuidv4 } from "uuid";

import { it_callBaiduAsr } from "../api/it_baidu";
import { ItApiConfig } from "../api/it_apiConfig";
import { it_evaluateAnswer } from "./it_evaluation";
import { it_buildCorpus, it_retrieveNotes } from "./it_notes";
import {
  it_appendAttemptData,
  it_nextAttemptIndex,
  it_readTopicMeta,
  it_reportPathForTopic,
  it_resolveTopicDir,
  it_writeTopicMeta,
} from "../storage/it_sessions";
import {
  it_summarizeAudioMetrics,
  it_decodePcm16,
  it_buildDetailedTranscript,
} from "../utils/it_audio";
import { it_hashText, it_normalizeText } from "../utils/it_text";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import { it_appendReport } from "./it_report";

interface ItAnalyzeDeps {
  context: vscode.ExtensionContext;
  apiConfig: ItApiConfig;
  skillConfig: Record<string, any>;
  workspaceRoot: string;
}

function it_getEnvConfig(apiConfig: ItApiConfig, env: string): any {
  return apiConfig.environments?.[env] ?? {};
}

function it_deriveTopicTitle(
  questionText?: string,
  questionList?: string[],
  transcript?: string,
  maxLen: number = 32,
): string {
  const base =
    questionText?.trim() ||
    questionList?.[0]?.trim() ||
    transcript?.split(/[。！？?]/)[0]?.trim() ||
    "未命名";
  return base.slice(0, maxLen);
}

function it_storeRecording(
  topicDir: string,
  attemptIndex: number,
  audio: ItAnalyzeRequest["audio"],
): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = audio.format === "pcm" ? "wav" : audio.format;
  const tempPath = path.join(
    topicDir,
    `attempt-${String(attemptIndex).padStart(2, "0")}-${timestamp}.${ext}`,
  );
  if (audio.format === "pcm") {
    const pcm = it_decodePcm16(audio.base64);
    const wavBuffer = it_pcm16ToWavBuffer(pcm, audio.sampleRate, 1);
    fs.writeFileSync(tempPath, wavBuffer);
  } else {
    const buffer = Buffer.from(audio.base64, "base64");
    fs.writeFileSync(tempPath, buffer);
  }
  return tempPath;
}

function it_splitPcmBase64(
  base64: string,
  sampleRate: number,
  maxChunkSec: number,
): Array<{ speech: string; len: number }> {
  const buffer = Buffer.from(base64, "base64");
  const bytesPerSecond = sampleRate * 2;
  const chunkBytes = Math.max(1, Math.floor(bytesPerSecond * maxChunkSec));
  const chunks: Array<{ speech: string; len: number }> = [];
  for (let offset = 0; offset < buffer.length; offset += chunkBytes) {
    const slice = buffer.subarray(offset, offset + chunkBytes);
    chunks.push({ speech: slice.toString("base64"), len: slice.length });
  }
  return chunks;
}

function it_buildQuestionTimingsFromSegments(
  questionList: string[],
  segments: ItAudioSegment[],
  totalDurationSec: number,
): ItQuestionTiming[] {
  if (!questionList.length || !segments.length) {
    return [];
  }
  const cnNums = ["一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
  const startTimes: Array<number | undefined> = new Array(questionList.length).fill(
    undefined,
  );
  startTimes[0] = 0;
  for (let idx = 1; idx < questionList.length; idx += 1) {
    const cn = cnNums[idx - 1] ?? "";
    const digit = String(idx + 1);
    const regex = new RegExp(`第\\s*(${cn}|${digit})\\s*[题问]`);
    const hit = segments.find((seg) => seg.text && regex.test(seg.text));
    if (hit) {
      startTimes[idx] = hit.startSec;
    }
  }
  const fullMarkers = startTimes.slice(1).every((t) => typeof t === "number");
  if (!fullMarkers) {
    return [];
  }
  const duration = totalDurationSec || segments[segments.length - 1]?.endSec || 0;
  const timings: ItQuestionTiming[] = [];
  for (let i = 0; i < questionList.length; i += 1) {
    const startSec = startTimes[i] ?? 0;
    const endSec =
      i < questionList.length - 1 ? (startTimes[i + 1] as number) : duration;
    timings.push({
      question: questionList[i],
      startSec,
      endSec,
      durationSec: Math.max(0, endSec - startSec),
      note: "转写分段",
    });
  }
  return timings;
}

function it_buildQuestionTimings(
  questionText: string,
  questionList: string[],
  totalDurationSec: number,
  segments?: ItAudioSegment[],
): ItQuestionTiming[] {
  const list = questionList.length
    ? questionList
    : questionText
      ? [questionText]
      : [];
  if (segments && segments.length && list.length > 1) {
    const fromSegments = it_buildQuestionTimingsFromSegments(
      list,
      segments,
      totalDurationSec,
    );
    if (fromSegments.length) {
      return fromSegments;
    }
  }
  if (!list.length || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    return [];
  }
  const base = totalDurationSec / list.length;
  let cursor = 0;
  return list.map((question, idx) => {
    const isLast = idx === list.length - 1;
    const durationSec = isLast ? Math.max(0, totalDurationSec - cursor) : base;
    const startSec = cursor;
    const endSec = startSec + durationSec;
    cursor = endSec;
    return {
      question,
      startSec,
      endSec,
      durationSec,
      note: list.length > 1 ? "估算" : undefined,
    };
  });
}

function it_isBaiduContentTooLong(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  return (
    message.includes("3310") ||
    lower.includes("content len too long") ||
    lower.includes("content length too long")
  );
}

async function it_transcribePcmWithChunks(
  asrConfig: {
    apiKey: string;
    secretKey: string;
    baseUrl: string;
    devPid: number;
    language: string;
    timeoutSec: number;
    maxRetries: number;
  },
  base64: string,
  sampleRate: number,
  maxChunkSec: number,
): Promise<string> {
  let chunkSec = Math.max(5, Math.floor(maxChunkSec || 50));
  let lastError: unknown = undefined;
  for (;;) {
    const chunks = it_splitPcmBase64(base64, sampleRate, chunkSec);
    const parts: string[] = [];
    try {
      for (const chunk of chunks) {
        const part = await it_callBaiduAsr(asrConfig, {
          format: "pcm",
          rate: sampleRate,
          channel: 1,
          cuid: uuidv4(),
          speech: chunk.speech,
          len: chunk.len,
        });
        parts.push(part);
      }
      return parts.join("");
    } catch (err) {
      lastError = err;
      if (it_isBaiduContentTooLong(err) && chunkSec > 5) {
        chunkSec = Math.max(5, Math.floor(chunkSec / 2));
        continue;
      }
      throw err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Baidu ASR failed.");
}

export async function it_runAnalysis(
  deps: ItAnalyzeDeps,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  const env = deps.apiConfig.active?.environment || "prod";
  const envConfig = it_getEnvConfig(deps.apiConfig, env);
  const questionText = request.questionText?.trim() || "";
  const questionList = (request.questionList ?? []).filter((q) => q.trim());
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }

  const asrCfg = envConfig.asr ?? {};
  const asrProvider = asrCfg.provider || "baidu_vop";
  let transcript = "";
  if (asrProvider === "mock") {
    transcript = String(asrCfg.mock_text || "");
  } else {
    if (asrProvider !== "baidu_vop") {
      throw new Error("当前仅支持百度语音转文字（baidu_vop）。");
    }
    if (!asrCfg.api_key || !asrCfg.secret_key) {
      throw new Error("缺少百度语音转文字的API Key或Secret Key。");
    }
    const asrConfig = {
      apiKey: asrCfg.api_key || "",
      secretKey: asrCfg.secret_key || "",
      baseUrl: asrCfg.base_url || "https://vop.baidu.com/server_api",
      devPid: Number(asrCfg.dev_pid || 1537),
      language: asrCfg.language || "zh",
      timeoutSec: Number(asrCfg.timeout_sec || 120),
      maxRetries: Number(asrCfg.max_retries || 1),
    };
    const maxChunkSec = Number(asrCfg.max_chunk_sec || 50);
    if (request.audio.format === "pcm" && request.audio.byteLength > 0) {
      transcript = await it_transcribePcmWithChunks(
        asrConfig,
        request.audio.base64,
        request.audio.sampleRate,
        maxChunkSec,
      );
    } else {
      transcript = await it_callBaiduAsr(asrConfig, {
        format: request.audio.format,
        rate: request.audio.sampleRate,
        channel: 1,
        cuid: uuidv4(),
        speech: request.audio.base64,
        len: request.audio.byteLength,
      });
    }
  }

  const acoustic =
    request.audio.format === "pcm"
      ? it_summarizeAudioMetrics(
          request.audio.base64,
          request.audio.sampleRate,
          transcript,
        )
      : {
          durationSec: request.audio.durationSec || 0,
          speechDurationSec: request.audio.durationSec || 0,
          speechRateWpm: undefined,
          pauseCount: 0,
          pauseAvgSec: 0,
          pauseMaxSec: 0,
          rmsDbMean: 0,
          rmsDbStd: 0,
          snrDb: undefined,
        };

  let detailedTranscript: string | undefined = undefined;
  let audioSegments = undefined;
  if (request.audio.format === "pcm") {
    const detailed = it_buildDetailedTranscript(
      request.audio.base64,
      request.audio.sampleRate,
      transcript,
    );
    detailedTranscript = detailed.detailedTranscript;
    audioSegments = detailed.segments;
  }

  const questionTimings = it_buildQuestionTimings(
    questionText,
    questionList,
    acoustic.durationSec || request.audio.durationSec || 0,
    audioSegments,
  );

  const workspaceCfg = deps.skillConfig.workspace ?? {};
  const corpus = it_buildCorpus({
    notes: path.join(deps.workspaceRoot, workspaceCfg.notes_dir || "inputs/notes"),
    prompts: path.join(
      deps.workspaceRoot,
      workspaceCfg.prompts_dir || "inputs/prompts/guangdong",
    ),
    rubrics: path.join(deps.workspaceRoot, workspaceCfg.rubrics_dir || "inputs/rubrics"),
    knowledge: path.join(
      deps.workspaceRoot,
      workspaceCfg.knowledge_dir || "inputs/knowledge",
    ),
    examples: path.join(
      deps.workspaceRoot,
      workspaceCfg.examples_dir || "inputs/examples",
    ),
  });
  const notes = it_retrieveNotes(
    transcript,
    corpus,
    Number(deps.skillConfig.retrieval?.top_k ?? 5),
    Number(deps.skillConfig.retrieval?.min_score ?? 0.1),
  );

  const topicTitle = it_deriveTopicTitle(
    questionText,
    questionList,
    transcript,
    Number(deps.skillConfig.topics?.max_title_len ?? 32),
  );

  const topicDir = it_resolveTopicDir(deps.workspaceRoot, topicTitle, questionText, {
    sessionsDir: deps.skillConfig.sessions_dir || "sessions",
    allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
    maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
    similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
  });

  const reportPath = it_reportPathForTopic(topicDir, topicTitle, {
    sessionsDir: deps.skillConfig.sessions_dir || "sessions",
    allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
    maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
    similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
  });

  const attemptIndex = it_nextAttemptIndex(reportPath);
  const storedAudioPath = it_storeRecording(topicDir, attemptIndex, request.audio);

  const evaluationConfig = {
    provider: envConfig.llm?.provider || "heuristic",
    model: envConfig.llm?.model || "ernie-4.5-turbo-128k",
    baseUrl: envConfig.llm?.base_url || "https://qianfan.baidubce.com/v2",
    apiKey: envConfig.llm?.api_key || "",
    temperature: Number(envConfig.llm?.temperature ?? 0.8),
    topP: Number(envConfig.llm?.top_p ?? 0.8),
    timeoutSec: Number(envConfig.llm?.timeout_sec ?? 60),
    maxRetries: Number(envConfig.llm?.max_retries ?? 1),
    language: deps.skillConfig.evaluation?.language || "zh-CN",
    dimensions: deps.skillConfig.evaluation?.dimensions ?? [],
  };

  const evaluation: ItEvaluation = await it_evaluateAnswer(
    questionText || topicTitle,
    transcript,
    acoustic,
    notes,
    evaluationConfig,
    questionList,
  );

  const response: ItAnalyzeResponse = {
    transcript,
    detailedTranscript,
    acoustic,
    evaluation,
    notes,
    audioSegments,
    questionTimings,
    reportPath,
    topicDir,
    audioPath: storedAudioPath,
  };

  const attemptData = {
    attemptIndex,
    timestamp: new Date().toISOString(),
    audioPath: storedAudioPath,
    durationSec: acoustic.durationSec,
    transcript,
    detailedTranscript,
    evaluation,
    notes,
    audioSegments,
    questionTimings,
  };
  it_appendAttemptData(topicDir, attemptData);

  const meta = it_readTopicMeta(topicDir);
  const normalized = it_normalizeText(questionText || topicTitle);
  const now = new Date().toISOString();
  it_writeTopicMeta(topicDir, {
    topicTitle: meta.topicTitle || topicTitle,
    questionText: questionText || meta.questionText || "",
    questionList: questionList.length ? questionList : meta.questionList || [],
    questionHash: meta.questionHash || it_hashText(normalized),
    createdAt: meta.createdAt || now,
    updatedAt: now,
    overallScore: evaluation.overallScore,
  });

  it_appendReport(
    reportPath,
    topicTitle,
    questionText || undefined,
    questionList.length ? questionList : undefined,
    attemptIndex,
    response,
    {
      attemptHeading: "第{n}次作答",
      segmentHeading: "小题{n}",
      attemptNote: "评分为相对参考，请结合标准文件自评。",
    },
  );

  return response;
}
