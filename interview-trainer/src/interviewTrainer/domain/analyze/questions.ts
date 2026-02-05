import type {
  ItAudioSegment,
  ItQuestionTiming,
} from "../../../protocol/interviewTrainer";
import { it_requestLlmChatStreaming } from "../../core/clients/llmClient";
import { it_createTraceLogger } from "../../core/logging/it_traceLogger";
import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import { it_formatSeconds, it_normalizeText } from "../../infra/utils/it_text";
import { it_extractJson } from "./shared";

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
          startSec !== speechSegments[0].startSec || endSec !== speechSegments[speechSegments.length - 1].endSec
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

export async function it_assignSegmentsWithLlm(
  llmConfig: ItLlmConfig,
  questions: string[],
  segments: ItAudioSegment[],
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void,
): Promise<
  | {
      timings: ItQuestionTiming[];
      answers: Array<{ question: string; answer: string }>;
    }
  | null
> {
  const trace = it_createTraceLogger(onTrace);
  if (!questions.length || !segments.length) {
    return null;
  }
  const speechSegments = segments
    .filter((seg) => seg.type === "speech" && seg.text && seg.text.trim());
  if (!speechSegments.length) {
    return null;
  }

  const lines = speechSegments.map(
    (seg, idx) =>
      `${idx}. [${it_formatSeconds(seg.startSec)}-${it_formatSeconds(seg.endSec)}] ${seg.text}`,
  );
  const systemPrompt =
    "你是中文面试答题分段助手。根据题目列表，将转写分段归属到对应题目。允许只回答部分题目，仅输出JSON。";
  const userPrompt = [
    "题目列表:",
    questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n"),
    "",
    "转写分段(仅语音):",
    lines.join("\n"),
    "",
    "要求:",
    "1) 输出 JSON: {assignments:[{segmentIndex, questionIndex}]}。",
    "2) questionIndex 从 0 开始，对应题目顺序。",
    "3) 非答题内容可标记为 -1。",
    "4) 可能只回答部分题目，未回答题目无需分配。",
  ].join("\n");

  try {
    onStream?.({ text: "", reset: true });
    await trace.logLlmTemplateRequest("多题分段（远程对齐）", llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], llmConfig.stream);
    const content = await it_requestLlmChatStreaming(
      llmConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        onDelta: onStream ? (_delta, full) => onStream({ text: full }) : undefined,
        stream: llmConfig.stream,
      },
    );
    onStream?.({ text: content, done: true });
    trace.logLlmTemplateResponse("多题分段（远程对齐）", llmConfig, content);
    const parsed = it_extractJson(content);
    const assignments = Array.isArray(parsed?.assignments)
      ? parsed.assignments
      : [];
    if (!assignments.length) {
      return null;
    }
    const mapping: Array<number> = new Array(speechSegments.length).fill(-1);
    assignments.forEach((item: any) => {
      const segIndex = Number(item?.segmentIndex);
      const qIndex = Number(item?.questionIndex);
      if (
        Number.isFinite(segIndex) &&
        Number.isFinite(qIndex) &&
        segIndex >= 0 &&
        segIndex < mapping.length
      ) {
        mapping[segIndex] = qIndex;
      }
    });

    const timings: ItQuestionTiming[] = [];
    const answers: Array<{ question: string; answer: string }> = questions.map(
      (question) => ({ question, answer: "" }),
    );
    let answeredCount = 0;
    for (let q = 0; q < questions.length; q += 1) {
      const segs = speechSegments.filter((_, idx) => mapping[idx] === q);
      if (!segs.length) {
        continue;
      }
      answeredCount += 1;
      const startSec = Math.min(...segs.map((seg) => seg.startSec));
      const endSec = Math.max(...segs.map((seg) => seg.endSec));
      timings[q] = {
        question: questions[q],
        startSec,
        endSec,
        durationSec: Math.max(0, endSec - startSec),
        note: "LLM分段",
      };
      answers[q].answer = segs
        .map((seg) => seg.text?.trim())
        .filter(Boolean)
        .join(" ")
        .replace(/\\s+/g, " ")
        .trim();
    }
    return answeredCount ? { timings, answers } : null;
  } catch (error) {
    trace.logLlmTemplateError("多题分段（远程对齐）", llmConfig, error);
    return null;
  }
}

