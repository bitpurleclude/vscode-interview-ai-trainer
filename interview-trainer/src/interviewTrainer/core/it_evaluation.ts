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

function it_splitOutlineLines(text: string): string[] {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""))
    .filter((line) => line.trim().length > 0);
}

function it_outlineTreeFromPaths(paths: string[][]): Array<{ text: string; children: any[] }> {
  const roots: Array<{ text: string; children: any[] }> = [];
  const findOrCreate = (
    list: Array<{ text: string; children: any[] }>,
    text: string,
  ) => {
    const existing = list.find((node) => node.text === text);
    if (existing) {
      return existing;
    }
    const node = { text, children: [] as any[] };
    list.push(node);
    return node;
  };
  paths.forEach((parts) => {
    let current = roots;
    parts.forEach((part) => {
      const node = findOrCreate(current, part);
      current = node.children;
    });
  });
  return roots;
}

function it_outlineLinesFromTree(
  nodes: Array<{ text: string; children: any[] }>,
  level: number = 0,
): string[] {
  const indent = "  ".repeat(level);
  const lines: string[] = [];
  nodes.forEach((node) => {
    lines.push(`${indent}- ${node.text}`);
    if (node.children?.length) {
      lines.push(...it_outlineLinesFromTree(node.children, level + 1));
    }
  });
  return lines;
}

function it_pathsToOutlineLines(lines: string[]): string[] {
  const paths: string[][] = [];
  lines.forEach((line) => {
    if (!line.includes("->")) {
      return;
    }
    const parts = line
      .split("->")
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length) {
      paths.push(parts);
    }
  });
  if (!paths.length) {
    return lines;
  }
  const tree = it_outlineTreeFromPaths(paths);
  return it_outlineLinesFromTree(tree, 0);
}

function it_toOutlineArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    const rawLines = value.map((item) => String(item)).filter(Boolean);
    const hasArrow = rawLines.some((line) => line.includes("->"));
    if (hasArrow) {
      return it_pathsToOutlineLines(rawLines);
    }
    return rawLines.map((line) => line.replace(/\t/g, "  ").replace(/\s+$/g, ""));
  }
  if (typeof value === "string") {
    const raw = value.trim();
    if (!raw) {
      return [];
    }
    const lines = it_splitOutlineLines(raw);
    const hasArrow = lines.some((line) => line.includes("->"));
    if (hasArrow) {
      return it_pathsToOutlineLines(lines);
    }
    return lines;
  }
  return [];
}

function it_isOutlineKeywordLike(items?: string[]): boolean {
  if (!Array.isArray(items) || items.length < 4 || items.length > 24) {
    return false;
  }
  for (const item of items) {
    const raw = String(item || "");
    const trimmed = raw.trim();
    if (!trimmed) {
      return false;
    }
    if (/[。！？]/.test(trimmed)) {
      return false;
    }
    const cleaned = trimmed.replace(
      /^\s*(?:[-*+]\s+|\d+[.)]\s+|[一二三四五六七八九十]+、\s+|[（(]?[一二三四五六七八九十]+[）)]\s+)/,
      "",
    );
    if (!cleaned) {
      return false;
    }
    if (cleaned.length > 24) {
      return false;
    }
  }
  return true;
}

function it_outlineHasIndent(items?: string[]): boolean {
  if (!Array.isArray(items) || !items.length) {
    return false;
  }
  return items.some((line) => /^\s{2,}[-*+]/.test(String(line || "")));
}

function it_countParagraphs(text: string): number {
  return String(text || "")
    .trim()
    .split(/\r?\n\s*\n/)
    .map((part) => part.trim())
    .filter(Boolean).length;
}

function it_splitSentences(text: string): string[] {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return [];
  }
  const matches = trimmed.match(/[^。！？!?]+[。！？!?]?/g);
  if (!matches) {
    return [trimmed];
  }
  return matches.map((item) => item.trim()).filter(Boolean);
}

function it_insertParagraphsByKeywords(text: string): string {
  const keywords = [
    "首先",
    "其次",
    "再次",
    "然后",
    "此外",
    "同时",
    "再者",
    "最后",
    "总之",
    "综上",
    "因此",
    "因而",
    "其一",
    "其二",
    "其三",
    "一是",
    "二是",
    "三是",
    "四是",
    "五是",
  ];
  const pattern = new RegExp(`([。！？!?])\\s*(?=(${keywords.join("|")}))`, "g");
  return String(text || "").replace(pattern, "$1\n\n");
}

