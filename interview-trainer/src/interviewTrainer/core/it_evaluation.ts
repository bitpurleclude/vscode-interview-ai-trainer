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
      filled[dim] = 6;
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
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10);
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

  return {
    topicTitle: question || "未命名",
    topicSummary: summaryParts.join("；"),
    scores,
    overallScore: overall,
    strengths,
    issues,
    improvements,
    nextFocus,
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
): Promise<ItEvaluation> {
  const dimensions = it_normalizeDimensions(config.dimensions);
  if (config.provider !== "baidu_qianfan" || !config.apiKey) {
    return it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      notes,
      dimensions,
      config.language,
    );
  }

  const systemPrompt =
    "你是一位严谨但建设性的中文面试官，请根据回答内容与表达质量进行评分。必须使用中文，不要输出英文标签或解释。仅输出JSON。";
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
    "要求: strengths/issues/improvements 至少各3条，nextFocus 至少2条。",
    "输出JSON字段: topicTitle, topicSummary, scores, overallScore, strengths, issues, improvements, nextFocus",
    "scores 中的键必须与评分维度名称完全一致。",
  ].join("\\n\\n");

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
    return {
      topicTitle: parsed.topicTitle || question || "未命名",
      topicSummary: parsed.topicSummary || "",
      scores: mappedScores,
      overallScore,
      strengths: it_toStringArray(parsed.strengths),
      issues: it_toStringArray(parsed.issues),
      improvements: it_toStringArray(parsed.improvements),
      nextFocus: it_toStringArray(parsed.nextFocus),
      mode: "llm",
      raw: content,
    };
  } catch {
    const fallback = it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      notes,
      dimensions,
      config.language,
    );
    return { ...fallback, raw: content };
  }
}
