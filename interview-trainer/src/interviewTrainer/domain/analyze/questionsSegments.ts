import type { ItAudioSegment, ItQuestionTiming } from "../../../protocol/interviewTrainer";
import { it_normalizeText } from "../../infra/utils/it_text";

export function it_alignAnswerToSegments(
  answer: string,
  segments: ItAudioSegment[],
): { startSec: number; endSec: number } | null {
  const normalizedTarget = it_normalizeText(answer);
  if (!normalizedTarget) {
    return null;
  }

  const speechSegments = segments.filter(
    (seg) => seg.type === "speech" && seg.text && it_normalizeText(seg.text),
  );
  if (!speechSegments.length) {
    return null;
  }

  const normalizedSegments = speechSegments.map((seg) => it_normalizeText(seg.text || ""));
  const offsets: number[] = [];
  let cursor = 0;
  for (const text of normalizedSegments) {
    offsets.push(cursor);
    cursor += text.length;
  }
  const joined = normalizedSegments.join("");

  const collectPositions = (needle: string, limit: number = 6): number[] => {
    if (!needle) {
      return [];
    }
    const positions: number[] = [];
    let pos = 0;
    while (positions.length < limit) {
      const idx = joined.indexOf(needle, pos);
      if (idx === -1) {
        break;
      }
      positions.push(idx);
      pos = idx + 1;
    }
    return positions;
  };

  const findSegmentIndex = (pos: number): number => {
    for (let i = 0; i < normalizedSegments.length; i += 1) {
      const start = offsets[i];
      const end = start + normalizedSegments[i].length;
      if (pos < end) {
        return i;
      }
    }
    return normalizedSegments.length - 1;
  };

  const locateRange = (startPos: number, length: number): { startSec: number; endSec: number } => {
    const startIdx = findSegmentIndex(startPos);
    const endIdx = findSegmentIndex(startPos + Math.max(0, length - 1));
    return {
      startSec: speechSegments[startIdx].startSec,
      endSec: speechSegments[endIdx].endSec,
    };
  };

  let startPos = joined.indexOf(normalizedTarget);
  let matchLen = normalizedTarget.length;
  if (startPos !== -1) {
    return locateRange(startPos, matchLen);
  }

  const anchorLengths = [48, 36, 24, 16];
  for (const anchorLen of anchorLengths) {
    if (normalizedTarget.length < anchorLen) {
      continue;
    }
    const half = Math.floor(anchorLen / 2);
    const anchorPositions = [
      0,
      Math.max(0, Math.floor(normalizedTarget.length * 0.33) - half),
      Math.max(0, Math.floor(normalizedTarget.length * 0.66) - half),
      Math.max(0, normalizedTarget.length - anchorLen),
    ];
    const anchors = Array.from(
      new Set(
        anchorPositions
          .map((pos) => normalizedTarget.slice(pos, pos + anchorLen))
          .filter(Boolean),
      ),
    );
    const matches = anchors
      .map((anchor) => ({
        anchor,
        len: anchor.length,
        positions: collectPositions(anchor, 6),
      }))
      .filter((entry) => entry.positions.length > 0);
    if (!matches.length) {
      continue;
    }
    if (matches.length === 1) {
      startPos = matches[0].positions[0];
      matchLen = matches[0].len;
      return locateRange(startPos, matchLen);
    }
    const limitedMatches = matches.slice(0, 4);
    let bestSpanStart: number | null = null;
    let bestSpanEnd: number | null = null;
    const dfs = (idx: number, minPos: number, maxEnd: number): void => {
      if (idx >= limitedMatches.length) {
        if (minPos === Number.POSITIVE_INFINITY) {
          return;
        }
        if (
          bestSpanStart === null ||
          bestSpanEnd === null ||
          maxEnd - minPos < bestSpanEnd - bestSpanStart
        ) {
          bestSpanStart = minPos;
          bestSpanEnd = maxEnd;
        }
        return;
      }
      const entry = limitedMatches[idx];
      entry.positions.forEach((pos) => {
        dfs(idx + 1, Math.min(minPos, pos), Math.max(maxEnd, pos + entry.len));
      });
    };
    dfs(0, Number.POSITIVE_INFINITY, 0);
    if (bestSpanStart !== null && bestSpanEnd !== null) {
      return locateRange(
        bestSpanStart,
        Math.max(1, bestSpanEnd - bestSpanStart),
      );
    }
  }

  const charSet = new Set(normalizedTarget.split(""));
  const scores = normalizedSegments.map((text) => {
    if (!text) {
      return 0;
    }
    let hit = 0;
    for (const ch of text) {
      if (charSet.has(ch)) {
        hit += 1;
      }
    }
    return hit / Math.max(1, text.length);
  });
  let bestIdx = -1;
  let bestScore = 0;
  scores.forEach((score, idx) => {
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  });
  if (bestIdx === -1 || bestScore < 0.08) {
    return null;
  }
  const threshold = Math.max(0.05, bestScore * 0.5);
  let startIdx = bestIdx;
  let endIdx = bestIdx;
  while (startIdx > 0 && scores[startIdx - 1] >= threshold) {
    startIdx -= 1;
  }
  while (endIdx < scores.length - 1 && scores[endIdx + 1] >= threshold) {
    endIdx += 1;
  }
  return {
    startSec: speechSegments[startIdx].startSec,
    endSec: speechSegments[endIdx].endSec,
  };
}

export function it_collectAnswersFromSegments(
  timings: ItQuestionTiming[],
  segments: ItAudioSegment[],
): Array<{ question: string; answer: string }> {
  if (!timings.length || !segments.length) {
    return [];
  }
  return timings.map((timing) => {
    const texts = segments
      .filter(
        (seg) =>
          seg.type === "speech" &&
          seg.text &&
          seg.startSec < timing.endSec &&
          seg.endSec > timing.startSec,
      )
      .map((seg) => seg.text?.trim())
      .filter(Boolean) as string[];
    return {
      question: timing.question,
      answer: texts.join(" ").replace(/\\s+/g, " ").trim(),
    };
  });
}
