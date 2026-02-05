import type { ItAudioSegment, ItQuestionTiming } from "../../../protocol/interviewTrainer";
import { it_normalizeText } from "../../infra/utils/it_text";

function it_buildQuestionTimingsFromSegments(
  questionList: string[],
  segments: ItAudioSegment[],
  totalDurationSec: number,
): ItQuestionTiming[] {
  if (!questionList.length || !segments.length) {
    return [];
  }
  const cnDigits = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
  const toCn = (num: number): string => {
    if (num <= 0) {
      return "";
    }
    if (num < 10) {
      return cnDigits[num];
    }
    if (num === 10) {
      return "十";
    }
    if (num < 20) {
      return `十${cnDigits[num - 10]}`;
    }
    if (num < 100) {
      const tens = Math.floor(num / 10);
      const ones = num % 10;
      return `${cnDigits[tens]}十${ones ? cnDigits[ones] : ""}`;
    }
    return String(num);
  };
  const startTimes: Array<number | undefined> = new Array(questionList.length).fill(
    undefined,
  );
  const findMarker = (index: number): number | undefined => {
    const digit = String(index + 1);
    const cn = toCn(index + 1);
    const pattern = cn ? `${cn}|${digit}` : digit;
    const regex = new RegExp(`第\\s*(${pattern})\\s*[题问]`);
    const hit = segments.find((seg) => seg.text && regex.test(seg.text));
    return hit ? hit.startSec : undefined;
  };
  for (let idx = 0; idx < questionList.length; idx += 1) {
    startTimes[idx] = findMarker(idx);
  }
  if (startTimes[0] === undefined) {
    const firstSpeech = segments.find((seg) => seg.type === "speech");
    startTimes[0] = firstSpeech?.startSec ?? 0;
  }
  const fullMarkers = startTimes.slice(1).every((t) => typeof t === "number");
  if (!fullMarkers) {
    return [];
  }
  const duration = totalDurationSec || segments[segments.length - 1]?.endSec || 0;
  const timings: ItQuestionTiming[] = [];
  for (let i = 0; i < questionList.length; i += 1) {
    const startSec = startTimes[i] ?? 0;
    const endSec =
      i < questionList.length - 1 ? (startTimes[i + 1] as number) : duration;
    timings.push({
      question: questionList[i],
      startSec,
      endSec,
      durationSec: Math.max(0, endSec - startSec),
      note: "转写分段",
    });
  }
  return timings;
}

export function it_buildQuestionTimings(
  questionText: string,
  questionList: string[],
  totalDurationSec: number,
  segments?: ItAudioSegment[],
): ItQuestionTiming[] {
  const list = questionList.length
    ? questionList
    : questionText
      ? [questionText]
      : [];
  if (segments && segments.length && list.length > 1) {
    const fromSegments = it_buildQuestionTimingsFromSegments(
      list,
      segments,
      totalDurationSec,
    );
    if (fromSegments.length) {
      return fromSegments;
    }
  }
  if (segments && segments.length && list.length === 1) {
    const speechSegments = segments.filter((seg) => seg.type === "speech");
    if (speechSegments.length) {
      const startMarkers = [/开始答题/, /开始作答/, /开始回答/];
      const endMarkers = [/回答完毕/, /答题结束/, /回答结束/, /作答完毕/];
      const findMarker = (patterns: RegExp[], fromEnd: boolean): number | null => {
        const ordered = fromEnd ? [...segments].reverse() : segments;
        for (const seg of ordered) {
          if (seg.type !== "speech" || !seg.text) {
            continue;
          }
          const normalized = it_normalizeText(seg.text);
          if (!normalized) {
            continue;
          }
          if (patterns.some((pattern) => pattern.test(normalized))) {
            return fromEnd ? seg.endSec : seg.startSec;
          }
        }
        return null;
      };

      const startSec = findMarker(startMarkers, false) ?? speechSegments[0].startSec;
      const endSec =
        findMarker(endMarkers, true) ??
        speechSegments[speechSegments.length - 1].endSec;
      if (endSec > startSec) {
        const note =
          startSec !== speechSegments[0].startSec ||
          endSec !== speechSegments[speechSegments.length - 1].endSec
            ? "答题标记"
            : "语音起止";
        return [
          {
            question: list[0],
            startSec,
            endSec,
            durationSec: Math.max(0, endSec - startSec),
            note,
          },
        ];
      }
    }
  }
  if (!list.length || !Number.isFinite(totalDurationSec) || totalDurationSec <= 0) {
    return [];
  }
  const base = totalDurationSec / list.length;
  let cursor = 0;
  return list.map((question, idx) => {
    const isLast = idx === list.length - 1;
    const durationSec = isLast ? Math.max(0, totalDurationSec - cursor) : base;
    const startSec = cursor;
    const endSec = startSec + durationSec;
    cursor = endSec;
    return {
      question,
      startSec,
      endSec,
      durationSec,
      note: list.length > 1 ? "估算" : undefined,
    };
  });
}