export async function it_splitAnswersWithLlm(
  llmConfig: ItLlmConfig,
  questions: string[],
  transcript: string,
  onTrace?: (message: string, detail?: Record<string, unknown>) => void,
  onStream?: (update: { text: string; done?: boolean; reset?: boolean }) => void,
): Promise<Array<{ question: string; answer: string }> | null> {
  const trace = it_createTraceLogger(onTrace);
  if (!questions.length || !transcript.trim()) {
    return null;
  }

  const systemPrompt =
    "你是中文面试逐题拆分助手。请按整题识别考生回答，允许只回答部分题目，仅输出 JSON。";
  const userPrompt = [
    "题目列表:",
    questions.map((q, idx) => `${idx + 1}. ${q}`).join("\n"),
    "",
    "考生完整转写:",
    transcript.trim(),
    "",
    "输出要求:",
    "1) 仅输出 JSON: {answers:[{questionIndex, answer, confidence?}]}。",
    "2) questionIndex 从 0 开始，仅包含有回答的题目。",
    "3) answer 必须尽量使用原文连续片段，不要改写或总结。",
    "4) 不确定可省略该题或给出低置信度。",
  ].join("\n");

  try {
    onStream?.({ text: "", reset: true });
    await trace.logLlmTemplateRequest("多题分段（逐题拆分）", llmConfig, [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ], llmConfig.stream);
    const content = await it_requestLlmChatStreaming(
      llmConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      {
        onDelta: onStream ? (_delta, full) => onStream({ text: full }) : undefined,
        stream: llmConfig.stream,
      },
    );
    onStream?.({ text: content, done: true });
    trace.logLlmTemplateResponse("多题分段（逐题拆分）", llmConfig, content);
    const parsed = it_extractJson(content);
    const answers = Array.isArray(parsed?.answers) ? parsed.answers : [];
    if (!answers.length) {
      return null;
    }
    const normalizedQuestions = questions.map((q) => it_normalizeText(q));
    const findQuestionIndex = (value: string): number => {
      const normalized = it_normalizeText(value);
      if (!normalized) {
        return -1;
      }
      const exact = normalizedQuestions.indexOf(normalized);
      if (exact !== -1) {
        return exact;
      }
      return -1;
    };
    if (answers.length === questions.length && typeof answers[0] === "string") {
      return answers.map((item: any, idx: number) => ({
        question: questions[idx],
        answer: typeof item === "string" ? item.trim() : String(item ?? "").trim(),
      }));
    }
    const result = questions.map((question) => ({ question, answer: "" }));
    let answeredCount = 0;
    answers.forEach((item: any) => {
      const rawAnswer =
        typeof item?.answer === "string"
          ? item.answer
          : typeof item?.text === "string"
            ? item.text
            : typeof item === "string"
              ? item
              : String(item?.answer ?? item?.text ?? "");
      const answerText = String(rawAnswer || "").trim();
      if (!answerText) {
        return;
      }
      let qIndex = Number(
        item?.questionIndex ??
          item?.index ??
          item?.qIndex ??
          item?.question_index ??
          -1,
      );
      if (!Number.isFinite(qIndex) || qIndex < 0 || qIndex >= questions.length) {
        if (typeof item?.question === "string") {
          qIndex = findQuestionIndex(item.question);
        }
      }
      if (!Number.isFinite(qIndex) || qIndex < 0 || qIndex >= questions.length) {
        return;
      }
      const existing = result[qIndex].answer;
      result[qIndex].answer = existing
        ? `${existing} ${answerText}`.replace(/\\s+/g, " ").trim()
        : answerText;
      answeredCount += 1;
    });
    return answeredCount ? result : null;
  } catch (error) {
    trace.logLlmTemplateError("多题分段（逐题拆分）", llmConfig, error);
    return null;
  }
}

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
    const dfs = (
      idx: number,
      minPos: number,
      maxEnd: number,
    ): void => {
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
        dfs(
          idx + 1,
          Math.min(minPos, pos),
          Math.max(maxEnd, pos + entry.len),
        );
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
