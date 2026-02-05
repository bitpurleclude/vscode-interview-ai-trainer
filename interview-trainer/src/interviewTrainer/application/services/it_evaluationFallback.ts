import type { ItEvaluation, ItNoteHit } from "../../../protocol/interviewTrainer";

export function it_buildUnavailableEvaluation(params: {
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
    ? params.notes.slice(0, 3).map((note) => `可参考：${note.snippet}`)
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