function it_ensureParagraphs(text: string): string {
  const raw = String(text || "").trim();
  if (!raw) {
    return "";
  }
  if (it_countParagraphs(raw) >= 3) {
    return raw;
  }
  let adjusted = it_insertParagraphsByKeywords(raw);
  if (it_countParagraphs(adjusted) >= 3) {
    return adjusted;
  }
  if (raw.includes("\n") && !/\n\s*\n/.test(raw)) {
    const doubled = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .join("\n\n");
    if (it_countParagraphs(doubled) >= 3) {
      return doubled;
    }
  }
  const sentences = it_splitSentences(raw);
  if (sentences.length >= 3) {
    const groupSize = Math.ceil(sentences.length / 3);
    const paragraphs: string[] = [];
    for (let i = 0; i < sentences.length; i += groupSize) {
      paragraphs.push(sentences.slice(i, i + groupSize).join(""));
    }
    return paragraphs.join("\n\n");
  }
  return raw;
}

async function it_generateOutlines(
  config: ItEvaluationConfig,
  items: Array<{ question: string; original: string; revised: string }>,
): Promise<Array<{ outlineOriginal?: string[]; outlineRevised?: string[] }> | null> {
  if (!items.length) {
    return null;
  }
  const systemPrompt = [
    "你是答题提纲生成器，只输出 JSON。",
    "每题输出 outlineOriginal/outlineRevised，为关键词式提纲（必须是 Markdown 列表文本字符串，不得输出数组）。",
    "必须包含多层结构（至少两级），只能使用 Markdown 列表缩进表示层级，且必须出现二级缩进（两个空格+ -），禁止使用箭头符号与平铺列表。",
    "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
    "每条<=20字，尽量用关键词短语，避免完整长句。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    "每题8-18条。",
  ].join("\n");
  const userPrompt = [
    "请根据以下题目与回答生成提纲：",
    items
      .map((item, idx) =>
        [
          `${idx + 1}. 题目: ${item.question}`,
          `原回答: ${item.original || "（空）"}`,
          `示范: ${item.revised || "（空）"}`,
        ].join("\n"),
      )
      .join("\n\n"),
    "",
    "输出 JSON 格式: { \"outlines\": [ { \"outlineOriginal\": \"Markdown列表...\", \"outlineRevised\": \"Markdown列表...\" } ] }，outlineOriginal/outlineRevised 必须是 Markdown 列表字符串（必须包含二级缩进，禁止使用箭头符号）。",
  ].join("\n");
  try {
    const content = await it_callLlmChat(
      {
        provider: config.provider,
        apiKey: config.apiKey,
        baseUrl: config.baseUrl,
        model: config.model,
        temperature: config.temperature,
        topP: config.topP,
        timeoutSec: config.timeoutSec,
        maxRetries: Math.max(0, Number(config.maxRetries ?? 1)),
      },
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
    );
    const parsed = it_extractJsonPayload(content);
    const outlineList = Array.isArray(parsed?.outlines)
      ? parsed.outlines
      : Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed?.items)
          ? parsed.items
          : [];
    if (!Array.isArray(outlineList) || !outlineList.length) {
      return null;
    }
    return outlineList.map((entry: any) => ({
      outlineOriginal: it_toOutlineArray(
        entry?.outlineOriginal ?? entry?.outline_original ?? entry?.outlineUser,
      ),
      outlineRevised: it_toOutlineArray(
        entry?.outlineRevised ?? entry?.outline_revised ?? entry?.outlineDemo,
      ),
    }));
  } catch {
    return null;
  }
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
      "revised 必须分段输出，至少3段，段落之间空一行，段落内容按步骤/要点展开。",
      "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
      "outlineOriginal/outlineRevised 必须为 Markdown 列表文本字符串（每题8-18条），分别对应本题“原回答提纲”与“示范提纲”。",
      "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级，至少两级，且必须出现二级缩进（两个空格+ -），禁止使用箭头符号与平铺列表。",
      "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
      "每条<=20字。",
      "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
      "如提供检索笔记，必须在 noteUsage/noteSuggestions 中列出可用素材与可参考思路（至少2条），格式: source :: 用法/思路。",
    ].join("\n");
  const demoPrompt = customDemoPrompt?.trim();
  const material = materialText?.trim() || "";
  const backgroundQuestions =
    contextQuestions && contextQuestions.length ? contextQuestions : [];
  const userPromptParts = [
    demoPrompt ? `示范补充要求:\n${demoPrompt}` : "示范补充要求: 无",
    material ? `材料:\n${material}` : "材料: 无",
    backgroundQuestions.length
      ? `背景题目列表(仅供参考):\n${backgroundQuestions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "背景题目列表(仅供参考): 无",
    questions.length
      ? `本次评审题目列表:\n${questions
          .map((q, idx) => `${idx + 1}. ${q}`)
          .join("\n")}`
      : "本次评审题目列表: 无",
    `本题题干:\n${question || "未提供"}`,
    `本题回答:\n${transcript || "未提供"}`,
    questions.length
      ? `本次评审回答:\n${resolvedAnswers
          .map((item, idx) => `${idx + 1}. ${item.answer || "（空）"}`)
          .join("\n")}`
      : "本次评审回答: 无",
    `声学摘要:\n${it_buildSummary(acoustic)}`,
    `评分维度(每项1-10分): ${dimensions.join("。")}`,
    "评分输出字段必须使用 overallScore 与 scores（维度:分数），禁止使用“评分/维度评分/维度Scores”等变体。",
    "revisedAnswers 必须输出 JSON 数组且与题目一一对应，字段: question, revised, estimatedTimeMin, outlineOriginal, outlineRevised。",
    "outlineOriginal/outlineRevised 必须为 Markdown 列表文本字符串（每题8-18条），分别对应本题“原回答提纲”与“示范提纲”。",
    "提纲必须是关键词式（避免完整长句），只能用 Markdown 列表缩进表示层级，至少两级，禁止使用箭头符号。",
    "第一级用中文序号+标题，例如：一、开头 二、重要性 三、问题 四、对策 五、结尾。",
    "每条<=20字。",
    "系统会自动解析 Markdown 列表缩进，不需要额外说明。",
    notes.length
      ? `检索笔记:\n${notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\n")}`
      : "检索笔记: 无",
  ];

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

  const retryValue = Number(config.maxRetries ?? 1);
  const resolvedRetries = Number.isFinite(retryValue) ? Math.max(0, retryValue) : 1;
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
        ? notes.slice(0, 3).map((note) => `可参考：${note.snippet}`)
        : parsedNoteSuggestions;
    const revisedAnswers = parsedRevised.map((item: any, idx: number) => {
      const estimated =
        Number(item?.estimatedTimeMin ?? item?.estimated_time_min) ||
        timePlan[idx] ||
        3;
      const outlineOriginalRaw = it_toOutlineArray(
        item?.outlineOriginal ??
          item?.outline_original ??
          item?.outlineUser ??
          item?.outline_user ??
          item?.outlineMine ??
          item?.outline_mine ??
          item?.originalOutline ??
          item?.original_outline,
      );
      const outlineRevisedRaw = it_toOutlineArray(
        item?.outlineRevised ??
          item?.outline_revised ??
          item?.outlineDemo ??
          item?.outline_demo ??
          item?.revisedOutline ??
          item?.revised_outline,
      );
      return {
        question: String(item?.question || questions[idx] || `第${idx + 1}题`),
        original: String(item?.original || resolvedAnswers[idx]?.answer || ""),
        revised: it_ensureParagraphs(String(item?.revised || "")),
        estimatedTimeMin: estimated,
        outlineOriginal: outlineOriginalRaw.length ? outlineOriginalRaw : undefined,
        outlineRevised: outlineRevisedRaw.length ? outlineRevisedRaw : undefined,
      };
    });

    const needOutlineFix = revisedAnswers.some(
      (item) =>
        !it_isOutlineKeywordLike(item.outlineOriginal) ||
        !it_isOutlineKeywordLike(item.outlineRevised) ||
        !it_outlineHasIndent(item.outlineOriginal) ||
        !it_outlineHasIndent(item.outlineRevised),
    );
    if (needOutlineFix && config.apiKey) {
      const regenerated = await it_generateOutlines(
        config,
        revisedAnswers.map((item) => ({
          question: item.question,
          original: item.original,
          revised: item.revised,
        })),
      );
      if (regenerated && regenerated.length) {
        regenerated.forEach((entry, idx) => {
          const original = it_isOutlineKeywordLike(entry.outlineOriginal)
            ? entry.outlineOriginal
            : undefined;
          const revised = it_isOutlineKeywordLike(entry.outlineRevised)
            ? entry.outlineRevised
            : undefined;
          if (revisedAnswers[idx]) {
            revisedAnswers[idx].outlineOriginal = original ?? revisedAnswers[idx].outlineOriginal;
            revisedAnswers[idx].outlineRevised = revised ?? revisedAnswers[idx].outlineRevised;
          }
        });
      }
    }
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
