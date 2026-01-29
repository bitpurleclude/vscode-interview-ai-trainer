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
import { ItApiConfig } from "../api/it_apiConfig";
import { it_callLlmChat, ItLlmConfig } from "../api/it_llm";
import { it_evaluateAnswer } from "./it_evaluation";
import { it_buildCorpusAsync, it_retrieveNotesMulti } from "./it_notes";
import {
  it_appendAttemptDataAsync,
  it_nextAttemptIndexAsync,
  it_readTopicMetaAsync,
  it_reportPathForTopicAsync,
  it_resolveTopicDirAsync,
  it_writeTopicMetaAsync,
} from "../storage/it_sessions";
import {
  it_summarizeAudioMetrics,
  it_decodePcm16,
  it_buildDetailedTranscript,
} from "../utils/it_audio";
import { it_formatSeconds, it_hashText, it_normalizeText } from "../utils/it_text";
import { it_pcm16ToWavBuffer } from "../utils/it_wav";
import { it_appendReportAsync } from "./it_report";

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

function it_getLlmConfig(envConfig: any): ItLlmConfig | null {
  const llm = envConfig?.llm ?? {};
  if (!llm.provider || !llm.api_key) {
    return null;
  }
  const defaultBase =
    llm.provider === "volc_doubao"
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
  const resolvedRetries = Math.max(5, Number(llm.max_retries ?? 1));
  return {
    provider: llm.provider,
    apiKey: llm.api_key || "",
    baseUrl: llm.base_url || defaultBase,
    model:
      llm.model ||
      (llm.provider === "volc_doubao"
        ? "doubao-1-5-pro-32k-250115"
        : "ernie-4.5-turbo-128k"),
    temperature: Number(llm.temperature ?? 0.2),
    topP: Number(llm.top_p ?? 0.8),
    timeoutSec: Number(llm.timeout_sec ?? 60),
    maxRetries: resolvedRetries,
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
  llmConfig: ItLlmConfig,
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
    const content = await it_callLlmChat(llmConfig, [
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

async function it_splitAnswersWithLlm(
  llmConfig: ItLlmConfig,
  questions: string[],
  transcript: string,
): Promise<Array<{ question: string; answer: string }> | null> {
  if (!questions.length || !transcript.trim()) {
    return null;
  }

  const systemPrompt =
    "你是中文面试逐题拆分助手。请把考生完整回答按题目顺序拆分为逐题答案，仅输出 JSON。";
  const userPrompt = [
    "题目列表:",
    questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n"),
    "",
    "考生完整转写:",
    transcript.trim(),
    "",
    "输出要求:",
    "1) 仅输出 JSON: {answers:[\"题1回答\",\"题2回答\",...]}。",
    "2) answers 数组长度必须等于题目数，顺序一致。",
    "3) 不要输出多余文字或解释。",
  ].join("\n");

  try {
    const content = await it_callLlmChat(llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);
    const parsed = it_extractJson(content);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    if (answers.length !== questions.length) {
      return null;
    }
    return answers.map((item: any, idx: number) => ({
      question: questions[idx],
      answer: typeof item === "string" ? item.trim() : String(item?.answer ?? item ?? "").trim(),
    }));
  } catch {
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
  if (startPos === -1) {
    const prefix = normalizedTarget.slice(0, Math.min(32, normalizedTarget.length));
    const suffix = normalizedTarget.slice(-Math.min(32, normalizedTarget.length));
    const prefixPos = prefix ? joined.indexOf(prefix) : -1;
    const suffixPos = suffix ? joined.lastIndexOf(suffix) : -1;
    if (prefixPos === -1 && suffixPos === -1) {
      return null;
    }
    if (prefixPos !== -1 && suffixPos !== -1 && suffixPos >= prefixPos) {
      startPos = prefixPos;
      matchLen = suffixPos - prefixPos + suffix.length;
    } else if (prefixPos !== -1) {
      startPos = prefixPos;
      matchLen = prefix.length;
    } else {
      startPos = Math.max(0, suffixPos);
      matchLen = suffix.length;
    }
  }

  return locateRange(startPos, matchLen);
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
      answer: texts.join(""),
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
      original: answers[idx]?.answer || "",
      revised: revised?.revised || "",
      estimatedTimeMin: planned,
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
  const cleaned = (text || "").replace(/[^0-9A-Za-z\u4e00-\u9fff]+/g, "");
  if (!cleaned) {
    return [];
  }
  const hasChinese = /[\u4e00-\u9fff]/.test(cleaned);
  const tokens: string[] = [];
  if (hasChinese) {
    for (let i = 0; i < cleaned.length - 1; i += 1) {
      tokens.push(cleaned.slice(i, i + 2));
    }
  } else {
    tokens.push(
      ...cleaned
        .toLowerCase()
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
  let transcript = "";
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
  const normalized = it_normalizeText(questionText || topicTitle);
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
  const llmConfig = it_getLlmConfig(envConfig);
  const questionText = request.questionText?.trim() || "";
  const questionList = (request.questionList ?? []).filter((q) => q.trim());
  if (!questionText && !questionList.length) {
    throw new Error("请先填写题干或导入题干文件。");
  }

  const asrCfg = envConfig.asr ?? {};
  const transcript = await it_transcribeAudio(request, asrCfg, reportProgress);

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
  let llmTimingAttempted = false;
  let llmTimingFailed = false;
  if (questionList.length > 1) {
    if (audioSegments && llmConfig) {
      llmTimingAttempted = true;
      const splitAnswers = await it_splitAnswersWithLlm(
        llmConfig,
        questionList,
        transcript,
      );
      if (splitAnswers) {
        questionAnswers = splitAnswers;
        const alignedTimings: ItQuestionTiming[] = [];
        for (let idx = 0; idx < splitAnswers.length; idx += 1) {
          const aligned = it_alignAnswerToSegments(
            splitAnswers[idx].answer,
            audioSegments,
          );
          if (!aligned) {
            alignedTimings.length = 0;
            break;
          }
          alignedTimings.push({
            question: splitAnswers[idx].question,
            startSec: aligned.startSec,
            endSec: aligned.endSec,
            durationSec: Math.max(0, aligned.endSec - aligned.startSec),
            note: "LLM逐题对齐",
          });
        }
        if (alignedTimings.length === questionList.length) {
          questionTimings = alignedTimings;
        }
      }
      if (!questionTimings.length) {
        const assigned = await it_assignSegmentsWithLlm(
          llmConfig,
          questionList,
          audioSegments,
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
    }
  } else if (questionList.length === 1 && !questionAnswers) {
    questionAnswers = [{ question: questionList[0], answer: transcript }];
  }
  if (!questionTimings.length && questionList.length) {
    questionTimings = questionList.map((q) => ({
      question: q,
      startSec: 0,
      endSec: 0,
      durationSec: 0,
      note: "LLM时间计算失败",
    }));
  }
  if (!questionAnswers && questionList.length) {
    questionAnswers = questionList.map((q) => ({
      question: q,
      answer: "",
    }));
  }

  let notes: ItAnalyzeResponse["notes"] = [];
  let notesByQuestion: ItNoteHit[][] = [];
  const retrievalEnabled = deps.skillConfig.retrieval?.enabled !== false;
  if (!retrievalEnabled) {
    reportProgress("notes", 100, "笔记检索 已关闭 · 本地", "success");
  } else {
    const workspaceCfg = deps.skillConfig.workspace ?? {};
    const notesStart = Date.now();
    const retrievalMode = String(deps.skillConfig.retrieval?.mode || "vector");
    const retrievalLabel = retrievalMode === "keyword" ? "词面" : "向量";
    reportProgress(
      "notes",
      10,
      `${retrievalLabel}检索/文件扫描中 · 本地`,
      "running",
    );
    const corpus = await it_buildCorpusAsync({
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
    const scanElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
    const sourceCount = new Set(corpus.map((item) => item.source)).size;
    reportProgress(
      "notes",
      60,
      `笔记加载：${sourceCount}份 · ${corpus.length}段 · ${scanElapsedSec}s · 本地`,
      "running",
    );
    const retrievalCfg = deps.skillConfig.retrieval ?? {};
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
    const notesMinScore = Number(retrievalCfg.min_score ?? 0.2);
    const cacheRoot = deps.context.globalStorageUri?.fsPath;
    const notesCacheDir = cacheRoot
      ? path.join(cacheRoot, "embedding_cache", it_hashText(deps.workspaceRoot))
      : undefined;
    let retrievalAnswers = questionAnswers;
    if (
      (!retrievalAnswers || retrievalAnswers.length !== questionList.length) &&
      audioSegments &&
      questionTimings.length
    ) {
      retrievalAnswers = it_collectAnswersFromSegments(questionTimings, audioSegments);
    }
    let notesError: string | undefined;
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
      if (questionsForNotes.length) {
        const noteTasks = questionsForNotes.map((question, idx) => {
          const answer = resolvedAnswers[idx]?.answer || "";
          const queries = it_buildRetrievalQueries({
            questionText: question,
            questionList: [question],
            transcript: answer || transcript,
            answers: answer ? [{ question, answer }] : undefined,
          });
          const queryList = queries.length ? queries : [question];
          return it_retrieveNotesMulti(queryList, corpus, {
            mode: retrievalMode === "keyword" ? "keyword" : "vector",
            topK: notesTopK,
            minScore: notesMinScore,
            cacheDir: notesCacheDir,
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
        });
        notesByQuestion = await Promise.all(noteTasks);
        notes = it_mergeNoteHits(notesByQuestion, notesTopK);
      } else {
        const fallbackQuery = transcript.trim()
          ? [transcript.trim().slice(0, 240)]
          : [];
        notes = fallbackQuery.length
          ? await it_retrieveNotesMulti(fallbackQuery, corpus, {
              mode: retrievalMode === "keyword" ? "keyword" : "vector",
              topK: notesTopK,
              minScore: notesMinScore,
              cacheDir: notesCacheDir,
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
            })
          : [];
      }
    } catch (err) {
      notesError = err instanceof Error ? err.message : String(err);
    }
    const notesElapsedSec = ((Date.now() - notesStart) / 1000).toFixed(1);
    const slowHint =
      sourceCount > 200 ? "文件较多，建议精简 inputs 目录" : undefined;
    const notesMessage = notesError
      ? `向量检索失败：${notesError}`
      : `${retrievalLabel}检索/扫描 ${sourceCount} 份，过滤 ${corpus.length} 段，命中 ${notes.length} 条 · ${notesElapsedSec}s · 本地${
          slowHint ? `，${slowHint}` : ""
        }`;
    reportProgress("notes", 100, notesMessage, notesError ? "error" : "success");
  }
  const topicTitle = it_deriveTopicTitle(
    questionText,
    questionList,
    transcript,
    Number(deps.skillConfig.topics?.max_title_len ?? 32),
  );

  const topicDir = await it_resolveTopicDirAsync(
    deps.workspaceRoot,
    topicTitle,
    questionText,
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

  const evalProvider = envConfig.llm?.provider || "heuristic";
  const evalDefaultBase =
    evalProvider === "volc_doubao"
      ? "https://ark.cn-beijing.volces.com"
      : "https://qianfan.baidubce.com/v2";
  const evalDefaultModel =
    evalProvider === "volc_doubao"
      ? "doubao-1-5-pro-32k-250115"
      : "ernie-4.5-turbo-128k";
  const evaluationConfig = {
    provider: evalProvider,
    model: envConfig.llm?.model || evalDefaultModel,
    baseUrl: envConfig.llm?.base_url || evalDefaultBase,
    apiKey: envConfig.llm?.api_key || "",
    temperature: Number(envConfig.llm?.temperature ?? 0.8),
    topP: Number(envConfig.llm?.top_p ?? 0.8),
    timeoutSec: Number(envConfig.llm?.timeout_sec ?? 60),
    maxRetries: Math.max(5, Number(envConfig.llm?.max_retries ?? 1)),
    language: deps.skillConfig.evaluation?.language || "zh-CN",
    dimensions: deps.skillConfig.evaluation?.dimensions ?? [],
  };

  const evalUsesApi = Boolean(
    envConfig.llm?.provider && envConfig.llm?.provider !== "heuristic" && envConfig.llm?.api_key,
  );
  const evalLabel = evalUsesApi ? "API" : "LLM不可用";
  reportProgress("evaluation", 10, `面试评价 10% · ${evalLabel}`, "running");

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

  const evaluations = await Promise.all(
    evalQuestions.map((question, idx) =>
      it_evaluateAnswer(
        question,
        evalAnswers[idx]?.answer || "",
        evalAcoustics[idx],
        evalNotes[idx] || [],
        evaluationConfig,
        [question],
        [{ question, answer: evalAnswers[idx]?.answer || "" }],
        questionText,
        evalQuestions,
        request.systemPrompt,
        request.demoPrompt,
      ),
    ),
  );

  const evaluation: ItEvaluation = it_mergeEvaluations({
    topicTitle: questionText || topicTitle,
    questions: evalQuestions,
    answers: evalAnswers,
    evaluations,
    timePlan,
  });
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
