import fs from "fs";
import path from "path";
import * as vscode from "vscode";
import {
  ItAnalyzeRequest,
  ItAnalyzeResponse,
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
  ItQuestionTiming,
  ItAudioSegment,
  ItStepStatus,
  ItWorkflowStep,
} from "../../protocol/interviewTrainer";
import { v4 as uuidv4 } from "uuid";

import { it_callBaiduAsr } from "../api/it_baidu";
import { it_callVolcAsr } from "../api/it_volc_asr";
import { ItApiConfig } from "../api/it_apiConfig";
import { it_callLlmChat, ItLlmConfig } from "../api/it_llm";
import { it_evaluateAnswer } from "./it_evaluation";
import {
  ItCorpusItem,
  it_buildCorpusAsync,
  it_createRetrievalMetrics,
  it_retrieveNotesMulti,
} from "./it_notes";
import {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
  it_writeTopicMetaAsync,
} from "../storage/it_sessions";
import {
  it_readQuestionParseCache,
  it_writeQuestionParseCache,
} from "../storage/it_questionCache";
import {
  it_summarizeAudioMetrics,
  it_decodePcm16,
  it_buildDetailedTranscript,
} from "../utils/it_audio";
import { it_formatSeconds, it_hashText, it_normalizeText } from "../utils/it_text";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import { it_appendReportAsync, it_updateReferenceNotesFileAsync } from "./it_report";
import { it_parseQuestions } from "./it_questionParser";

