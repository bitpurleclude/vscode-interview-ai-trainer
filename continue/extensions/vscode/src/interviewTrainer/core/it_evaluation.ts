import { ItAcousticMetrics, ItEvaluation, ItNoteHit } from "core/protocol/interviewTrainer";
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

function it_heuristicEvaluation(
  question: string,
  transcript: string,
  acoustic: ItAcousticMetrics,
  dimensions: string[],
  language: string,
): ItEvaluation {
  const scores: Record<string, number> = {};
  dimensions.forEach((dim) => {
    scores[dim] = 6;
  });

  const strengths: string[] = [];
  const issues: string[] = [];
  const improvements: string[] = [];
  const nextFocus: string[] = [];

  if (transcript.length < 120) {
    scores.content_structure = Math.max(4, scores.content_structure - 1);
    scores.logic_coherence = Math.max(4, scores.logic_coherence - 1);
    issues.push("内容偏短，论点展开不足。");
    improvements.push("补充背景、观点与对策，保持结构完整。");
  } else {
    strengths.push("内容信息量适中。");
  }

  if (acoustic.speechRateWpm && acoustic.speechRateWpm < 90) {
    scores.clarity_concision = Math.max(4, scores.clarity_concision - 1);
    issues.push("语速偏慢，表达节奏不足。");
    improvements.push("适度加快语速，保持表达连贯。");
  } else if (acoustic.speechRateWpm && acoustic.speechRateWpm > 180) {
    scores.clarity_concision = Math.max(4, scores.clarity_concision - 1);
    issues.push("语速偏快，清晰度受影响。");
    improvements.push("放慢语速，重点处适当停顿。");
  } else {
    strengths.push("语速整体平稳。");
  }

  if (acoustic.pauseMaxSec > 3) {
    scores.etiquette_expression = Math.max(4, scores.etiquette_expression - 1);
    issues.push("存在较长停顿。");
    improvements.push("控制停顿时长，句间停顿保持简短。");
  }

  if (acoustic.snrDb !== undefined && acoustic.snrDb < 8) {
    scores.professionalism = Math.max(4, scores.professionalism - 1);
    issues.push("环境噪声较明显。");
    improvements.push("选择安静环境或使用降噪设备。");
  }

  const overall =
    Math.round(
      (Object.values(scores).reduce((sum, v) => sum + v, 0) / dimensions.length) *
        10,
    ) || 60;

  if (!strengths.length) strengths.push("整体表达可继续提升。");
  if (!issues.length) issues.push("未发现明显硬伤，建议继续打磨细节。");
  if (!improvements.length) improvements.push("保持结构化表达，突出要点。");
  if (!nextFocus.length) nextFocus.push("围绕题干做条理化展开练习。");

  return {
    topicTitle: question || "未命名",
    topicSummary: "基于当前录音与文本生成的相对评价，仅供练习参考。",
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
  if (config.provider !== "baidu_qianfan" || !config.apiKey) {
    return it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      config.dimensions,
      config.language,
    );
  }

  const systemPrompt =
    "你是一位严格但建设性的面试官，请根据回答内容和表达质量进行评分。请仅输出JSON。";
  const userPrompt = [
    `题干:\n${question || "未提供"}`,
    `回答文本:\n${transcript}`,
    `声学摘要:\n${it_buildSummary(acoustic)}`,
    notes.length
      ? `检索笔记:\n${notes
          .map((note) => `- ${note.source} :: ${note.snippet}`)
          .join("\n")}`
      : "检索笔记: 无",
    `评分维度: ${config.dimensions.join(", ")}`,
    "输出JSON字段: topicTitle, topicSummary, scores, overallScore, strengths, issues, improvements, nextFocus",
  ].join("\n\n");

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
    return {
      topicTitle: parsed.topicTitle || question || "未命名",
      topicSummary: parsed.topicSummary || "",
      scores: parsed.scores || {},
      overallScore: parsed.overallScore || 0,
      strengths: parsed.strengths || [],
      issues: parsed.issues || [],
      improvements: parsed.improvements || [],
      nextFocus: parsed.nextFocus || [],
      mode: "llm",
      raw: content,
    };
  } catch {
    const fallback = it_heuristicEvaluation(
      question,
      transcript,
      acoustic,
      config.dimensions,
      config.language,
    );
    return { ...fallback, raw: content };
  }
}
