import { ItAcousticMetrics } from "../../../protocol/interviewTrainer";

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
      const answer = transcript
        .slice(start, end)
        .replace(/第\s*[一二三四五六七八九十0-9]+\s*[题问]/, "")
        .trim();
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

export { it_buildSummary, it_splitTranscriptByQuestions };
