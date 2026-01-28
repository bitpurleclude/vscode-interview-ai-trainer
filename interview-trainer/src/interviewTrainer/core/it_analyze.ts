import fs from "fs";
import path from "path";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItEvaluation,
  ItQuestionTiming,
  ItAudioSegment,
  ItStepStatus,
  ItWorkflowStep,
} from "../../protocol/interviewTrainer";
import { v4 as uuidv4 } from "uuid";

import { it_callBaiduAsr } from "../api/it_baidu";
import { ItApiConfig } from "../api/it_apiConfig";
import { ItQianfanConfig, it_callQianfanChat } from "../api/it_qianfan";
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
import { it_formatSeconds, it_hashText, it_normalizeText } from "../utils/it_text";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import { it_appendReport } from "./it_report";

interface ItAnalyzeDeps {
  context: vscode.ExtensionContext;
  apiConfig: ItApiConfig;
  skillConfig: Record<string, any>;
  workspaceRoot: string;
  onProgress?: (update: ItAnalyzeProgress) => void;
}

interface ItAnalyzeProgress {
  step: ItWorkflowStep;
  progress: number;
  message?: string;
  status?: ItStepStatus;
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
  if (segments && segments.length && list.length === 1) {
    const speechSegments = segments.filter((seg) => seg.type === "speech");
    if (speechSegments.length) {
      const startMarkers = [/开始答题/, /开始作答/, /开始回答/];
      const endMarkers = [/回答完毕/, /答题结束/, /回答结束/, /作答完毕/];
      const findMarker = (patterns: RegExp[], fromEnd: boolean): number | null => {
        const ordered = fromEnd ? [...segments].reverse() : segments;
        for (const seg of ordered) {
          if (seg.type !== "speech" || !seg.text) {
            continue;
          }
          const normalized = it_normalizeText(seg.text);
          if (!normalized) {
            continue;
          }
          if (patterns.some((pattern) => pattern.test(normalized))) {
            return fromEnd ? seg.endSec : seg.startSec;
          }
        }
        return null;
      };

      const startSec = findMarker(startMarkers, false) ?? speechSegments[0].startSec;
      const endSec =
        findMarker(endMarkers, true) ??
        speechSegments[speechSegments.length - 1].endSec;
      if (endSec > startSec) {
        const note =
          startSec !== speechSegments[0].startSec || endSec !== speechSegments[speechSegments.length - 1].endSec
            ? "答题标记"
            : "语音起止";
        return [
          {
            question: list[0],
            startSec,
            endSec,
            durationSec: Math.max(0, endSec - startSec),
            note,
          },
        ];
      }
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

function it_getLlmConfig(envConfig: any): ItQianfanConfig | null {
  const llm = envConfig?.llm ?? {};
  if (llm.provider !== "baidu_qianfan" || !llm.api_key) {
    return null;
  }
  return {
    apiKey: llm.api_key || "",
    baseUrl: llm.base_url || "https://qianfan.baidubce.com/v2",
    model: llm.model || "ernie-4.5-turbo-128k",
    temperature: Number(llm.temperature ?? 0.2),
    topP: Number(llm.top_p ?? 0.8),
    timeoutSec: Number(llm.timeout_sec ?? 60),
    maxRetries: Number(llm.max_retries ?? 1),
  };
}

function it_extractJson(text: string): any | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    return null;
  }
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

async function it_assignSegmentsWithLlm(
  llmConfig: ItQianfanConfig,
  questions: string[],
  segments: ItAudioSegment[],
): Promise<
  | {
      timings: ItQuestionTiming[];
      answers: Array<{ question: string; answer: string }>;
    }
  | null
> {
  if (!questions.length || !segments.length) {
    return null;
  }
  const speechSegments = segments
    .filter((seg) => seg.type === "speech" && seg.text && seg.text.trim())
    .slice(0, 120);
  if (!speechSegments.length) {
    return null;
  }

  const lines = speechSegments.map(
    (seg, idx) =>
      `${idx}. [${it_formatSeconds(seg.startSec)}-${it_formatSeconds(seg.endSec)}] ${seg.text}`,
  );
  const systemPrompt =
    "你是中文面试答题分段助手。根据题目列表，将转写分段归属到对应题目。仅输出JSON。";
  const userPrompt = [
    "题目列表:",
    questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n"),
    "",
    "转写分段(仅语音):",
    lines.join("\n"),
    "",
    "要求:",
    "1) 输出 JSON: {assignments:[{segmentIndex, questionIndex}]}。",
    "2) questionIndex 从 0 开始，对应题目顺序。",
    "3) 非答题内容可标记为 -1。",
  ].join("\n");

  try {
    const content = await it_callQianfanChat(llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const parsed = it_extractJson(content);
    const assignments = Array.isArray(parsed?.assignments)
      ? parsed.assignments
      : [];
    if (!assignments.length) {
      return null;
    }
    const mapping: Array<number> = new Array(speechSegments.length).fill(-1);
    assignments.forEach((item: any) => {
      const segIndex = Number(item?.segmentIndex);
      const qIndex = Number(item?.questionIndex);
      if (
        Number.isFinite(segIndex) &&
        Number.isFinite(qIndex) &&
        segIndex >= 0 &&
        segIndex < mapping.length
      ) {
        mapping[segIndex] = qIndex;
      }
    });

    const timings: ItQuestionTiming[] = [];
    const answers: Array<{ question: string; answer: string }> = [];
    for (let q = 0; q < questions.length; q += 1) {
      const segs = speechSegments.filter((_, idx) => mapping[idx] === q);
      if (!segs.length) {
        return null;
      }
      const startSec = Math.min(...segs.map((seg) => seg.startSec));
      const endSec = Math.max(...segs.map((seg) => seg.endSec));
      timings.push({
        question: questions[q],
        startSec,
        endSec,
        durationSec: Math.max(0, endSec - startSec),
        note: "LLM分段",
      });
      answers.push({
        question: questions[q],
        answer: segs.map((seg) => seg.text?.trim()).filter(Boolean).join(""),
      });
    }
    return { timings, answers };
  } catch {
    return null;
  }
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
  onProgress?: (processed: number, total: number) => void,
): Promise<string> {
  let chunkSec = Math.max(5, Math.floor(maxChunkSec || 50));
  let lastError: unknown = undefined;
  for (;;) {
    const chunks = it_splitPcmBase64(base64, sampleRate, chunkSec);
    const parts: string[] = [];
    try {
      for (let idx = 0; idx < chunks.length; idx += 1) {
        const chunk = chunks[idx];
        const part = await it_callBaiduAsr(asrConfig, {
          format: "pcm",
          rate: sampleRate,
          channel: 1,
          cuid: uuidv4(),
          speech: chunk.speech,
          len: chunk.len,
        });
        parts.push(part);
        onProgress?.(idx + 1, chunks.length);
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
  const reportProgress = (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => {
    deps.onProgress?.({
      step,
      progress,
      message,
      status,
    });
  };
  const env = deps.apiConfig.active?.environment || "prod";
  const envConfig = it_getEnvConfig(deps.apiConfig, env);
  const questionText = request.questionText?.trim() || "";
  const questionList = (request.questionList ?? []).filter((q) => q.trim());
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }

  const asrCfg = envConfig.asr ?? {};
  const asrProvider = asrCfg.provider || "baidu_vop";
  const asrLabel = asrProvider === "mock" ? "模拟" : "API";
  reportProgress("asr", 0, `语音转写 0% · ${asrLabel}`, "running");
  let transcript = "";
  if (asrProvider === "mock") {
    transcript = String(asrCfg.mock_text || "");
    reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
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
        (done, total) => {
          const percent = total ? Math.round((done / total) * 100) : 0;
          reportProgress(
            "asr",
            percent,
            `语音转写 ${percent}% · ${asrLabel}`,
            "running",
          );
        },
      );
    } else {
      reportProgress("asr", 25, `语音转写 25% · ${asrLabel}`, "running");
      transcript = await it_callBaiduAsr(asrConfig, {
        format: request.audio.format,
        rate: request.audio.sampleRate,
        channel: 1,
        cuid: uuidv4(),
        speech: request.audio.base64,
        len: request.audio.byteLength,
      });
    }
    reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
  }

  reportProgress("acoustic", 20, "声学分析 20% · 本地", "running");
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
  reportProgress("acoustic", 100, "声学分析 100% · 本地", "success");

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

  let questionTimings: ItQuestionTiming[] = [];
  let questionAnswers: Array<{ question: string; answer: string }> | undefined =
    undefined;
  if (audioSegments && questionList.length > 1) {
    const llmConfig = it_getLlmConfig(envConfig);
    if (llmConfig) {
      const assigned = await it_assignSegmentsWithLlm(
        llmConfig,
        questionList,
        audioSegments,
      );
      if (assigned) {
        questionTimings = assigned.timings;
        questionAnswers = assigned.answers;
      }
    }
  }
  if (!questionTimings.length) {
    questionTimings = it_buildQuestionTimings(
      questionText,
      questionList,
      acoustic.durationSec || request.audio.durationSec || 0,
      audioSegments,
    );
  }

  let notes: ReturnType<typeof it_retrieveNotes> = [];
  const retrievalEnabled = deps.skillConfig.retrieval?.enabled !== false;
  if (!retrievalEnabled) {
    reportProgress("notes", 100, "笔记检索 已关闭 · 本地", "success");
  } else {
    reportProgress("notes", 15, "笔记检索 15% · 本地", "running");
    const workspaceCfg = deps.skillConfig.workspace ?? {};
    const notesStart = Date.now();
    const corpus = it_buildCorpus({
      notes: path.join(deps.workspaceRoot, workspaceCfg.notes_dir || "inputs/notes"),
      prompts: path.join(
        deps.workspaceRoot,
        workspaceCfg.prompts_dir || "inputs/prompts/guangdong",
      ),
      rubrics: path.join(
        deps.workspaceRoot,
        workspaceCfg.rubrics_dir || "inputs/rubrics",
      ),
      knowledge: path.join(
        deps.workspaceRoot,
        workspaceCfg.knowledge_dir || "inputs/knowledge",
      ),
      examples: path.join(
        deps.workspaceRoot,
        workspaceCfg.examples_dir || "inputs/examples",
      ),
    });
    notes = it_retrieveNotes(
      transcript,
      corpus,
      Number(deps.skillConfig.retrieval?.top_k ?? 5),
      Number(deps.skillConfig.retrieval?.min_score ?? 0.1),
    );
    const notesElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
    const sourceCount = new Set(corpus.map((item) => item.source)).size;
    const slowHint =
      sourceCount > 200 ? "文件较多，建议精简 inputs 目录" : undefined;
    const notesMessage = `笔记检索 ${sourceCount}份 · ${notesElapsedSec}s · 本地${
      slowHint ? `（${slowHint}）` : ""
    }`;
    reportProgress("notes", 100, notesMessage, "success");
  }

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

  const evalUsesApi = Boolean(
    envConfig.llm?.provider === "baidu_qianfan" && envConfig.llm?.api_key,
  );
  const evalLabel = evalUsesApi ? "API" : "启发式";
  reportProgress("evaluation", 10, `面试评价 10% · ${evalLabel}`, "running");
  const evaluation: ItEvaluation = await it_evaluateAnswer(
    questionText || topicTitle,
    transcript,
    acoustic,
    notes,
    evaluationConfig,
    questionList,
    questionAnswers,
  );
  reportProgress("evaluation", 100, `面试评价 100% · ${evalLabel}`, "success");

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

  reportProgress("report", 30, "结果生成 30% · 本地", "running");
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
  reportProgress("report", 100, "结果生成 100% · 本地", "success");

  reportProgress("write", 40, "写入文件 40% · 本地", "running");
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
  reportProgress("write", 100, "写入文件 100% · 本地", "success");

  return response;
}
