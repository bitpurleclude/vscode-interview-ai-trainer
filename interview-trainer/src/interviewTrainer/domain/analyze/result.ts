import type {
  ItAnalyzeResponse,
  ItEvaluation,
  ItNoteHit,
  ItStepStatus,
  ItWorkflowStep,
} from "../../../protocol/interviewTrainer";
import { it_requestLlmChat } from "../../infra/clients/llmClient";
import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import {
  it_appendAttemptDataAsync,
  it_buildQuestionFingerprint,
  it_readTopicMetaAsync,
  it_writeTopicMetaAsync,
} from "../../infra/storage/it_sessions";
import { it_appendReportAsync, it_updateReferenceNotesFileAsync } from "../../infra/storage/it_report";
import { it_hashText, it_normalizeText } from "../../infra/utils/it_text";
import { it_extractJson } from "./shared";

export function it_sanitizeTopicTitle(raw: string, maxLen: number): string {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[\p{P}\p{S}]/gu, "");
  const base = cleaned || String(raw || "").trim();
  if (!base) {
    return "未命名";
  }
  return base.slice(0, Math.max(1, maxLen));
}

export async function it_generateTopicTitleWithLlm(
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
    const content = await it_requestLlmChat(
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

export function it_deriveTopicTitle(
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

export function it_mergeNoteHitsAll(lists: ItNoteHit[][]): ItNoteHit[] {
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

export function it_buildRetrievalQueries(params: {
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

export async function it_persistAnalysis(params: {
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
