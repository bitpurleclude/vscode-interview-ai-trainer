import type {
  ItAcousticMetrics,
  ItAudioSegment,
  ItEvaluation,
  ItNoteHit,
  ItQuestionEvaluation,
  ItQuestionTiming,
} from "../../../protocol/interviewTrainer";

function it_countWordsForRate(text: string): number {
  if (!text) {
    return 0;
  }
  const chinese = text.match(/[\u4e00-\u9fff]/g) ?? [];
  const alnum = text.match(/[A-Za-z0-9]+/g) ?? [];
  return chinese.length + alnum.length;
}

export function it_buildAcousticForTiming(
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

export function it_mergeEvaluations(params: {
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

  const it_pickQuestionSuggestions = (item?: ItEvaluation): string[] => {
    if (!item) {
      return [];
    }
    return mergeList([item.improvements || [], item.nextFocus || []]).slice(0, 6);
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

  const questionEvaluations: ItQuestionEvaluation[] = questions.map((question, idx) => {
    const evalItem = evaluations[idx];
    return {
      questionIndex: idx,
      question,
      overallScore: Number(evalItem?.overallScore ?? 0),
      scores: { ...(evalItem?.scores || {}) },
      suggestions: it_pickQuestionSuggestions(evalItem),
      summary: evalItem?.topicSummary || undefined,
    };
  });

  const revisedAnswers = questions.map((question, idx) => {
    const evalItem = evaluations[idx];
    const revised = evalItem?.revisedAnswers?.[0];
    const planned = timePlan[idx] ?? revised?.estimatedTimeMin ?? 3;
    return {
      question,
      original: revised?.original || answers[idx]?.answer || "",
      revised: revised?.revised || "",
      estimatedTimeMin: planned,
      overallScore: evalItem?.overallScore,
      scores: evalItem?.scores ? { ...evalItem.scores } : undefined,
      suggestions: it_pickQuestionSuggestions(evalItem),
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
    questionEvaluations,
    noteUsage,
    noteSuggestions,
    revisedAnswers,
    mode: evaluations.every((item) => item.mode === "llm") ? "llm" : "heuristic",
    raw: raw || undefined,
    prompt: prompt || undefined,
  };
}
