import type { ItNoteHit } from "../../../protocol/interviewTrainer";

export function it_sanitizeTopicTitle(raw: string, maxLen: number): string {
  const cleaned = String(raw || "")
    .replace(/\s+/g, "")
    .replace(/[\p{P}\p{S}]/gu, "");
  const base = cleaned || String(raw || "").trim();
  if (!base) {
    return "untitled";
  }
  return base.slice(0, Math.max(1, maxLen));
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
    transcript?.split(/[.!?\u3002\uff01\uff1f]/)[0]?.trim() ||
    "untitled";
  return base.slice(0, maxLen);
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
