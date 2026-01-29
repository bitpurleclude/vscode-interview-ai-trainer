import {
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
} from "../../protocol/interviewTrainer";
import { it_callLlmChat, ItLlmConfig } from "../api/it_llm";

export interface ItEvaluationConfig extends ItLlmConfig {
  provider: "baidu_qianfan" | "heuristic" | "volc_doubao";
  language: string;
  dimensions: string[];
}

const IT_DIMENSION_MAP: Record<string, string> = {
  content_structure: "内容完整性",
  logic_coherence: "逻辑清晰度",
  clarity_concision: "语言流畅度",
  etiquette_expression: "表达感染力",
  professionalism: "专业素养",
  policy_alignment: "政策理解",
};

const IT_DEFAULT_DIMENSIONS = [
  "内容完整性",
  "逻辑清晰度",
  "语言流畅度",
  "表达感染力",
  "专业素养",
  "政策理解",
];

function it_normalizeDimensions(dimensions: string[] | undefined): string[] {
  if (!Array.isArray(dimensions) || !dimensions.length) {
    return [...IT_DEFAULT_DIMENSIONS];
  }
  const mapped = dimensions.map((dim) => IT_DIMENSION_MAP[dim] || dim).filter(Boolean);
  const uniq = Array.from(new Set(mapped));
  return uniq.length ? uniq : [...IT_DEFAULT_DIMENSIONS];
}

function it_buildSummary(acoustic: ItAcousticMetrics): string {
  return [
    `duration_sec: ${acoustic.durationSec}`,
    `speech_duration_sec: ${acoustic.speechDurationSec}`,
    `speech_rate_wpm: ${acoustic.speechRateWpm ?? "-"}`,
    `pause_count: ${acoustic.pauseCount}`,
    `pause_avg_sec: ${acoustic.pauseAvgSec}`,
    `pause_max_sec: ${acoustic.pauseMaxSec}`,
    `rms_db_mean: ${acoustic.rmsDbMean}`,
    `rms_db_std: ${acoustic.rmsDbStd}`,
    `snr_db: ${acoustic.snrDb ?? "-"}`,
  ].join("\n");
}

function it_mapScoreKeys(scores: Record<string, number>): Record<string, number> {
  const mapped: Record<string, number> = {};
  Object.entries(scores || {}).forEach(([key, value]) => {
    const name = IT_DIMENSION_MAP[key] || key;
    const num = typeof value === "number" ? value : Number(value);
    if (!Number.isFinite(num)) {
      return;
    }
    mapped[name] = num;
  });
  return mapped;
}

function it_computeOverallScore(
  scores: Record<string, number>,
  dimensions: string[],
): number {
  const values = dimensions.map((dim) => scores[dim]).filter((v) => v !== undefined);
  if (!values.length) {
    return 0;
  }
  return Math.round(values.reduce((sum, v) => sum + v, 0) / values.length);
}

function it_toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function it_pickRevisedAnswers(payload: any): any[] {
  if (!payload) {
    return [];
  }
  if (Array.isArray(payload)) {
    return payload;
  }
  const candidates = [
    payload.revisedAnswers,
    payload.revised_answers,
    payload.revisedAnswer,
    payload.revised_answer,
  ];
  for (const item of candidates) {
    if (Array.isArray(item)) {
      return item;
    }
  }
  return [];
}

function it_extractJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  const fencedMatches = Array.from(
    text.matchAll(/```(?:json)?\s*([\s\S]*?)\s*```/gi),
  );
  fencedMatches.forEach((match) => {
    if (match[1]) {
      candidates.push(match[1]);
    }
  });
  const blocks: string[] = [];
  const stack: string[] = [];
  let start = -1;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "{" || ch === "[") {
      if (stack.length === 0) {
        start = i;
      }
      stack.push(ch);
      continue;
    }
    if (ch === "}" || ch === "]") {
      const last = stack[stack.length - 1];
      if (
        (ch === "}" && last === "{") ||
        (ch === "]" && last === "[")
      ) {
        stack.pop();
        if (stack.length === 0 && start !== -1) {
          blocks.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  blocks.forEach((block) => candidates.push(block));
  return candidates;
}

function it_sanitizeJsonCandidate(candidate: string): string {
  let result = "";
  let inString = false;
  let escaped = false;
  for (let i = 0; i < candidate.length; i += 1) {
    const ch = candidate[i];
    if (!inString) {
      if (ch === "\"") {
        inString = true;
        result += ch;
        continue;
      }
      if (ch === "\r") {
        continue;
      }
      result += ch;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === "\"") {
      inString = false;
      result += ch;
      continue;
    }
    if (ch === "\n") {
      result += "\\n";
      continue;
    }
    if (ch === "\r") {
      continue;
    }
    if (ch === "\t") {
      result += "\\t";
      continue;
    }
    result += ch;
  }
  return result;
}

function it_extractJsonPayload(text: string): any | null {
  if (!text) {
    return null;
  }
  const candidates = it_extractJsonCandidates(text);
  let fallback: any | null = null;
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") {
        if (it_pickRevisedAnswers(parsed).length) {
          return parsed;
        }
        if (!fallback) {
          fallback = parsed;
        }
      }
    } catch {
      try {
        const parsed = JSON.parse(it_sanitizeJsonCandidate(candidate));
        if (parsed && typeof parsed === "object") {
          if (it_pickRevisedAnswers(parsed).length) {
            return parsed;
          }
          if (!fallback) {
            fallback = parsed;
          }
        }
      } catch {
        continue;
      }
    }
  }
  return fallback;
}

