import type { ItAudioSegment, ItQuestionTiming } from "../../../protocol/interviewTrainer";
import {
  it_callLlmChatStreaming,
  type ItLlmConfig,
} from "./it_llmGateway";
import { it_createTraceLogger } from "./it_traceGateway";
import { it_formatSeconds, it_normalizeText } from "./it_textGateway";
import { it_extractJson } from "../../domain/analyze/shared";

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
  const speechSegments = segments.filter(
    (seg) => seg.type === "speech" && seg.text && seg.text.trim(),
  );
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
    await trace.logLlmTemplateRequest(
      "多题分段（远程对齐）",
      llmConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      llmConfig.stream,
    );
    const content = await it_callLlmChatStreaming(
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
    await trace.logLlmTemplateRequest(
      "多题分段（逐题拆分）",
      llmConfig,
      [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      llmConfig.stream,
    );
    const content = await it_callLlmChatStreaming(
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