function it_normalizeWorkspaceKey(root: string): string {
  const resolved = path.resolve(String(root || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

interface ItAnalyzeDeps {
  context: vscode.ExtensionContext;
  apiConfig: ItApiConfig;
  skillConfig: Record<string, any>;
  workspaceRoot: string;
  onProgress?: (update: ItAnalyzeProgress) => void;
  onPartial?: (partial: {
    transcript?: string;
    detailedTranscript?: string;
    acoustic?: ItAcousticMetrics;
    notes?: ItNoteHit[];
    questionTimings?: ItQuestionTiming[];
    questionTimingNote?: string;
    evaluation?: ItEvaluation;
  }) => void;
  onCorpusTrace?: (message: string, detail?: Record<string, unknown>) => void;
  corpusDirty?: boolean;
  corpusDirtyFiles?: string[];
  abortSignal?: { aborted: boolean };
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

function it_sanitizeTopicTitle(raw: string, maxLen: number): string {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[\p{P}\p{S}]/gu, "");
  const base = cleaned || String(raw || "").trim();
  if (!base) {
    return "未命名";
  }
  return base.slice(0, Math.max(1, maxLen));
}

async function it_generateTopicTitleWithLlm(
  llmConfig: ItLlmConfig | null,
  questionText: string,
  questionList: string[],
  maxLen: number,
): Promise<string | null> {
  if (!llmConfig) {
    return null;
  }
  const material = questionText.trim();
  const questions = questionList.filter((item) => item.trim());
  if (!material && !questions.length) {
    return null;
  }
  const systemPrompt = [
    "你是题干标题提炼器，只输出 JSON。",
    `标题用于文件夹命名，长度<=${maxLen}字，不要标点、引号、空格或换行。`,
    "如果是多题目与背景材料，请提炼总体主题，不要只取第一题前几个字。",
    "输出 JSON 格式: { \"title\": \"...\" }",
  ].join("\n");
  const userPrompt = [
    material ? `背景材料/题干:\n${material}` : "",
    questions.length ? `题目列表:\n${questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  try {
    const content = await it_callLlmChat(
      {
        ...llmConfig,
        maxRetries: Math.max(0, Number(llmConfig.maxRetries ?? 1)),
      },
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    );
    const parsed = it_extractJson(content);
    const candidate =
      (parsed && (parsed.title || parsed.name || parsed.topic)) ||
      String(content || "").split(/\r?\n/)[0];
    const normalized = it_sanitizeTopicTitle(String(candidate || ""), maxLen);
    return normalized || null;
  } catch {
    return null;
  }
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

async function it_storeRecordingAsync(
  topicDir: string,
  attemptIndex: number,
  audio: ItAnalyzeRequest["audio"],
): Promise<string> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const ext = audio.format === "pcm" ? "wav" : audio.format;
  const tempPath = path.join(
    topicDir,
    `attempt-${String(attemptIndex).padStart(2, "0")}-${timestamp}.${ext}`,
  );
  if (audio.format === "pcm") {
    const pcm = it_decodePcm16(audio.base64);
    const wavBuffer = it_pcm16ToWavBuffer(pcm, audio.sampleRate, 1);
    await fs.promises.writeFile(tempPath, wavBuffer);
  } else {
    const buffer = Buffer.from(audio.base64, "base64");
    await fs.promises.writeFile(tempPath, buffer);
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
  const cnDigits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const toCn = (num: number): string => {
    if (num <= 0) {
      return "";
    }
    if (num < 10) {
      return cnDigits[num];
    }
    if (num === 10) {
      return "十";
    }
    if (num < 20) {
      return `十${cnDigits[num - 10]}`;
    }
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return `${cnDigits[tens]}十${ones ? cnDigits[ones] : ""}`;
    }
    return String(num);
  };
  const startTimes: Array<number | undefined> = new Array(questionList.length).fill(
    undefined,
  );
  const findMarker = (index: number): number | undefined => {
    const digit = String(index + 1);
    const cn = toCn(index + 1);
    const pattern = cn ? `${cn}|${digit}` : digit;
    const regex = new RegExp(`第\\s*(${pattern})\\s*[题问]`);
    const hit = segments.find((seg) => seg.text && regex.test(seg.text));
    return hit ? hit.startSec : undefined;
  };
  for (let idx = 0; idx < questionList.length; idx += 1) {
    startTimes[idx] = findMarker(idx);
  }
  if (startTimes[0] === undefined) {
    const firstSpeech = segments.find((seg) => seg.type === "speech");
    startTimes[0] = firstSpeech?.startSec ?? 0;
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

function it_isVolcAsrProvider(provider: string): boolean {
  const normalized = String(provider || "").toLowerCase();
  return (
    normalized === "volc_asr" ||
    normalized === "volcengine_asr" ||
    normalized === "volc_doubao"
  );
}

function it_buildVolcAudioPayload(
  audio: ItAnalyzeRequest["audio"],
): {
  data?: string;
  format?: string;
  rate?: number;
  bits?: number;
  channel?: number;
} {
  if (audio.format === "pcm") {
    const pcm = it_decodePcm16(audio.base64);
    const wavBuffer = it_pcm16ToWavBuffer(pcm, audio.sampleRate, 1);
    return {
      data: wavBuffer.toString("base64"),
      format: "wav",
      rate: audio.sampleRate,
      bits: 16,
      channel: 1,
    };
  }
  return {
    data: audio.base64,
    format: audio.format,
    rate: audio.sampleRate,
    bits: 16,
    channel: 1,
  };
}

function it_getLlmConfig(
  envConfig: any,
  override?: Record<string, any>,
): ItLlmConfig | null {
  const base = envConfig?.llm ?? {};
  const llm = {
    ...base,
    ...(override || {}),
  };
  const provider = llm.provider || base.provider;
  const apiKey = llm.api_key || llm.apiKey || base.api_key || "";
  if (!provider || !apiKey) {
    return null;
  }
  const isDoubao = provider === "volc_doubao";
  const defaultBase = isDoubao
    ? "https://ark.cn-beijing.volces.com"
    : "https://qianfan.baidubce.com/v2";
  const retryValue = Number(llm.max_retries ?? 1);
  const resolvedRetries = Number.isFinite(retryValue) ? Math.max(0, retryValue) : 1;
  return {
    provider,
    apiKey,
    baseUrl: llm.base_url || llm.baseUrl || defaultBase,
    model:
      llm.model ||
      (isDoubao ? "doubao-seed-1-8-251228" : "ernie-4.5-turbo-128k"),
    temperature: Number(llm.temperature ?? 0.2),
    topP: Number(llm.top_p ?? 0.8),
    timeoutSec: Number(llm.timeout_sec ?? 60),
    maxRetries: resolvedRetries,
    antiRepeat: Boolean(llm.anti_repeat ?? llm.antiRepeat ?? false),
    useResponses: Boolean(
      llm.use_responses ?? llm.useResponses ?? (isDoubao ? true : false),
    ),
    webSearch: Boolean(
      llm.web_search ?? llm.webSearch ?? (isDoubao ? true : false),
    ),
    reasoningEffort:
      llm.reasoning_effort ?? llm.reasoningEffort ?? (isDoubao ? "medium" : undefined),
    maxOutputTokens: Number(llm.max_output_tokens ?? llm.maxOutputTokens ?? 800),
    reusePrefix: Boolean(
      llm.reuse_prefix ?? llm.reusePrefix ?? (isDoubao ? true : false),
    ),
  };
}

function it_resolveTaskProfile(
  envConfig: any,
  skillConfig: Record<string, any>,
  taskKey: "question_parse" | "segment" | "evaluation",
): Record<string, any> | null {
  const tasks = skillConfig?.llm_tasks || {};
  const profileId = String(
    tasks[taskKey] ||
      (taskKey === "question_parse" ? tasks.questionParse : "") ||
      "",
  ).trim();
  if (!profileId) {
    return null;
  }
  const profiles = envConfig?.llm_profiles || {};
  return profiles[profileId] || null;
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

function it_maskLlmConfig(config: ItLlmConfig): Record<string, unknown> {
  return {
    ...config,
    apiKey: config.apiKey ? "***" : "",
  };
}

async function it_assignSegmentsWithLlm(
  llmConfig: ItLlmConfig,
  questions: string[],
  segments: ItAudioSegment[],
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
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
    .filter((seg) => seg.type === "speech" && seg.text && seg.text.trim());
  if (!speechSegments.length) {
    return null;
  }

  const lines = speechSegments.map(
    (seg, idx) =>
      `${idx}. [${it_formatSeconds(seg.startSec)}-${it_formatSeconds(seg.endSec)}] ${seg.text}`,
  );
  const systemPrompt =
    "你是中文面试答题分段助手。根据题目列表，将转写分段归属到对应题目。允许只回答部分题目，仅输出JSON。";
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
    "4) 可能只回答部分题目，未回答题目无需分配。",
  ].join("\n");

  try {
    onTrace?.("多题分段 LLM 请求（远程对齐）", {
      config: it_maskLlmConfig(llmConfig),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = await it_callLlmChat(llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    onTrace?.("多题分段 LLM 返回（远程对齐）", { text: content });
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
    const answers: Array<{ question: string; answer: string }> = questions.map(
      (question) => ({ question, answer: "" }),
    );
    let answeredCount = 0;
    for (let q = 0; q < questions.length; q += 1) {
      const segs = speechSegments.filter((_, idx) => mapping[idx] === q);
      if (!segs.length) {
        continue;
      }
      answeredCount += 1;
      const startSec = Math.min(...segs.map((seg) => seg.startSec));
      const endSec = Math.max(...segs.map((seg) => seg.endSec));
      timings[q] = {
        question: questions[q],
        startSec,
        endSec,
        durationSec: Math.max(0, endSec - startSec),
        note: "LLM分段",
      };
      answers[q].answer = segs
        .map((seg) => seg.text?.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    }
    return answeredCount ? { timings, answers } : null;
  } catch (error) {
    onTrace?.("多题分段 LLM 失败（远程对齐）", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function it_splitAnswersWithLlm(
  llmConfig: ItLlmConfig,
  questions: string[],
  transcript: string,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
): Promise<Array<{ question: string; answer: string }> | null> {
  if (!questions.length || !transcript.trim()) {
    return null;
  }

  const systemPrompt =
    "你是中文面试逐题拆分助手。请按整题识别考生回答，允许只回答部分题目，仅输出 JSON。";
  const userPrompt = [
    "题目列表:",
    questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n"),
    "",
    "考生完整转写:",
    transcript.trim(),
    "",
    "输出要求:",
    "1) 仅输出 JSON: {answers:[{questionIndex, answer, confidence?}]}。",
    "2) questionIndex 从 0 开始，仅包含有回答的题目。",
    "3) answer 必须尽量使用原文连续片段，不要改写或总结。",
    "4) 不确定可省略该题或给出低置信度。",
  ].join("\n");

  try {
    onTrace?.("多题分段 LLM 请求（逐题拆分）", {
      config: it_maskLlmConfig(llmConfig),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    });
    const content = await it_callLlmChat(llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    onTrace?.("多题分段 LLM 返回（逐题拆分）", { text: content });
    const parsed = it_extractJson(content);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    if (!answers.length) {
      return null;
    }
    const normalizedQuestions = questions.map((q) => it_normalizeText(q));
    const findQuestionIndex = (value: string): number => {
      const normalized = it_normalizeText(value);
      if (!normalized) {
        return -1;
      }
      const exact = normalizedQuestions.indexOf(normalized);
      if (exact !== -1) {
        return exact;
      }
      return -1;
    };
    if (answers.length === questions.length && typeof answers[0] === "string") {
      return answers.map((item: any, idx: number) => ({
        question: questions[idx],
        answer: typeof item === "string" ? item.trim() : String(item ?? "").trim(),
      }));
    }
    const result = questions.map((question) => ({ question, answer: "" }));
    let answeredCount = 0;
    answers.forEach((item: any) => {
      const rawAnswer =
        typeof item?.answer === "string"
          ? item.answer
          : typeof item?.text === "string"
            ? item.text
            : typeof item === "string"
              ? item
              : String(item?.answer ?? item?.text ?? "");
      const answerText = String(rawAnswer || "").trim();
      if (!answerText) {
        return;
      }
      let qIndex = Number(
        item?.questionIndex ??
          item?.index ??
          item?.qIndex ??
          item?.question_index ??
          -1,
      );
      if (!Number.isFinite(qIndex) || qIndex < 0 || qIndex >= questions.length) {
        if (typeof item?.question === "string") {
          qIndex = findQuestionIndex(item.question);
        }
      }
      if (!Number.isFinite(qIndex) || qIndex < 0 || qIndex >= questions.length) {
        return;
      }
      const existing = result[qIndex].answer;
      result[qIndex].answer = existing
        ? `${existing} ${answerText}`.replace(/\s+/g, " ").trim()
        : answerText;
      answeredCount += 1;
    });
    return answeredCount ? result : null;
  } catch (error) {
    onTrace?.("多题分段 LLM 失败（逐题拆分）", {
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function it_alignAnswerToSegments(
  answer: string,
  segments: ItAudioSegment[],
): { startSec: number; endSec: number } | null {
  const normalizedTarget = it_normalizeText(answer);
  if (!normalizedTarget) {
    return null;
  }

  const speechSegments = segments.filter(
    (seg) => seg.type === "speech" && seg.text && it_normalizeText(seg.text),
  );
  if (!speechSegments.length) {
    return null;
  }

  const normalizedSegments = speechSegments.map((seg) => it_normalizeText(seg.text || ""));
  const offsets: number[] = [];
  let cursor = 0;
  for (const text of normalizedSegments) {
    offsets.push(cursor);
    cursor += text.length;
  }
  const joined = normalizedSegments.join("");

  const collectPositions = (needle: string, limit: number = 6): number[] => {
    if (!needle) {
      return [];
    }
    const positions: number[] = [];
    let pos = 0;
    while (positions.length < limit) {
      const idx = joined.indexOf(needle, pos);
      if (idx === -1) {
        break;
      }
      positions.push(idx);
      pos = idx + 1;
    }
    return positions;
  };

  const findSegmentIndex = (pos: number): number => {
    for (let i = 0; i < normalizedSegments.length; i += 1) {
      const start = offsets[i];
      const end = start + normalizedSegments[i].length;
      if (pos < end) {
        return i;
      }
    }
    return normalizedSegments.length - 1;
  };

  const locateRange = (startPos: number, length: number): { startSec: number; endSec: number } => {
    const startIdx = findSegmentIndex(startPos);
    const endIdx = findSegmentIndex(startPos + Math.max(0, length - 1));
    return {
      startSec: speechSegments[startIdx].startSec,
      endSec: speechSegments[endIdx].endSec,
    };
  };

  let startPos = joined.indexOf(normalizedTarget);
  let matchLen = normalizedTarget.length;
  if (startPos !== -1) {
    return locateRange(startPos, matchLen);
  }

  const anchorLengths = [48, 36, 24, 16];
  for (const anchorLen of anchorLengths) {
    if (normalizedTarget.length < anchorLen) {
      continue;
    }
    const half = Math.floor(anchorLen / 2);
    const anchorPositions = [
      0,
      Math.max(0, Math.floor(normalizedTarget.length * 0.33) - half),
      Math.max(0, Math.floor(normalizedTarget.length * 0.66) - half),
      Math.max(0, normalizedTarget.length - anchorLen),
    ];
    const anchors = Array.from(
      new Set(
        anchorPositions
          .map((pos) => normalizedTarget.slice(pos, pos + anchorLen))
          .filter(Boolean),
      ),
    );
    const matches = anchors
      .map((anchor) => ({
        anchor,
        len: anchor.length,
        positions: collectPositions(anchor, 6),
      }))
      .filter((entry) => entry.positions.length > 0);
    if (!matches.length) {
      continue;
    }
    if (matches.length === 1) {
      startPos = matches[0].positions[0];
      matchLen = matches[0].len;
      return locateRange(startPos, matchLen);
    }
    const limitedMatches = matches.slice(0, 4);
    let bestSpanStart: number | null = null;
    let bestSpanEnd: number | null = null;
    const dfs = (
      idx: number,
      minPos: number,
      maxEnd: number,
    ): void => {
      if (idx >= limitedMatches.length) {
        if (minPos === Number.POSITIVE_INFINITY) {
          return;
        }
        if (
          bestSpanStart === null ||
          bestSpanEnd === null ||
          maxEnd - minPos < bestSpanEnd - bestSpanStart
        ) {
          bestSpanStart = minPos;
          bestSpanEnd = maxEnd;
        }
        return;
      }
      const entry = limitedMatches[idx];
      entry.positions.forEach((pos) => {
        dfs(
          idx + 1,
          Math.min(minPos, pos),
          Math.max(maxEnd, pos + entry.len),
        );
      });
    };
    dfs(0, Number.POSITIVE_INFINITY, 0);
    if (bestSpanStart !== null && bestSpanEnd !== null) {
      return locateRange(
        bestSpanStart,
        Math.max(1, bestSpanEnd - bestSpanStart),
      );
    }
  }

  const charSet = new Set(normalizedTarget.split(""));
  const scores = normalizedSegments.map((text) => {
    if (!text) {
      return 0;
    }
    let hit = 0;
    for (const ch of text) {
      if (charSet.has(ch)) {
        hit += 1;
      }
    }
    return hit / Math.max(1, text.length);
  });
  let bestIdx = -1;
  let bestScore = 0;
  scores.forEach((score, idx) => {
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  if (bestIdx === -1 || bestScore < 0.08) {
    return null;
  }
  const threshold = Math.max(0.05, bestScore * 0.5);
  let startIdx = bestIdx;
  let endIdx = bestIdx;
  while (startIdx > 0 && scores[startIdx - 1] >= threshold) {
    startIdx -= 1;
  }
  while (endIdx < scores.length - 1 && scores[endIdx + 1] >= threshold) {
    endIdx += 1;
  }
  return {
    startSec: speechSegments[startIdx].startSec,
    endSec: speechSegments[endIdx].endSec,
  };
}

function it_collectAnswersFromSegments(
  timings: ItQuestionTiming[],
  segments: ItAudioSegment[],
): Array<{ question: string; answer: string }> {
  if (!timings.length || !segments.length) {
    return [];
  }
  return timings.map((timing) => {
    const texts = segments
      .filter(
        (seg) =>
          seg.type === "speech" &&
          seg.text &&
          seg.startSec < timing.endSec &&
          seg.endSec > timing.startSec,
      )
      .map((seg) => seg.text?.trim())
      .filter(Boolean) as string[];
    return {
      question: timing.question,
      answer: texts.join(" ").replace(/\s+/g, " ").trim(),
    };
  });
}

function it_countWordsForRate(text: string): number {
  if (!text) {
    return 0;
  }
  const chinese = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const alnum = text.match(/[A-Za-z0-9]+/g) ?? [];
  return chinese.length + alnum.length;
}

function it_buildAcousticForTiming(
  timing: ItQuestionTiming | undefined,
  segments: ItAudioSegment[] | undefined,
  fallbackText: string,
): ItAcousticMetrics {
  const durationSec = timing ? Math.max(0, timing.endSec - timing.startSec) : 0;
  if (!timing || !segments || !segments.length || durationSec <= 0) {
    return {
      durationSec,
      speechDurationSec: 0,
      speechRateWpm: undefined,
      pauseCount: 0,
      pauseAvgSec: 0,
      pauseMaxSec: 0,
      rmsDbMean: 0,
      rmsDbStd: 0,
      snrDb: undefined,
    };
  }

  const start = timing.startSec;
  const end = timing.endSec;
  let speechDurationSec = 0;
  const pauseDurations: number[] = [];
  const speechTexts: string[] = [];
  const volumeValues: number[] = [];

  segments.forEach((seg) => {
    if (seg.endSec <= start || seg.startSec >= end) {
      return;
    }
    const overlap = Math.min(seg.endSec, end) - Math.max(seg.startSec, start);
    if (overlap <= 0) {
      return;
    }
    if (seg.type === "speech") {
      speechDurationSec += overlap;
      if (seg.text) {
        speechTexts.push(seg.text);
      }
      if (Number.isFinite(seg.volumeDb)) {
        volumeValues.push(seg.volumeDb as number);
      }
    } else {
      pauseDurations.push(overlap);
    }
  });

  const speechText = speechTexts.join("") || fallbackText;
  const wordCount = it_countWordsForRate(speechText);
  const speechRateWpm =
    speechDurationSec > 0 && wordCount > 0
      ? Number((wordCount / (speechDurationSec / 60)).toFixed(2))
      : undefined;
  const pauseAvg =
    pauseDurations.length > 0
      ? pauseDurations.reduce((sum, v) => sum + v, 0) / pauseDurations.length
      : 0;
  const pauseMax = pauseDurations.length ? Math.max(...pauseDurations) : 0;
  const rmsMean =
    volumeValues.length > 0
      ? volumeValues.reduce((sum, v) => sum + v, 0) / volumeValues.length
      : 0;
  const rmsStd =
    volumeValues.length > 0
      ? Math.sqrt(
          volumeValues.reduce((sum, v) => sum + (v - rmsMean) ** 2, 0) /
            volumeValues.length,
        )
      : 0;

  return {
    durationSec,
    speechDurationSec: Number(speechDurationSec.toFixed(2)),
    speechRateWpm,
    pauseCount: pauseDurations.length,
    pauseAvgSec: Number(pauseAvg.toFixed(2)),
    pauseMaxSec: Number(pauseMax.toFixed(2)),
    rmsDbMean: Number(rmsMean.toFixed(2)),
    rmsDbStd: Number(rmsStd.toFixed(2)),
    snrDb: undefined,
  };
}

function it_mergeNoteHits(lists: ItNoteHit[][], topK: number): ItNoteHit[] {
  const merged = new Map<string, ItNoteHit>();
  lists.forEach((hits) => {
    hits.forEach((hit) => {
      const key = `${hit.source}::${hit.snippet}`;
      const existing = merged.get(key);
      if (!existing || hit.score > existing.score) {
        merged.set(key, hit);
      }
    });
  });
  return Array.from(merged.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, topK));
}

function it_mergeNoteHitsAll(lists: ItNoteHit[][]): ItNoteHit[] {
  const merged = new Map<string, ItNoteHit>();
  lists.forEach((hits) => {
    hits.forEach((hit) => {
      const key = `${hit.source}::${hit.snippet}`;
      const existing = merged.get(key);
      if (!existing || hit.score > existing.score) {
        merged.set(key, hit);
      }
    });
  });
  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}

function it_mergeEvaluations(params: {
  topicTitle: string;
  questions: string[];
  answers: Array<{ question: string; answer: string }>;
  evaluations: ItEvaluation[];
  timePlan: number[];
}): ItEvaluation {
  const { topicTitle, questions, answers, evaluations, timePlan } = params;
  const scores: Record<string, number> = {};
  const totals: Record<string, { sum: number; count: number }> = {};
  evaluations.forEach((item) => {
    Object.entries(item.scores || {}).forEach(([key, value]) => {
      if (!Number.isFinite(value)) {
        return;
      }
      if (!totals[key]) {
        totals[key] = { sum: 0, count: 0 };
      }
      totals[key].sum += value;
      totals[key].count += 1;
    });
  });
  Object.entries(totals).forEach(([key, stats]) => {
    scores[key] = stats.count ? Math.round(stats.sum / stats.count) : 0;
  });

  const successful = evaluations.filter((item) => item.mode === "llm");
  const overallScore = successful.length
    ? Math.round(
        successful.reduce((sum, item) => sum + (item.overallScore || 0), 0) /
          successful.length,
      )
    : 0;

  const mergeList = (lists: string[][]): string[] => {
    const unique: string[] = [];
    const seen = new Set<string>();
    lists.flat().forEach((item) => {
      const value = String(item || "").trim();
      if (!value || seen.has(value)) {
        return;
      }
      seen.add(value);
      unique.push(value);
    });
    return unique;
  };

  const strengths = mergeList(evaluations.map((item) => item.strengths || []));
  const issues = mergeList(evaluations.map((item) => item.issues || []));
  const improvements = mergeList(evaluations.map((item) => item.improvements || []));
  const nextFocus = mergeList(evaluations.map((item) => item.nextFocus || []));

  const noteUsage = evaluations.flatMap((item, idx) =>
    (item.noteUsage || []).map((note) => `第${idx + 1}题: ${note}`),
  );
  const noteSuggestions = evaluations.flatMap((item, idx) =>
    (item.noteSuggestions || []).map((note) => `第${idx + 1}题: ${note}`),
  );

  const revisedAnswers = questions.map((question, idx) => {
    const evalItem = evaluations[idx];
    const revised = evalItem?.revisedAnswers?.[0];
    const planned = timePlan[idx] ?? revised?.estimatedTimeMin ?? 3;
    return {
      question,
      original: revised?.original || answers[idx]?.answer || "",
      revised: revised?.revised || "",
      estimatedTimeMin: planned,
      outlineOriginal: revised?.outlineOriginal,
      outlineRevised: revised?.outlineRevised,
    };
  });

  const topicSummary = evaluations
    .map((item, idx) => {
      const summary = item.topicSummary || "无";
      return `第${idx + 1}题：${summary}`;
    })
    .join("；");

  const prompt = evaluations
    .map((item, idx) =>
      item.prompt ? `【第${idx + 1}题】\n${item.prompt}` : "",
    )
    .filter(Boolean)
    .join("\n\n");
  const raw = evaluations
    .map((item, idx) => (item.raw ? `【第${idx + 1}题】${item.raw}` : ""))
    .filter(Boolean)
    .join("\n\n");

  return {
    topicTitle,
    topicSummary,
    scores,
    overallScore,
    strengths,
    issues,
    improvements,
    nextFocus,
    noteUsage,
    noteSuggestions,
    revisedAnswers,
    mode: evaluations.every((item) => item.mode === "llm") ? "llm" : "heuristic",
    raw: raw || undefined,
    prompt: prompt || undefined,
  };
}

function it_extractKeywords(text: string, limit: number): string[] {
  const raw = String(text || "");
  const hasChinese = /[\u4e00-\u9fff]/.test(raw);
  const cleaned = hasChinese
    ? raw.replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, "")
    : raw.toLowerCase();
  if (!cleaned.trim()) {
    return [];
  }
  const tokens: string[] = [];
  if (hasChinese) {
    for (let i = 0; i < cleaned.length - 1; i += 1) {
      tokens.push(cleaned.slice(i, i + 2));
    }
  } else {
    tokens.push(
      ...cleaned
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  }
  const freq = new Map<string, number>();
  tokens.forEach((token) => {
    freq.set(token, (freq.get(token) || 0) + 1);
  });
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([token]) => token);
}

function it_buildRetrievalQueries(params: {
  questionText: string;
  questionList: string[];
  transcript: string;
  answers?: Array<{ question: string; answer: string }>;
}): string[] {
  const queries: string[] = [];
  const list = params.questionList.length
    ? params.questionList
    : params.questionText
      ? [params.questionText]
      : [];
  if (!list.length) {
    if (params.transcript.trim()) {
      queries.push(params.transcript.trim().slice(0, 240));
    }
    return queries;
  }

  const answerMap = new Map<string, string>();
  (params.answers || []).forEach((item) => {
    if (item?.question) {
      answerMap.set(item.question, item.answer || "");
    }
  });
  list.forEach((question, idx) => {
    const answer = answerMap.get(question) || (list.length === 1 ? params.transcript : "");
    const trimmedAnswer = (answer || "").trim();
    const summary = trimmedAnswer.slice(0, 240);
    if (summary) {
      queries.push(`${question} ${summary}`.trim());
    } else {
      queries.push(question.trim());
    }
    const keywords = it_extractKeywords(trimmedAnswer || question, 10).join(" ");
    if (keywords) {
      queries.push(`${question} ${keywords}`.trim());
    }
    if (idx === 0 && params.questionText && params.questionText !== question) {
      queries.push(params.questionText.trim());
    }
  });
  return queries;
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
  maxConcurrency: number,
  onProgress?: (processed: number, total: number) => void,
): Promise<string> {
  let chunkSec = Math.max(5, Math.floor(maxChunkSec || 50));
  let lastError: unknown = undefined;
  const resolvedConcurrency = Number.isFinite(maxConcurrency)
    ? Math.max(1, Math.floor(maxConcurrency))
    : 1;
  const runWithLimit = async <T, R>(
    list: T[],
    limit: number,
    task: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    const results: R[] = new Array(list.length);
    let cursor = 0;
    const workers = new Array(Math.min(limit, list.length)).fill(0).map(async () => {
      while (cursor < list.length) {
        const index = cursor;
        cursor += 1;
        results[index] = await task(list[index], index);
      }
    });
    await Promise.all(workers);
    return results;
  };
  for (;;) {
    const chunks = it_splitPcmBase64(base64, sampleRate, chunkSec);
    const parts: string[] = new Array(chunks.length);
    let done = 0;
    try {
      await runWithLimit(chunks, resolvedConcurrency, async (chunk, idx) => {
        const part = await it_callBaiduAsr(asrConfig, {
          format: "pcm",
          rate: sampleRate,
          channel: 1,
          cuid: uuidv4(),
          speech: chunk.speech,
          len: chunk.len,
        });
        parts[idx] = part;
        done += 1;
        onProgress?.(done, chunks.length);
        return part;
      });
      return parts.join(" ").replace(/\s+/g, " ").trim();
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

async function it_transcribeAudio(
  request: ItAnalyzeRequest,
  asrCfg: any,
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void,
): Promise<string> {
  const asrProvider = asrCfg.provider || "baidu_vop";
  const asrLabel = asrProvider === "mock" ? "模拟" : "API";
  reportProgress("asr", 0, `语音转写 0% · ${asrLabel}`, "running");

  if (asrProvider === "mock") {
    const mockText = String(asrCfg.mock_text || "");
    reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
    return mockText;
  }
  if (it_isVolcAsrProvider(asrProvider)) {
    if (!asrCfg.api_key || !asrCfg.secret_key) {
      throw new Error("缺少火山引擎 ASR 的 App Key 或 Access Key。");
    }
    const modeRaw = String(asrCfg.mode || asrCfg.volc_mode || "flash").toLowerCase();
    const mode = modeRaw === "standard" ? "standard" : "flash";
    const baseUrl = asrCfg.base_url || "https://openspeech.bytedance.com";
    const resourceId =
      asrCfg.resource_id ||
      asrCfg.resourceId ||
      (mode === "standard" ? "volc.bigasr.auc" : "volc.bigasr.auc_turbo");
    const modelName = asrCfg.model_name || asrCfg.modelName || "bigmodel";
    const enablePunc =
      asrCfg.enable_punc ?? asrCfg.enablePunc ?? true;
    const userId = asrCfg.user_id || asrCfg.userId || "it-user";
    const audioUrl = asrCfg.audio_url || asrCfg.audioUrl || "";
    const audioFormat = asrCfg.audio_format || asrCfg.audioFormat;
    const audioPayload = audioUrl
      ? { url: audioUrl, format: audioFormat }
      : it_buildVolcAudioPayload(request.audio);
    if (mode === "standard" && !audioUrl) {
      throw new Error(
        "火山引擎 ASR 标准版需要 audio_url（可访问的音频地址）。请在 provider 配置中设置 audio_url 或切换到 flash 模式。",
      );
    }
    reportProgress("asr", 25, `语音转写 25% · ${asrLabel}`, "running");
    const transcript = await it_callVolcAsr(
      {
        appKey: asrCfg.api_key || "",
        accessKey: asrCfg.secret_key || "",
        baseUrl,
        resourceId,
        modelName,
        enablePunc: Boolean(enablePunc),
        userId,
        mode,
        timeoutSec: Number(asrCfg.timeout_sec ?? 120),
        maxRetries: Number(asrCfg.max_retries ?? 1),
        pollIntervalSec: Number(asrCfg.poll_interval_sec ?? 1),
        maxPollSec: Number(asrCfg.max_poll_sec ?? 300),
      },
      audioPayload,
    );
    reportProgress("asr", 100, `语音转写 100% · ${asrLabel}`, "success");
    return transcript;
  }
  if (asrProvider !== "baidu_vop") {
    throw new Error("当前仅支持百度语音转文字（baidu_vop）与火山引擎 ASR（volc_asr）。");
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
  const maxConcurrency = Number(asrCfg.max_concurrency ?? asrCfg.maxConcurrency ?? 1);
  let transcript = "";
  if (request.audio.format === "pcm" && request.audio.byteLength > 0) {
    transcript = await it_transcribePcmWithChunks(
      asrConfig,
      request.audio.base64,
      request.audio.sampleRate,
      maxChunkSec,
      maxConcurrency,
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
  return transcript;
}

async function it_persistAnalysis(params: {
  questionText: string;
  questionList: string[];
  topicTitle: string;
  topicDir: string;
  reportPath: string;
  attemptIndex: number;
  response: ItAnalyzeResponse;
  reportProgress: (
    step: ItWorkflowStep,
    progress: number,
    message?: string,
    status?: ItStepStatus,
  ) => void;
}): Promise<void> {
  const {
    questionText,
    questionList,
    topicTitle,
    topicDir,
    reportPath,
    attemptIndex,
    response,
    reportProgress,
  } = params;

  reportProgress("report", 30, "结果生成 30% · 本地", "running");
  await it_appendReportAsync(
    reportPath,
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
  await it_updateReferenceNotesFileAsync(topicDir, response.evaluation);
  reportProgress("report", 100, "结果生成 100% · 本地", "success");

  reportProgress("write", 40, "写入文件 40% · 本地", "running");
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
  await it_appendAttemptDataAsync(topicDir, attemptData);

  const meta = await it_readTopicMetaAsync(topicDir);
  const fingerprint = it_buildQuestionFingerprint(questionText, questionList);
  const normalized = fingerprint || it_normalizeText(questionText || topicTitle);
  const now = new Date().toISOString();
  await it_writeTopicMetaAsync(topicDir, {
    topicTitle: meta.topicTitle || topicTitle,
    questionText: questionText || meta.questionText || "",
    questionList: questionList.length ? questionList : meta.questionList || [],
    questionHash: meta.questionHash || it_hashText(normalized),
    createdAt: meta.createdAt || now,
    updatedAt: now,
    overallScore: response.evaluation.overallScore,
  });
  reportProgress("write", 100, "写入文件 100% · 本地", "success");
}

export async function it_runAnalysis(
  deps: ItAnalyzeDeps,
  request: ItAnalyzeRequest,
): Promise<ItAnalyzeResponse> {
  const ensureNotAborted = () => {
    if (deps.abortSignal?.aborted) {
      throw new Error("分析已停止");
    }
  };
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
  const questionParseProfile = it_resolveTaskProfile(
    envConfig,
    deps.skillConfig,
    "question_parse",
  );
  const llmConfig = it_getLlmConfig(envConfig, questionParseProfile || undefined);
  const cacheRoot = deps.context.globalStorageUri?.fsPath;
  let questionText = request.questionText?.trim() || "";
  let questionList = (request.questionList ?? []).filter((q) => q.trim());
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }
  ensureNotAborted();

  const parseStart = Date.now();
  let parsePromise: Promise<void> | null = null;
  const parseInput = questionText;
  if (questionList.length) {
    reportProgress(
      "question",
      100,
      `题目已提供 · ${questionList.length}题 · 本地`,
      "success",
    );
  } else {
    const cached = cacheRoot
      ? await it_readQuestionParseCache(cacheRoot, parseInput)
      : null;
    const hasCachedQuestions = Boolean(cached && cached.questions.length);
    if (hasCachedQuestions) {
      if (cached?.material) {
        questionText = cached.material;
      }
      questionList = cached?.questions ?? [];
      reportProgress(
        "question",
        100,
        `题目解析 100% · 缓存 · ${questionList.length}题`,
        "success",
      );
    } else {
      const prefix =
        cached && (cached.material || cached.questions.length)
          ? "题目解析 5% · 缓存未识别，重新解析"
          : "题目解析 5% · 本地";
      reportProgress("question", 5, prefix, "running");
      parsePromise = (async () => {
        const parsed = await it_parseQuestions(questionText, llmConfig);
        const elapsed = ((Date.now() - parseStart) / 1000).toFixed(1);
        const sourceLabel = parsed.source === "llm" ? "API" : "本地";
        if (deps.onCorpusTrace) {
          if (parsed.debug?.request) {
            deps.onCorpusTrace("题目解析 LLM 请求", parsed.debug.request);
          } else if (parsed.error === "LLM not configured") {
            deps.onCorpusTrace("题目解析 LLM 未配置", {});
          }
          if (parsed.debug?.response) {
            deps.onCorpusTrace("题目解析 LLM 返回", parsed.debug.response);
          }
          if (parsed.error && parsed.error !== "LLM not configured") {
            deps.onCorpusTrace("题目解析 LLM 失败", { error: parsed.error });
          }
          if (
            parsed.source === "llm" &&
            (!parsed.questions.length || !parsed.material) &&
            parsed.raw
          ) {
            deps.onCorpusTrace("题目解析 LLM 返回不完整", {
              raw: String(parsed.raw).slice(0, 500),
            });
          }
        }
        if (parsed.material) {
          questionText = parsed.material;
        }
        if (parsed.questions.length) {
          questionList = parsed.questions;
        }
        if (cacheRoot && (parsed.material || parsed.questions.length)) {
          await it_writeQuestionParseCache(cacheRoot, parseInput, {
            material: parsed.material || "",
            questions: parsed.questions || [],
            source: parsed.source,
          });
        }
        if (questionList.length) {
          reportProgress(
            "question",
            100,
            `题目解析 100% · ${questionList.length}题 · ${elapsed}s · ${sourceLabel}`,
            "success",
          );
        } else {
          reportProgress(
            "question",
            100,
            `题目解析完成 · 未识别题目 · ${elapsed}s · ${sourceLabel}`,
            "error",
          );
        }
      })().catch(() => {
        reportProgress("question", 100, "题目解析失败，使用原题干", "error");
      });
    }
  }

  const workspaceCfg = deps.skillConfig.workspace ?? {};
  const retrievalCfg = deps.skillConfig.retrieval ?? {};
  const retrievalEnabled = retrievalCfg.enabled !== false;
  const retrievalMode = String(retrievalCfg.mode || "vector");
  const retrievalLabel = retrievalMode === "keyword" ? "词面" : "向量";
  const corpusCacheMb = Number(
    retrievalCfg.corpus_cache_mb ?? retrievalCfg.corpus_cache_max_mb ?? 25,
  );
  const corpusCacheBytes = Number.isFinite(corpusCacheMb)
    ? Math.max(0, corpusCacheMb) * 1024 * 1024
    : undefined;
  let corpusPromise: Promise<{
    corpus: ItCorpusItem[];
    sourceCount: number;
    scanElapsedSec: string;
  }> | null = null;
  if (retrievalEnabled) {
    const notesStart = Date.now();
    const skipMtimeCheck = deps.corpusDirty === false;
    reportProgress(
      "notes",
      5,
      `${retrievalLabel}语料扫描 5%${skipMtimeCheck ? "（复用缓存）" : ""}`,
      "running",
    );
    corpusPromise = it_buildCorpusAsync(
      {
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
      },
      {
        cacheDir: cacheRoot,
        maxCacheBytes: corpusCacheBytes,
        skipMtimeCheck,
        dirtyFiles: deps.corpusDirtyFiles,
        onTrace: deps.onCorpusTrace,
      },
    ).then((corpus) => {
      const scanElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
      const sourceCount = new Set(corpus.map((item) => item.source)).size;
      reportProgress(
        "notes",
        30,
        `语料就绪 30%：${sourceCount}份 · ${corpus.length}段 · ${scanElapsedSec}s`,
        "running",
      );
      return { corpus, sourceCount, scanElapsedSec };
    });
  }

  const asrCfg = envConfig.asr ?? {};
  const transcript = await it_transcribeAudio(request, asrCfg, reportProgress);
  ensureNotAborted();
  deps.onPartial?.({ transcript });
  if (retrievalEnabled) {
    reportProgress("notes", 50, "语料就绪，等待检索准备", "running");
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
  ensureNotAborted();
  deps.onPartial?.({ acoustic });

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
    if (detailedTranscript) {
      deps.onPartial?.({ detailedTranscript });
    }
  }

  if (parsePromise) {
    await parsePromise;
    ensureNotAborted();
  }

  const segmentProfile = it_resolveTaskProfile(
    envConfig,
    deps.skillConfig,
    "segment",
  );
  const segmentLlmConfig = it_getLlmConfig(envConfig, segmentProfile || undefined);
  if (segmentLlmConfig) {
    segmentLlmConfig.maxOutputTokens = 0;
  }

  const multiQuestion = questionList.length > 1;
  if (multiQuestion) {
    reportProgress("segment", 5, "多题分段 5% · 准备中", "running");
  } else {
    reportProgress("segment", 100, "多题分段 跳过 · 单题", "success");
  }

  let questionTimings: ItQuestionTiming[] = [];
  let questionTimingNote: string | undefined = undefined;
  let questionAnswers: Array<{ question: string; answer: string }> | undefined =
    undefined;
  let llmTimingAttempted = false;
  let llmTimingFailed = false;
  if (multiQuestion) {
    if (audioSegments && segmentLlmConfig) {
      llmTimingAttempted = true;
      reportProgress("segment", 25, "多题分段 25% · 正在分段", "running");
      const splitAnswers = await it_splitAnswersWithLlm(
        segmentLlmConfig,
        questionList,
        transcript,
        deps.onCorpusTrace,
      );
      reportProgress(
        "segment",
        45,
        splitAnswers ? "多题分段 45% · 正在本地对齐" : "多题分段 45% · 正在本地对齐",
        "running",
      );
      if (splitAnswers) {
        questionAnswers = splitAnswers;
        const alignedTimings: ItQuestionTiming[] = [];
        let alignedCount = 0;
        let missingAlignment = false;
        for (let idx = 0; idx < splitAnswers.length; idx += 1) {
          const answerText = splitAnswers[idx].answer.trim();
          if (!answerText) {
            continue;
          }
          const aligned = it_alignAnswerToSegments(answerText, audioSegments);
          if (!aligned) {
            missingAlignment = true;
            continue;
          }
          alignedTimings[idx] = {
            question: splitAnswers[idx].question,
            startSec: aligned.startSec,
            endSec: aligned.endSec,
            durationSec: Math.max(0, aligned.endSec - aligned.startSec),
            note: "LLM逐题对齐",
          };
          alignedCount += 1;
        }
        if (alignedCount) {
          questionTimings = alignedTimings;
        }
        if (missingAlignment) {
          reportProgress("segment", 65, "多题分段 65% · 正在远程对齐", "running");
          const assigned = await it_assignSegmentsWithLlm(
            segmentLlmConfig,
            questionList,
            audioSegments,
            deps.onCorpusTrace,
          );
          if (assigned) {
            questionTimings = assigned.timings;
            questionAnswers = questionAnswers
              ? questionAnswers.map((item, idx) => ({
                  question: item.question,
                  answer: item.answer.trim()
                    ? item.answer
                    : assigned.answers[idx]?.answer || "",
                }))
              : assigned.answers;
          } else if (!questionTimings.length) {
            llmTimingFailed = true;
          }
        }
      }
      if (!questionTimings.length) {
      reportProgress("segment", 80, "多题分段 80% · 正在远程兜底", "running");
      const assigned = await it_assignSegmentsWithLlm(
        segmentLlmConfig,
        questionList,
        audioSegments,
        deps.onCorpusTrace,
      );
        if (assigned) {
          questionTimings = assigned.timings;
          if (!questionAnswers) {
            questionAnswers = assigned.answers;
          }
        } else {
          llmTimingFailed = true;
        }
      }
      if (!questionTimings.length) {
        llmTimingFailed = true;
      }
    } else {
      llmTimingAttempted = true;
      llmTimingFailed = true;
      reportProgress("segment", 100, "多题分段 100% · 缺少转写分段或LLM", "error");
    }
  } else if (questionList.length === 1 && !questionAnswers) {
    questionAnswers = [{ question: questionList[0], answer: transcript }];
  }
  if (!questionTimings.length && questionList.length && llmTimingFailed) {
    questionTimingNote = "无法计算（LLM分段失败）";
  }
  if (!questionAnswers && questionList.length) {
    questionAnswers = questionList.map((q) => ({
      question: q,
      answer: "",
    }));
  }
  if (questionTimings.length || questionTimingNote) {
    deps.onPartial?.({
      questionTimings: questionTimings.length ? questionTimings : undefined,
      questionTimingNote,
    });
  }
  if (multiQuestion && llmTimingAttempted) {
    reportProgress(
      "segment",
      100,
      llmTimingFailed ? "多题分段 100% · 失败" : "多题分段 100% · LLM",
      llmTimingFailed ? "error" : "success",
    );
  }

  let notes: ItAnalyzeResponse["notes"] = [];
  let notesByQuestion: ItNoteHit[][] = [];
  if (!retrievalEnabled) {
    reportProgress("notes", 100, "笔记检索 已关闭", "success");
  } else {
    let corpus: ItCorpusItem[] = [];
    let sourceCount = 0;
    let scanElapsedSec = "0.0";
    let notesError: string | undefined;
    let notesErrorStage: "load" | "retrieve" | undefined;
    if (corpusPromise) {
      try {
        const result = await corpusPromise;
        corpus = result.corpus;
        sourceCount = result.sourceCount;
        scanElapsedSec = result.scanElapsedSec;
        reportProgress(
          "notes",
          40,
          `笔记加载 40%：${sourceCount}份 · ${corpus.length}段 · ${scanElapsedSec}s`,
          "running",
        );
      } catch (err) {
        notesError = err instanceof Error ? err.message : String(err);
        notesErrorStage = "load";
      }
    }
    if (notesError) {
      reportProgress(
        "notes",
        100,
        `笔记加载失败：${notesError}`,
        "error",
      );
    }
    const notesStart = Date.now();
    const vectorCfg = retrievalCfg.vector ?? {};
    const providerProfiles = deps.skillConfig.providers ?? {};
    const embeddingProvider =
      retrievalCfg.embedding_provider || vectorCfg.provider || "";
    const providerEmbedding =
      (embeddingProvider && providerProfiles[embeddingProvider]?.embedding) || {};
    const resolvedVector = {
      provider: providerEmbedding.provider || vectorCfg.provider || embeddingProvider,
      base_url: providerEmbedding.base_url || vectorCfg.base_url,
      api_key: providerEmbedding.api_key || vectorCfg.api_key,
      model: providerEmbedding.model || vectorCfg.model,
      timeout_sec: Number(providerEmbedding.timeout_sec ?? vectorCfg.timeout_sec ?? 30),
      max_retries: Number(providerEmbedding.max_retries ?? vectorCfg.max_retries ?? 1),
      batch_size: Number(vectorCfg.batch_size ?? 16),
      query_max_chars: Number(vectorCfg.query_max_chars ?? 1500),
    };
    const notesTopK = Number(retrievalCfg.top_k ?? 5);
    const notesTopKNotes = Number(retrievalCfg.top_k_notes ?? notesTopK);
    const notesTopKKnowledge = Number(retrievalCfg.top_k_knowledge ?? notesTopK);
    const notesTopKRubrics = Number(retrievalCfg.top_k_rubrics ?? notesTopK);
    const notesTopKExamples = Number(retrievalCfg.top_k_examples ?? notesTopK);
    const notesMinScore = Number(retrievalCfg.min_score ?? 0.2);
    const workspaceKey = it_normalizeWorkspaceKey(deps.workspaceRoot);
    const notesCacheDir = cacheRoot
      ? path.join(cacheRoot, "embedding_cache", it_hashText(workspaceKey))
      : undefined;
    const queryCacheSize = Number(retrievalCfg.query_cache_size ?? 200);
    const maxConcurrency = Number(retrievalCfg.max_concurrency ?? 3);
    const queryCacheKey = it_hashText(
      `${workspaceKey}:${sourceCount}:${corpus.length}`,
    );
    let retrievalAnswers = questionAnswers;
    if (
      (!retrievalAnswers || retrievalAnswers.length !== questionList.length) &&
      audioSegments &&
      questionTimings.length
    ) {
      retrievalAnswers = it_collectAnswersFromSegments(questionTimings, audioSegments);
    }
    const kindLabels: Record<string, string> = {
      notes: "笔记",
      knowledge: "知识库",
      rubrics: "评分标准",
      examples: "示例答案",
    };
    const corpusByKind = {
      notes: corpus.filter((item) => item.kind === "notes"),
      knowledge: corpus.filter(
        (item) => item.kind === "knowledge" || item.kind === "prompts",
      ),
      rubrics: corpus.filter((item) => item.kind === "rubrics"),
      examples: corpus.filter((item) => item.kind === "examples"),
    };
    const kindTopK = {
      notes: notesTopKNotes,
      knowledge: notesTopKKnowledge,
      rubrics: notesTopKRubrics,
      examples: notesTopKExamples,
    };
    let notesPhase = "生成查询向量";
    let notesPercent = 70;
    let notesTasksTotal = 1;
    let notesTasksDone = 0;
    const concurrencyHint = maxConcurrency > 1 ? ` · 并行x${maxConcurrency}` : "";
    const updateNotesProgress = (percent: number) => {
      notesPercent = percent;
      const taskHint = notesTasksTotal ? ` · ${notesTasksDone}/${notesTasksTotal}` : "";
      reportProgress(
        "notes",
        percent,
        `${retrievalLabel}检索 ${percent}%${concurrencyHint}${taskHint} · ${notesPhase}`,
        "running",
      );
    };
    const setNotesPhase = (phase: string) => {
      if (!phase || phase === notesPhase) {
        return;
      }
      notesPhase = phase;
      updateNotesProgress(notesPercent);
    };
    const retrieveByKind = async (
      kind: keyof typeof corpusByKind,
      queryList: string[],
    ): Promise<ItNoteHit[]> => {
      const filtered = corpusByKind[kind];
      const topK = kindTopK[kind];
      if (!filtered.length || topK <= 0) {
        return [];
      }
      const label = kindLabels[kind] || kind;
      const metrics = it_createRetrievalMetrics();
      const startedAt = Date.now();
      const hits = await it_retrieveNotesMulti(queryList, filtered, {
        mode: retrievalMode === "keyword" ? "keyword" : "vector",
        topK,
        minScore: notesMinScore,
        cacheDir: notesCacheDir,
        cacheKey: `${queryCacheKey}:${kind}`,
        queryCacheSize,
        maxConcurrency,
        metrics,
        onPhase: setNotesPhase,
        onTrace: deps.onCorpusTrace,
        vector: {
          provider: resolvedVector.provider || "",
          apiKey: resolvedVector.api_key || "",
          baseUrl: resolvedVector.base_url || "",
          model: resolvedVector.model || "",
          timeoutSec: Number(resolvedVector.timeout_sec ?? 30),
          maxRetries: Number(resolvedVector.max_retries ?? 1),
          batchSize: Number(resolvedVector.batch_size ?? 16),
          queryMaxChars: Number(resolvedVector.query_max_chars ?? 1500),
        },
      });
      const elapsedMs = Date.now() - startedAt;
      deps.onCorpusTrace?.("检索统计", {
        语料: label,
        query数: metrics.queryCount,
        query向量缓存命中: metrics.queryEmbeddingHit,
        query向量缓存缺失: metrics.queryEmbeddingMiss,
        语料补算待处理: metrics.embeddingMissing,
        语料补算新增: metrics.embeddingCreated,
        耗时ms: elapsedMs,
      });
      return hits.map((hit) => ({
        ...hit,
        source: `[${label}] ${hit.source}`,
      }));
    };

    if (!notesError) {
      try {
        const questionsForNotes = questionList.length
          ? questionList
          : questionText
            ? [questionText]
            : [];
        const resolvedAnswers =
          retrievalAnswers && retrievalAnswers.length === questionsForNotes.length
            ? retrievalAnswers
            : questionsForNotes.map((question) => ({ question, answer: "" }));
        notesTasksTotal = questionsForNotes.length || 1;
        notesTasksDone = 0;
        notesPhase = "生成查询向量";
        updateNotesProgress(70);
        const bumpNotesProgress = () => {
          if (!notesTasksTotal) {
            return;
          }
          notesTasksDone = Math.min(notesTasksTotal, notesTasksDone + 1);
          const percent = 70 + Math.round((notesTasksDone / notesTasksTotal) * 25);
          updateNotesProgress(Math.min(95, percent));
        };
        if (questionsForNotes.length) {
          notesByQuestion = new Array(questionsForNotes.length);
          const noteTasks = questionsForNotes.map((question, idx) => {
            const answer = resolvedAnswers[idx]?.answer || "";
            const queries = it_buildRetrievalQueries({
              questionText: question,
              questionList: [question],
              transcript: answer || transcript,
              answers: answer ? [{ question, answer }] : undefined,
            });
            const queryList = queries.length ? queries : [question];
            return Promise.all([
              retrieveByKind("notes", queryList),
              retrieveByKind("knowledge", queryList),
              retrieveByKind("rubrics", queryList),
              retrieveByKind("examples", queryList),
            ])
              .then((results) => {
                const combined = results.flat();
                notesByQuestion[idx] = combined;
                return combined;
              })
              .finally(bumpNotesProgress);
          });
          await Promise.all(noteTasks);
          notes = it_mergeNoteHitsAll(notesByQuestion);
        } else {
          const fallbackQuery = transcript.trim()
            ? [transcript.trim().slice(0, 240)]
            : [];
          if (fallbackQuery.length) {
            const results = await Promise.all([
              retrieveByKind("notes", fallbackQuery),
              retrieveByKind("knowledge", fallbackQuery),
              retrieveByKind("rubrics", fallbackQuery),
              retrieveByKind("examples", fallbackQuery),
            ]);
            notes = results.flat();
          } else {
            notes = [];
          }
          bumpNotesProgress();
        }
      } catch (err) {
        notesError = err instanceof Error ? err.message : String(err);
        notesErrorStage = "retrieve";
      }
    }
    const notesElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
    const slowHint =
      sourceCount > 200 ? "文件较多，建议精简 inputs 目录" : undefined;
    const notesMessage = notesError
      ? `${notesErrorStage === "load" ? "笔记加载失败" : "向量检索失败"}：${notesError}`
      : `${retrievalLabel}检索 100%：${sourceCount}份 · ${corpus.length}段 · 命中 ${notes.length} 条 · ${notesElapsedSec}s${
          slowHint ? `，${slowHint}` : ""
        }`;
    reportProgress("notes", 100, notesMessage, notesError ? "error" : "success");
  }
  deps.onPartial?.({ notes });
  ensureNotAborted();
  const topicCfg = deps.skillConfig.topics ?? {};
  const maxTitleLen = Number(topicCfg.max_title_len ?? 18);
  const titleModeRaw = String(topicCfg.title_mode ?? topicCfg.titleMode ?? "llm");
  const titleMode = titleModeRaw === "simple" ? "simple" : "llm";
  let topicTitle = it_deriveTopicTitle(
    questionText,
    questionList,
    transcript,
    maxTitleLen,
  );
  if (titleMode === "llm") {
    const generatedTitle = await it_generateTopicTitleWithLlm(
      llmConfig,
      questionText,
      questionList,
      maxTitleLen,
    );
    if (generatedTitle) {
      topicTitle = generatedTitle;
    }
  }

  const topicDir = await it_resolveTopicDirAsync(
    deps.workspaceRoot,
    topicTitle,
    questionText,
    questionList,
    {
      sessionsDir: deps.skillConfig.sessions_dir || "sessions",
      allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
      maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
      similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
    },
  );

  const reportPath = await it_reportPathForTopicAsync(topicDir, topicTitle, {
    sessionsDir: deps.skillConfig.sessions_dir || "sessions",
    allowUnicode: deps.skillConfig.filenames?.allow_unicode ?? true,
    maxSlugLen: deps.skillConfig.filenames?.max_slug_len ?? 16,
    similarityThreshold: Number(deps.skillConfig.topics?.similarity_threshold ?? 0.72),
    centerSubdir: deps.skillConfig.topics?.center_subdir || "",
  });

  const attemptIndex = await it_nextAttemptIndexAsync(reportPath);
  const storedAudioPath = await it_storeRecordingAsync(
    topicDir,
    attemptIndex,
    request.audio,
  );

  const evaluationProfile = it_resolveTaskProfile(
    envConfig,
    deps.skillConfig,
    "evaluation",
  );
  const evaluationLlmConfig = it_getLlmConfig(envConfig, evaluationProfile || undefined);
  if (evaluationLlmConfig) {
    evaluationLlmConfig.maxOutputTokens = 0;
  }
  const evalProvider = evaluationLlmConfig?.provider || envConfig.llm?.provider || "heuristic";
  const evalIsDoubao = evalProvider === "volc_doubao";
  const evalDefaultBase = evalIsDoubao
    ? "https://ark.cn-beijing.volces.com"
    : "https://qianfan.baidubce.com/v2";
  const evalDefaultModel = evalIsDoubao
    ? "doubao-seed-1-8-251228"
    : "ernie-4.5-turbo-128k";
  const evaluationConfig = {
    provider: evalProvider,
    model: evaluationLlmConfig?.model || envConfig.llm?.model || evalDefaultModel,
    baseUrl: evaluationLlmConfig?.baseUrl || envConfig.llm?.base_url || evalDefaultBase,
    apiKey: evaluationLlmConfig?.apiKey || envConfig.llm?.api_key || "",
    temperature: Number(evaluationLlmConfig?.temperature ?? envConfig.llm?.temperature ?? 0.8),
    topP: Number(evaluationLlmConfig?.topP ?? envConfig.llm?.top_p ?? 0.8),
    timeoutSec: Number(evaluationLlmConfig?.timeoutSec ?? envConfig.llm?.timeout_sec ?? 60),
    maxRetries: Math.max(
      5,
      Number(evaluationLlmConfig?.maxRetries ?? envConfig.llm?.max_retries ?? 1),
    ),
    antiRepeat: Boolean(
      evaluationLlmConfig?.antiRepeat ??
        envConfig.llm?.anti_repeat ??
        envConfig.llm?.antiRepeat ??
        false,
    ),
    useResponses: Boolean(
      evaluationLlmConfig?.useResponses ??
        envConfig.llm?.use_responses ??
        envConfig.llm?.useResponses ??
        (evalIsDoubao ? true : false),
    ),
    webSearch: Boolean(
      evaluationLlmConfig?.webSearch ??
        envConfig.llm?.web_search ??
        envConfig.llm?.webSearch ??
        (evalIsDoubao ? true : false),
    ),
    reasoningEffort:
      evaluationLlmConfig?.reasoningEffort ??
      envConfig.llm?.reasoning_effort ??
      envConfig.llm?.reasoningEffort ??
      (evalIsDoubao ? "medium" : undefined),
    maxOutputTokens: 0,
    reusePrefix: Boolean(
      evaluationLlmConfig?.reusePrefix ??
        envConfig.llm?.reuse_prefix ??
        envConfig.llm?.reusePrefix ??
        (evalIsDoubao ? true : false),
    ),
    language: deps.skillConfig.evaluation?.language || "zh-CN",
    dimensions: deps.skillConfig.evaluation?.dimensions ?? [],
    answerMode:
      deps.skillConfig.evaluation?.answer_mode ??
      deps.skillConfig.evaluation?.answerMode ??
      "two-step",
  };

  const evalUsesApi = Boolean(
    evaluationLlmConfig?.provider &&
      evaluationLlmConfig?.provider !== "heuristic" &&
      evaluationLlmConfig?.apiKey,
  );
  const evalLabel = evalUsesApi ? "API" : "LLM不可用";
  const evalModeLabel = evaluationConfig.answerMode === "two-step" ? "两步法" : "单次";
  reportProgress(
    "evaluation",
    5,
    `面试评价 5% · 准备 · ${evalLabel} · ${evalModeLabel}`,
    "running",
  );

  const timePlan = [4, 3, 3];
  const evalQuestions = questionList.length
    ? questionList
    : questionText
      ? [questionText]
      : [topicTitle];
  const evalAnswers =
    questionAnswers && questionAnswers.length === evalQuestions.length
      ? questionAnswers
      : evalQuestions.map((question) => ({ question, answer: "" }));
  const evalNotes =
    notesByQuestion.length === evalQuestions.length
      ? notesByQuestion
      : evalQuestions.map(() => notes);
  const evalAcoustics = evalQuestions.map((_, idx) =>
    it_buildAcousticForTiming(
      questionTimings[idx],
      audioSegments,
      evalAnswers[idx]?.answer || "",
    ),
  );

  const totalQuestions = evalQuestions.length || 1;
  let completed = 0;
  const baseProgress = 15;
  const spanProgress = 75;
  reportProgress(
    "evaluation",
    baseProgress,
    `面试评价 ${baseProgress}% · 生成中 · ${evalLabel} · ${evalModeLabel}`,
    "running",
  );
  const evaluations = await Promise.all(
    evalQuestions.map((question, idx) =>
      (async () => {
        const result = await it_evaluateAnswer(
          question,
          evalAnswers[idx]?.answer || "",
          evalAcoustics[idx],
          evalNotes[idx] || [],
          evaluationConfig,
          [question],
          [{ question, answer: evalAnswers[idx]?.answer || "" }],
          questionText,
          evalQuestions,
          [
            request.systemPrompt?.trim(),
            request.perQuestionSystemPrompts?.[idx]?.trim(),
          ]
            .filter(Boolean)
            .join("\n\n") || undefined,
          [
            request.demoPrompt?.trim(),
            request.perQuestionDemoPrompts?.[idx]?.trim(),
          ]
            .filter(Boolean)
            .join("\n\n") || undefined,
        );
        completed += 1;
        const progress = Math.min(
          95,
          baseProgress + Math.round((spanProgress * completed) / totalQuestions),
        );
        reportProgress(
          "evaluation",
          progress,
          `面试评价 ${progress}% · ${evalLabel} · ${evalModeLabel} · 第${completed}/${totalQuestions}题`,
          "running",
        );
        return result;
      })(),
    ),
  );

  const evaluation: ItEvaluation = it_mergeEvaluations({
    topicTitle: questionText || topicTitle,
    questions: evalQuestions,
    answers: evalAnswers,
    evaluations,
    timePlan,
  });
  reportProgress("evaluation", 95, "面试评价 95% · 汇总", "running");
  reportProgress("evaluation", 100, `面试评价 100% · ${evalLabel}`, "success");
  deps.onPartial?.({ evaluation });
  ensureNotAborted();

  const response: ItAnalyzeResponse = {
    transcript,
    detailedTranscript,
    acoustic,
    evaluation,
    notes,
    audioSegments,
    questionTimings,
    questionTimingNote,
    questionText,
    questionList,
    reportPath,
    topicDir,
    audioPath: storedAudioPath,
  };

  await it_persistAnalysis({
    questionText,
    questionList,
    topicTitle,
    topicDir,
    reportPath,
    attemptIndex,
    response,
    reportProgress,
  });

  return response;
}