function it_isPlainObject(value: any): value is Record<string, any> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function it_extractScoreData(parsed: any): {
  scores: Record<string, number>;
  overall?: number;
} {
  const scoreCandidates = [
    parsed?.scores,
    parsed?.dimensions,
    parsed?.各维度评分,
    parsed?.维度评分,
    parsed?.维度Scores,
    parsed?.维度,
    parsed?.评分?.维度,
    parsed?.评分?.维度评分,
    parsed?.评分?.维度分,
  ];
  let scoreBlock: Record<string, number> = {};
  for (const candidate of scoreCandidates) {
    if (it_isPlainObject(candidate)) {
      scoreBlock = candidate as Record<string, number>;
      break;
    }
  }
  const mappedScores = it_mapScoreKeys(scoreBlock);
  const values = Object.values(mappedScores).filter((v) => Number.isFinite(v));
  const averaged =
    values.length > 0
      ? Math.round(values.reduce((sum, v) => sum + v, 0) / values.length)
      : undefined;
  const overallRaw =
    parsed?.overallScore ??
    parsed?.overall ??
    parsed?.整体评分 ??
    parsed?.总分 ??
    parsed?.评分?.整体 ??
    parsed?.评分?.总分 ??
    parsed?.评分?.overall ??
    (typeof parsed?.评分 === "number" ? parsed.评分 : undefined);
  const overallFallback = Number.isFinite(Number(overallRaw))
    ? Number(overallRaw)
    : undefined;
  return {
    scores: mappedScores,
    overall: values.length ? averaged : overallFallback,
  };
}

function it_parseQuestionIndex(marker: string): number | null {
  const match = marker.match(/第\s*([一二三四五六七八九十0-9]+)\s*[题问]/);
  if (!match) {
    return null;
  }
  const raw = match[1];
  if (/^\d+$/.test(raw)) {
    const idx = Number(raw);
    return Number.isFinite(idx) ? idx - 1 : null;
  }
  const map: Record<string, number> = {
    一: 1,
    二: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
    十: 10,
  };
  if (raw.length === 1 && map[raw] !== undefined) {
    return map[raw] - 1;
  }
  if (raw.length === 2 && raw.startsWith("十")) {
    const tail = raw[1];
    const base = map[tail] ?? 0;
    return 10 + base - 1;
  }
  return null;
}

function it_splitTranscriptByQuestions(
  questionList: string[],
  transcript: string,
): Array<{ question: string; answer: string }> {
  const items = questionList.map((question) => ({
    question,
    answer: "",
  }));
  if (!questionList.length) {
    return items;
  }
  const matches = Array.from(
    transcript.matchAll(/第\s*[一二三四五六七八九十0-9]+\s*[题问]/g),
  );
  const boundaries: Array<{ index: number; pos: number }> = [];
  matches.forEach((match) => {
    const idx = it_parseQuestionIndex(match[0]);
    if (idx !== null && idx >= 0 && idx < questionList.length && match.index !== undefined) {
      boundaries.push({ index: idx, pos: match.index });
    }
  });
  const unique = new Map<number, number>();
  boundaries.forEach((item) => {
    if (!unique.has(item.index)) {
      unique.set(item.index, item.pos);
    }
  });
  const ordered = Array.from(unique.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([index, pos]) => ({ index, pos }));
  if (ordered.length) {
    const positions = [0, ...ordered.map((item) => item.pos), transcript.length];
    const indices = [0, ...ordered.map((item) => item.index), questionList.length];
    for (let i = 0; i < indices.length - 1; i += 1) {
      const start = positions[i];
      const end = positions[i + 1];
      const answer = transcript.slice(start, end).replace(/第\s*[一二三四五六七八九十0-9]+\s*[题问]/, "").trim();
      const targetIndex = indices[i];
      if (items[targetIndex]) {
        items[targetIndex].answer = answer;
      }
    }
    return items;
  }
  const totalLen = transcript.length;
  const base = Math.max(1, Math.floor(totalLen / questionList.length));
  for (let i = 0; i < questionList.length; i += 1) {
    const start = i * base;
    const end = i === questionList.length - 1 ? totalLen : (i + 1) * base;
    items[i].answer = transcript.slice(start, end).trim();
  }
  return items;
}

