import { describe, expect, it } from "vitest";
import {
  it_buildAnalyzePayload,
  it_resolveAnalyzeQuestionsFromResponse,
  it_shouldIgnoreAnalyzeResponse,
} from "./useAnalysisFlow.contract";

const audio = {
  format: "wav" as const,
  sampleRate: 16000,
  byteLength: 4,
  durationSec: 1,
  base64: "AQID",
};

describe("useAnalysisFlow contract", () => {
  it("builds normalized analyze payload for webview request", () => {
    const payload = it_buildAnalyzePayload({
      audio,
      questionText: "  question topic  ",
      questionList: ["q1", "q2"],
      customPrompt: "  system  ",
      demoPrompt: "  demo  ",
      perQuestionSystemPrompts: ["  s1 ", "", " s3 ", "ignored"],
      perQuestionDemoPrompts: ["", " d2 ", "  "],
      runId: "run-1",
    });

    expect(payload).toEqual({
      audio,
      questionText: "question topic",
      questionList: ["q1", "q2"],
      systemPrompt: "system",
      demoPrompt: "demo",
      perQuestionSystemPrompts: ["s1", "", "s3"],
      perQuestionDemoPrompts: ["", "d2", ""],
      runId: "run-1",
    });
  });

  it("drops optional prompts when all prompt content is empty", () => {
    const payload = it_buildAnalyzePayload({
      audio,
      questionText: "   ",
      questionList: [],
      customPrompt: "  ",
      demoPrompt: "\n\t",
      perQuestionSystemPrompts: ["", "  ", "\n"],
      perQuestionDemoPrompts: ["", "", ""],
      runId: "run-2",
    });

    expect(payload.questionText).toBeUndefined();
    expect(payload.systemPrompt).toBeUndefined();
    expect(payload.demoPrompt).toBeUndefined();
    expect(payload.perQuestionSystemPrompts).toBeUndefined();
    expect(payload.perQuestionDemoPrompts).toBeUndefined();
  });

  it("ignores canceled or stale run responses", () => {
    expect(
      it_shouldIgnoreAnalyzeResponse({
        cancelled: true,
        runId: 1,
        activeRunId: 1,
      }),
    ).toBe(true);

    expect(
      it_shouldIgnoreAnalyzeResponse({
        cancelled: false,
        runId: 1,
        activeRunId: 2,
      }),
    ).toBe(true);

    expect(
      it_shouldIgnoreAnalyzeResponse({
        cancelled: false,
        runId: 2,
        activeRunId: 2,
      }),
    ).toBe(false);
  });

  it("resolves normalized question text/list from analyze response", () => {
    expect(
      it_resolveAnalyzeQuestionsFromResponse({
        questionText: "  prompt-A  ",
        questionList: [" q1 ", "", 2, null],
      }),
    ).toEqual({
      questionText: "prompt-A",
      questionList: ["q1", "2", "null"],
    });

    expect(it_resolveAnalyzeQuestionsFromResponse(null)).toEqual({
      questionText: "",
      questionList: [],
    });
  });
});
