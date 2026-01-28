import {
  ItAcousticMetrics,
  ItEvaluation,
  ItNoteHit,
} from "../../protocol/interviewTrainer";
import { it_callQianfanChat } from "../api/it_qianfan";

export interface ItEvaluationConfig {
  provider: "baidu_qianfan" | "heuristic";
  model: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
  topP: number;
  timeoutSec: number;
  maxRetries: number;
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

function it_clampScore(value: number): number {
  return Math.max(1, Math.min(10, Math.round(value)));
}

function it_countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

function it_sentenceCount(text: string): number {
  const parts = text.split(/[。！？!?]/).map((item) => item.trim()).filter(Boolean);
  return parts.length || 1;
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
    mapped[name] = value;
  });
  return mapped;
}

function it_fillMissingScores(
  scores: Record<string, number>,
  dimensions: string[],
): Record<string, number> {
  const filled = { ...scores };
  dimensions.forEach((dim) => {
    if (filled[dim] === undefined) {
      filled[dim] = 4;
    }
  });
  return filled;
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

function it_buildFallbackRevisions(
  questionAnswers: Array<{ question: string; answer: string }>,
  improvements: string[],
): Array<{ question: string; original: string; revised: string }> {
  return questionAnswers.map((item) => {
    const base = item.answer || "（作答略）";
    const cleaned = base
      .replace(/考生回答完毕|回答完毕|考生回答/g, "")
      .replace(/\s+/g, "");
    const rawClauses = cleaned
      .split(/[。！？!?；;]/)
      .flatMap((part) => part.split(/[，,]/))
      .map((part) => part.trim())
      .filter(Boolean);
    const seen = new Set<string>();
    const clauses: string[] = [];
    rawClauses.forEach((clause) => {
      if (!seen.has(clause) && clause.length > 1) {
        seen.add(clause);
        clauses.push(clause);
      }
    });

    const buckets = {
      coord: [] as string[],
      product: [] as string[],
      promote: [] as string[],
      safety: [] as string[],
      other: [] as string[],
    };
    clauses.forEach((clause) => {
      if (/安全|救援|应急|预案|备案|评估|评判|医疗/.test(clause)) {
        buckets.safety.push(clause);
      } else if (/部门|统筹|联动|协同|交通|农业|文旅|公安|卫健/.test(clause)) {
        buckets.coord.push(clause);
      } else if (/农产品|小吃|文化|展览|艺术|特色|旅游|奖品|展销/.test(clause)) {
        buckets.product.push(clause);
      } else if (/宣传|推广|政务|媒体|新闻|抖音|平台|传播/.test(clause)) {
        buckets.promote.push(clause);
      } else {
        buckets.other.push(clause);
      }
    });

    const take = (bucket: string[], count: number): string => {
      if (!bucket.length) {
        return "";
      }
      return bucket.splice(0, count).join("，");
    };

    const introClause = clauses[0] || "我认为要系统推进这项工作";
    const intro = `各位考官，${introClause}${introClause.endsWith("。") ? "" : "。"}为确保本次活动顺利开展，我将围绕统筹协调、资源落地、宣传推广与安全保障四个方面推进工作。`;

    const coordDetail =
      take(buckets.coord, 2) ||
      take(buckets.other, 1) ||
      "成立专项工作组，明确交通、农业、文旅等部门职责，形成联动机制";
    const productDetail =
      take(buckets.product, 2) ||
      take(buckets.other, 1) ||
      "下乡调研筛选本地特色产品，设置展销与体验点位，丰富赛事配套";
    const promoteDetail =
      take(buckets.promote, 2) ||
      take(buckets.other, 1) ||
      "统筹线上线下渠道发布信息，提升赛事影响力与参与度";
    const safetyDetail =
      take(buckets.safety, 2) ||
      take(buckets.other, 1) ||
      "坚持一赛一案，配足救援力量，完善应急预案与处置流程";

    const hint = improvements.slice(0, 2).join("；");
    const closing = hint
      ? `最后，我会持续复盘优化，重点落实${hint}，确保执行落地。`
      : "最后，我会持续复盘优化，确保工作闭环。";

    const revised = [
      intro,
      `第一，**统筹协调**，打好工作基础。${coordDetail}。`,
      `第二，**资源落地**，做优特色配套。${productDetail}。`,
      `第三，**宣传推广**，扩大活动影响。${promoteDetail}。`,
      `第四，**安全保障**，守住工作底线。${safetyDetail}。`,
      closing,
    ].join("\n\n");
    return {
      question: item.question,
      original: base,
      revised,
    };
  });
}

function it_adjustScore(
  scores: Record<string, number>,
  dimension: string,
  delta: number,
): void {
  if (scores[dimension] === undefined) {
    return;
  }
  scores[dimension] = it_clampScore(scores[dimension] + delta);
}

function it_heuristicEvaluation(
  question: string,
  transcript: string,
  acoustic: ItAcousticMetrics,
  notes: ItNoteHit[],
  dimensions: string[],
  language: string,
  questionList: string[],
): ItEvaluation {
  const normalizedDimensions = it_normalizeDimensions(dimensions);
  const scores: Record<string, number> = {};
  normalizedDimensions.forEach((dim) => {
    scores[dim] = 6;
  });

  const plainText = transcript.replace(/\s+/g, "");
  const charCount = plainText.length;
  const sentenceCount = it_sentenceCount(transcript);
  const hasStructure = /首先|第一|其次|然后|最后|综上|因此|总之/.test(transcript);
  const hasPolicy = /政策|法规|规定|制度|依法|纪律|原则/.test(transcript);
  const hasSolutions = /措施|建议|做法|方案|对策|落实|推进/.test(transcript);
  const hasExamples = /例如|比如|案例|实践|经验/.test(transcript);
  const hasCommitment = /我认为|我将|必须|应该|愿意|坚持/.test(transcript);
  const fillerCount = it_countMatches(transcript, /嗯|呃|就是|然后/g);

  const strengths: string[] = [];
  const issues: string[] = [];
  const improvements: string[] = [];
  const nextFocus: string[] = [];

  if (charCount < 180) {
    it_adjustScore(scores, "内容完整性", -2);
    it_adjustScore(scores, "逻辑清晰度", -1);
    issues.push("回答篇幅偏短，论点展开不足，细节支撑不够。");
    improvements.push("补充背景、现状与对策，用“原因-影响-措施-预期”结构补全内容。");
  } else if (charCount > 800) {
    it_adjustScore(scores, "语言流畅度", -1);
    issues.push("回答信息量较大但略显冗长，重点不够突出。");
    improvements.push("保留关键观点，减少重复表述，结尾收束总结。");
  } else {
    strengths.push("内容覆盖较完整，回答信息量充足。");
  }

  if (hasStructure) {
    it_adjustScore(scores, "逻辑清晰度", 1);
    strengths.push("结构层次清晰，逻辑衔接相对顺畅。");
  } else {
    it_adjustScore(scores, "逻辑清晰度", -1);
    issues.push("结构层次不够明确，缺少清晰的分点与过渡。");
    improvements.push("使用“首先/其次/最后”分点表达，突出结构骨架。");
  }

  if (hasSolutions) {
    it_adjustScore(scores, "内容完整性", 1);
    strengths.push("提出了可执行的措施或对策。");
  } else {
    it_adjustScore(scores, "内容完整性", -1);
    issues.push("对策层面阐述不足，缺乏具体可执行的做法。");
    improvements.push("补充落地举措，如流程、责任主体与时间节点。");
  }

  if (hasPolicy) {
    it_adjustScore(scores, "政策理解", 1);
    it_adjustScore(scores, "专业素养", 1);
    strengths.push("有政策意识或规范意识的表达。");
  } else {
    it_adjustScore(scores, "政策理解", -1);
    issues.push("政策依据与规范引用不足。");
    improvements.push("结合政策导向、法规或制度要求补充论据。");
  }

  if (hasExamples) {
    strengths.push("引用案例或经验，提高了说服力。");
  } else {
    improvements.push("适当补充案例或过往经验以增强可信度。");
  }

  if (hasCommitment) {
    it_adjustScore(scores, "表达感染力", 1);
    strengths.push("表达态度明确，有一定感染力。");
  }

  if (acoustic.speechRateWpm && acoustic.speechRateWpm < 90) {
    it_adjustScore(scores, "语言流畅度", -1);
    issues.push("语速偏慢，节奏感不足。");
    improvements.push("适度加快语速，并保持语句连贯。");
  } else if (acoustic.speechRateWpm && acoustic.speechRateWpm > 180) {
    it_adjustScore(scores, "语言流畅度", -1);
    issues.push("语速偏快，影响听感清晰度。");
    improvements.push("放慢语速，重点处适当停顿强调。");
  } else if (acoustic.speechRateWpm) {
    strengths.push("语速整体适中，表达节奏稳定。");
  }

  if (acoustic.pauseMaxSec > 3 || acoustic.pauseCount > 8) {
    it_adjustScore(scores, "语言流畅度", -1);
    issues.push("停顿偏多或偏长，影响表达流畅度。");
    improvements.push("提前列提纲减少卡顿，句间停顿保持简洁。");
  }

  if (fillerCount > 3) {
    it_adjustScore(scores, "表达感染力", -1);
    issues.push("口头语偏多，影响表达凝练度。");
    improvements.push("减少“嗯/然后”等口头语，提升表达质感。");
  }

  if (notes.length) {
    strengths.push("能够结合过往笔记或素材进行补充。");
  } else {
    improvements.push("可结合笔记中的观点或案例增强内容深度。");
  }

  const overall =
    Math.round(
      (Object.values(scores).reduce((sum, v) => sum + v, 0) /
        normalizedDimensions.length) *
        10,
    ) || 60;

  if (!strengths.length) strengths.push("整体表达尚可，但仍有提升空间。");
  if (!issues.length) issues.push("未发现明显硬伤，建议持续打磨细节。");
  if (!improvements.length) improvements.push("保持结构化表达，突出关键要点。");

  nextFocus.push("针对题干明确观点主线，先给结论再展开。");
  nextFocus.push("补强政策依据与可执行措施的匹配度。");

  const summaryParts = [
    `回答约${charCount}字，${sentenceCount}句`,
    acoustic.speechRateWpm ? `语速约${acoustic.speechRateWpm}字/分` : "语速未知",
    `停顿${acoustic.pauseCount}次`,
    hasStructure ? "结构清晰" : "结构偏弱",
    hasPolicy ? "有政策依据" : "政策依据不足",
  ];

  const questions = questionList.length ? questionList : question ? [question] : [];
  const questionAnswers = it_splitTranscriptByQuestions(questions, transcript);
  const revisedAnswers = it_buildFallbackRevisions(questionAnswers, improvements);

  return {
    topicTitle: question || "未命名",
    topicSummary: summaryParts.join("；"),
    scores,
    overallScore: overall,
    strengths,
    issues,
    improvements,
    nextFocus,
    revisedAnswers,
    mode: "heuristic",
    raw: language,
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
  customSystemPrompt?: string,
): Promise<ItEvaluation> {
  const lowSpeech =
    (acoustic.speechDurationSec ?? 0) < 2 || transcript.trim().length < 10;
  const dimensions = it_normalizeDimensions(config.dimensions);
  const questions = questionList.length ? questionList : question ? [question] : [];
  const resolvedAnswers =
    questionAnswers && questionAnswers.length
      ? questionAnswers
      : it_splitTranscriptByQuestions(questions, transcript);

  if (lowSpeech) {
    const baseScores: Record<string, number> = {};
    dimensions.forEach((dim) => {
      baseScores[dim] = 2;
    });
    return {
      topicTitle: question || "无有效回答",
      topicSummary: "未检测到有效语音内容，请确保麦克风输入正常并重新作答。",
      scores: baseScores,
      overallScore: 2,
      strengths: [],
      issues: ["未检测到有效语音或内容过短。", "请检查麦克风音量与输入设备。"],
      improvements: ["重新回答题目，保证清晰、连续的语音输入。"],
      nextFocus: ["确保录音设备选择正确", "避免静音，完整作答每个问题"],
      revisedAnswers: it_buildFallbackRevisions(resolvedAnswers, []),
      mode: "heuristic",
      raw: "no_speech_detected",
    };
  }

  const systemPrompt =
    customSystemPrompt?.trim() ||
    [
      "你是严格、直接的中文面试评审，仅输出 JSON，不要出现英语标签、客套或安慰语。",
      "评分规则（1-10，整数）：10=卓越/完整无明显缺陷；8=良好仅有轻微问题；6=基本达标但有明显缺口；4=不达标；2=严重不足/几乎无有效内容；1=违禁或完全失败。",
      "若语音时长极短、长时间静音或回答缺失，整体与各维度不得高于2，并在 issues 中说明原因。",
      "若未覆盖题干要点、逻辑混乱或无可执行对策，相关维度不高于4。",
      "严禁使用“继续加油”等安慰式措辞，问题描述必须直白、具体、可执行。",
      "strengths/issues/improvements/nextFocus 每项至少2条；revisedAnswers 必须基于对应原答案，给出精炼、结构化改写。",
    ].join("\n");
  const userPrompt = [
    `题干:\\n${question || "未提供"}`,
    `回答文本:\\n${transcript}`,
    `声学摘要:\\n${it_buildSummary(acoustic)}`,
    notes.length
      ? `检索笔记:\\n${notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\\n")}`
      : "检索笔记: 无",
    `评分维度(每项1-10分): ${dimensions.join("、")}`,
    questions.length
      ? `题目列表:\n${questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n")}`
      : "题目列表: 无",
    questions.length
      ? `考生回答(按题):\n${resolvedAnswers
          .map((item, idx) => `${idx + 1}. ${item.answer || "（空）"}`)
          .join("\n")}`
      : "考生回答(按题): 无",
    "要求: strengths/issues/improvements 至少各3条，nextFocus 至少2条。",
    "revisedAnswers 必须基于对应题目的原回答，并综合 improvements 的改进意见进行润色、删冗与补充逻辑。",
    "请输出完整、流畅的段落式回答：开头一句给结论，随后用“第一/第二/第三/第四”展开要点，最后收束总结。",
    "不要使用“结论/背景/对策/总结”等标题，也不要出现“示范答题/改进要点”等提示语。",
    "可用 **加粗** 标记关键观点或结论。",
    "输出JSON字段: topicTitle, topicSummary, scores, overallScore, strengths, issues, improvements, nextFocus, revisedAnswers",
    "scores 中的键必须与评分维度名称完全一致。",
  ].join("\\n\\n");
  const promptText = `System:\\n${systemPrompt}\\n\\nUser:\\n${userPrompt}`;
  if (config.provider !== "baidu_qianfan" || !config.apiKey) {
    const fallback = it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      notes,
      dimensions,
      config.language,
      questions,
    );
    return {
      ...fallback,
      prompt: promptText,
    };
  }

  const content = await it_callQianfanChat(
    {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      model: config.model,
      temperature: config.temperature,
      topP: config.topP,
      timeoutSec: config.timeoutSec,
      maxRetries: config.maxRetries,
    },
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  );

  try {
    const parsed = JSON.parse(content);
    const mappedScores = it_fillMissingScores(
      it_mapScoreKeys(parsed.scores || {}),
      dimensions,
    );
    const overallScore =
      parsed.overallScore || it_computeOverallScore(mappedScores, dimensions);
    const parsedImprovements = it_toStringArray(parsed.improvements);
    const revisedAnswers =
      Array.isArray(parsed.revisedAnswers) && parsed.revisedAnswers.length
        ? parsed.revisedAnswers.map((item: any, idx: number) => ({
            question: String(item?.question || questions[idx] || `第${idx + 1}题`),
            original: String(item?.original || resolvedAnswers[idx]?.answer || ""),
            revised: String(item?.revised || ""),
          }))
        : it_buildFallbackRevisions(resolvedAnswers, parsedImprovements);
    return {
      topicTitle: parsed.topicTitle || question || "未命名",
      topicSummary: parsed.topicSummary || "",
      scores: mappedScores,
      overallScore,
      strengths: it_toStringArray(parsed.strengths),
      issues: it_toStringArray(parsed.issues),
      improvements: parsedImprovements,
      nextFocus: it_toStringArray(parsed.nextFocus),
      revisedAnswers,
      mode: "llm",
      raw: content,
      prompt: promptText,
    };
  } catch {
    const fallback = it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      notes,
      dimensions,
      config.language,
      questions,
    );
    return { ...fallback, raw: content, prompt: promptText };
  }
}