function it_buildUnavailableEvaluation(params: {
  question: string;
  reason: string;
  dimensions: string[];
  notes: ItNoteHit[];
  promptText?: string;
  raw?: string;
}): ItEvaluation {
  const scores: Record<string, number> = {};
  const noteUsage = params.notes.length
    ? params.notes.slice(0, 3).map((note) => `${note.source} :: ${note.snippet}`)
    : [];
  const noteSuggestions = params.notes.length
    ? params.notes.slice(0, 3).map((note) => `可参考 ${note.snippet}`)
    : [];
  return {
    topicTitle: params.question || "未命名",
    topicSummary: params.reason,
    scores,
    overallScore: 0,
    strengths: [],
    issues: [params.reason],
    improvements: [],
    nextFocus: [],
    noteUsage,
    noteSuggestions,
    revisedAnswers: [],
    mode: "heuristic",
    raw: params.raw,
    prompt: params.promptText,
  };
}

export async function it_evaluateAnswer(
  question: string,
  transcript: string,
  acoustic: ItAcousticMetrics,
  notes: ItNoteHit[],
  config: ItEvaluationConfig,
  questionList: string[],
  questionAnswers?: Array<{ question: string; answer: string }>,
  materialText?: string,
  contextQuestions?: string[],
  customSystemPrompt?: string,
  customDemoPrompt?: string,
): Promise<ItEvaluation> {
  const lowSpeech =
    (acoustic.speechDurationSec ?? 0) < 2 || transcript.trim().length < 10;
  const dimensions = it_normalizeDimensions(config.dimensions);
  const questions = questionList.length ? questionList : question ? [question] : [];
  const timePlan = [4, 3, 3];
  const resolvedAnswers =
    questionAnswers && questionAnswers.length
      ? questionAnswers
      : it_splitTranscriptByQuestions(questions, transcript);

  if (lowSpeech) {
    return it_buildUnavailableEvaluation({
      question: question || "无有效回答",
      reason: "未检测到有效语音内容，请确保麦克风输入正常并重新作答。",
      dimensions,
      notes,
      raw: "no_speech_detected",
    });
  }

  const systemPrompt =
    customSystemPrompt?.trim() ||
    [
      "你是严格、直接的中文面试评审，仅输出 JSON，不要出现英语标签、客套或安慰语。",
      "评分规则（1-10，整数）：10=卓越/完整无明显缺陷；8=良好仅有轻微问题；6=基本达标但有明显缺口；4=不达标；2=严重不足/几乎无有效内容；1=违禁或完全失败。",
      "若语音时长极短、长时间静音或回答缺失，整体与各维度不得高于2，并在 issues 中说明原因。",
      "若未覆盖题干要点、逻辑混乱或无可执行对策，相关维度不高于4。",
      "严禁使用“继续加油”等安慰式措辞，问题描述必须直白、具体、可执行。",
      "strengths/issues/improvements 至少各3条；nextFocus 至少2条。",
      "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin。",
      "如提供检索笔记，必须在 noteUsage/noteSuggestions 中列出可用素材与可参考思路（至少2条），格式: source :: 用法/思路。",
    ].join("\n");
  const demoPrompt = customDemoPrompt?.trim();
  const material = materialText?.trim() || "";
  const backgroundQuestions =
    contextQuestions && contextQuestions.length ? contextQuestions : [];
  const userPromptParts = [
    material ? `材料:\n${material}` : "材料: 无",
    backgroundQuestions.length
      ? `背景题目列表(仅供参考):\n${backgroundQuestions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "背景题目列表(仅供参考): 无",
    `本题题干:\n${question || "未提供"}`,
    `本题回答:\n${transcript || "未提供"}`,
    `声学摘要:\n${it_buildSummary(acoustic)}`,
    notes.length
      ? `检索笔记:\n${notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\n")}`
      : "检索笔记: 无",
    `评分维度(每项1-10分): ${dimensions.join("。")}`,
    "评分输出字段必须使用 overallScore 与 scores（维度->分数），禁止使用“评分/维度评分/维度Scores”等变体。",
    questions.length
      ? `本次评审题目列表:\n${questions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "本次评审题目列表: 无",
    questions.length
      ? `本次评审回答:\n${resolvedAnswers
          .map((item, idx) => `${idx + 1}. ${item.answer || "（空）"}`)
          .join("\n")}`
      : "本次评审回答: 无",
    "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin。",
  ];

  if (demoPrompt) {
    userPromptParts.push(demoPrompt);
  }

  const userPrompt = userPromptParts.join("\n\n");
  const promptText = `System:\n${systemPrompt}\n\nUser:\n${userPrompt}`;

  if (!config.apiKey || config.provider === "heuristic") {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 未配置或不可用，无法生成评分与示范。",
      dimensions,
      notes,
      promptText,
    });
  }

  const resolvedRetries = Math.max(5, Number(config.maxRetries ?? 0));
  const formatGuard =
    "上次输出未通过 JSON 校验。请仅输出合法 JSON 对象，不要代码块或多余文本。";
  const parseAttempts = 2;
  let content = "";
  let parsed: any | null = null;
  let parsedRevised: any[] = [];
  let lastError: string | undefined;
  let finalPromptText = promptText;

  for (let attempt = 0; attempt < parseAttempts; attempt += 1) {
    const attemptPrompt =
      attempt === 0 ? userPrompt : `${userPrompt}\n\n${formatGuard}`;
    finalPromptText = `System:\n${systemPrompt}\n\nUser:\n${attemptPrompt}`;
    try {
      content = await it_callLlmChat(
        {
          provider: config.provider,
          apiKey: config.apiKey,
          baseUrl: config.baseUrl,
          model: config.model,
          temperature: config.temperature,
          topP: config.topP,
          timeoutSec: config.timeoutSec,
          maxRetries: resolvedRetries,
        },
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: attemptPrompt },
        ],
      );
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      continue;
    }
    parsed = it_extractJsonPayload(content);
    if (parsed) {
      parsedRevised = it_pickRevisedAnswers(parsed);
      if (parsedRevised.length) {
        break;
      }
    }
  }

  if (!parsed) {
    return it_buildUnavailableEvaluation({
      question,
      reason: lastError
        ? "LLM 调用失败，无法生成评分与示范。"
        : "LLM 输出解析失败，无法生成评分与示范。",
      dimensions,
      notes,
      raw: lastError || content,
      promptText: finalPromptText,
    });
  }
  if (!parsedRevised.length) {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 输出缺少 revisedAnswers，无法生成评分与示范。",
      dimensions,
      notes,
      raw: content,
      promptText: finalPromptText,
    });
  }

  try {
    const scoreData = it_extractScoreData(parsed);
    const mappedScores = scoreData.scores;
    const overallScore =
      Number.isFinite(scoreData.overall)
        ? (scoreData.overall as number)
        : it_computeOverallScore(mappedScores, dimensions);
    const parsedImprovements = it_toStringArray(parsed.improvements);
    const parsedNoteUsage = it_toStringArray(
      parsed.noteUsage ?? parsed.note_usage ?? parsed.noteUse ?? parsed.note_use,
    );
    const parsedNoteSuggestions = it_toStringArray(
      parsed.noteSuggestions ??
        parsed.note_suggestions ??
        parsed.noteSuggestion ??
        parsed.note_suggestion,
    );
    const fallbackNoteUsage =
      notes.length && !parsedNoteUsage.length
        ? notes.slice(0, 3).map((note) => `${note.source} :: ${note.snippet}`)
        : parsedNoteUsage;
    const fallbackNoteSuggestions =
      notes.length && !parsedNoteSuggestions.length
        ? notes.slice(0, 3).map((note) => `鍙互鍙傝€? ${note.snippet}`)
        : parsedNoteSuggestions;
    const revisedAnswers = parsedRevised.map((item: any, idx: number) => {
      const estimated =
        Number(item?.estimatedTimeMin ?? item?.estimated_time_min) ||
        timePlan[idx] ||
        3;
      return {
        question: String(item?.question || questions[idx] || `第${idx + 1}题`),
        original: String(item?.original || resolvedAnswers[idx]?.answer || ""),
        revised: String(item?.revised || ""),
        estimatedTimeMin: estimated,
      };
    });
    return {
      topicTitle: parsed.topicTitle || question || "未命名",
      topicSummary: parsed.topicSummary || "",
      scores: mappedScores,
      overallScore,
      strengths: it_toStringArray(parsed.strengths),
      issues: it_toStringArray(parsed.issues),
      improvements: parsedImprovements,
      nextFocus: it_toStringArray(parsed.nextFocus),
      noteUsage: fallbackNoteUsage,
      noteSuggestions: fallbackNoteSuggestions,
      revisedAnswers,
      mode: "llm",
      raw: content,
      prompt: finalPromptText,
    };
  } catch {
    return it_buildUnavailableEvaluation({
      question,
      reason: "LLM 输出解析失败，无法生成评分与示范。",
      dimensions,
      notes,
      raw: content,
      promptText: finalPromptText,
    });
  }
}
