import type { ItEvaluation, ItNoteHit } from "../../../protocol/interviewTrainer";
import type { ItEvaluationConfig } from "../../domain/evaluation/types";
import {
  it_canUseLlm,
  it_generateOutlines,
  it_generateRevisedByOutline,
} from "../../domain/evaluation/prompt";
import {
  it_extractScoreData,
  it_computeOverallScore,
} from "../../domain/evaluation/scoring";
import {
  it_isOutlineKeywordLike,
  it_outlineHasIndent,
  it_pickRevisedAnswers,
  it_toOutlineArray,
  it_toStringArray,
} from "../../domain/evaluation/parser";

export async function it_buildEvaluationFromParsed(params: {
  parsed: any;
  parsedRevised?: any[];
  question: string;
  questions: string[];
  resolvedAnswers: Array<{ question: string; answer: string }>;
  notes: ItNoteHit[];
  dimensions: string[];
  config: ItEvaluationConfig;
  timePlan: number[];
  demoPrompt?: string;
  material?: string;
  backgroundQuestions: string[];
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void;
  content: string;
  finalPromptText: string;
}): Promise<ItEvaluation> {
  const parsed = params.parsed;
  const parsedRevised = params.parsedRevised || it_pickRevisedAnswers(parsed);
  const scoreData = it_extractScoreData(parsed);
  const mappedScores = scoreData.scores;
  const overallScore =
    Number.isFinite(scoreData.overall)
      ? (scoreData.overall as number)
      : it_computeOverallScore(mappedScores, params.dimensions);
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
    params.notes.length && !parsedNoteUsage.length
      ? params.notes.slice(0, 3).map((note) => `${note.source} :: ${note.snippet}`)
      : parsedNoteUsage;
  const fallbackNoteSuggestions =
    params.notes.length && !parsedNoteSuggestions.length
      ? params.notes.slice(0, 3).map((note) => `可参考：${note.snippet}`)
      : parsedNoteSuggestions;
  const revisedAnswers = parsedRevised.map((item: any, idx: number) => {
    const estimated =
      Number(item?.estimatedTimeMin ?? item?.estimated_time_min) ||
      params.timePlan[idx] ||
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
      question: String(item?.question || params.questions[idx] || `第${idx + 1}题`),
      original: String(item?.original || params.resolvedAnswers[idx]?.answer || ""),
      revised: String(item?.revised || ""),
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
  if (needOutlineFix && it_canUseLlm(params.config)) {
    const regenerated = await it_generateOutlines(
      params.config,
      revisedAnswers.map((item) => ({
        question: item.question,
        original: item.original,
        revised: item.revised,
      })),
      params.onTrace,
      params.onStream,
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
  const hasRevisedOutline = revisedAnswers.every(
    (item) => Array.isArray(item.outlineRevised) && item.outlineRevised.length,
  );
  const answerMode = params.config.answerMode || "two-step";
  if (answerMode === "two-step" && hasRevisedOutline && it_canUseLlm(params.config)) {
    const regeneratedRevised = await it_generateRevisedByOutline(
      params.config,
      revisedAnswers.map((item) => ({
        question: item.question,
        outlineRevised: item.outlineRevised,
        notes: params.notes,
      })),
      params.demoPrompt,
      params.material,
      params.backgroundQuestions,
      params.onTrace,
      params.onStream,
    );
    if (regeneratedRevised && regeneratedRevised.length) {
      regeneratedRevised.forEach((text, idx) => {
        if (revisedAnswers[idx] && String(text || "").trim()) {
          revisedAnswers[idx].revised = String(text || "");
        }
      });
    }
  }
  return {
    topicTitle: parsed.topicTitle || params.question || "未命名",
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
    raw: params.content,
    prompt: params.finalPromptText,
  };
}