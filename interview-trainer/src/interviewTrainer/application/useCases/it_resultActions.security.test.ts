import { describe, expect, it, vi } from "vitest";
import { it_analyzeAudioFromWebview, it_cancelAnalyzeFromWebview } from "./it_resultActions";

function createBaseContext(overrides?: Record<string, unknown>) {
  const context: any = {
    analyzeAudio: vi.fn(),
    openFile: async () => {},
    getAnalysisAbort: () => null,
    getState: () => ({ steps: [] } as any),
    updateState: () => {},
    logCorpusTrace: vi.fn(),
    ...(overrides || {}),
  };
  return context;
}

describe("it_resultActions security", () => {
  it("rejects non-object analyze payload", async () => {
    const analyzeAudio = vi.fn();
    const context = createBaseContext({ analyzeAudio });

    await expect(
      it_analyzeAudioFromWebview({
        context,
        payload: null,
      }),
    ).rejects.toThrow(/invalid analyze request/i);

    expect(analyzeAudio).not.toHaveBeenCalled();
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "result analyze_audio error",
      expect.objectContaining({
        event: "application.result.analyze_audio",
        errorCode: "invalid_analyze_payload",
        reason: "payload_not_object",
      }),
    );
  });

  it("rejects analyze payload with invalid audio", async () => {
    const analyzeAudio = vi.fn();
    const context = createBaseContext({ analyzeAudio });

    await expect(
      it_analyzeAudioFromWebview({
        context,
        payload: {
          questionText: "q",
          audio: {
            base64: "",
            sampleRate: 16000,
            format: "wav",
            byteLength: 1,
          },
        },
      }),
    ).rejects.toThrow(/invalid analyze request/i);

    expect(analyzeAudio).not.toHaveBeenCalled();
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "result analyze_audio error",
      expect.objectContaining({
        event: "application.result.analyze_audio",
        errorCode: "invalid_analyze_payload",
        reason: "audio_base64_missing",
      }),
    );
  });

  it("accepts valid analyze payload", async () => {
    const result = { transcript: "ok", questionList: ["q1"] } as any;
    const analyzeAudio = vi.fn(async () => result);
    const context = createBaseContext({ analyzeAudio });

    await expect(
      it_analyzeAudioFromWebview({
        context,
        payload: {
          questionText: "q",
          audio: {
            base64: "AQID",
            sampleRate: 16000,
            format: "wav",
            byteLength: 3,
          },
        },
      }),
    ).resolves.toBe(result);

    expect(analyzeAudio).toHaveBeenCalledTimes(1);
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "result analyze_audio success",
      expect.objectContaining({
        event: "application.result.analyze_audio",
        status: "success",
      }),
    );
  });

  it("handles cancel in start-cancel-start style without cross-run crash", () => {
    const firstAbort = { aborted: false };
    const secondAbort = { aborted: false };
    let currentAbort: { aborted: boolean } | null = firstAbort;

    const state: any = {
      steps: [
        { id: "asr", status: "running", progress: 20 },
        { id: "report", status: "success", progress: 100 },
      ],
    };

    const updateState = vi.fn((next: any) => {
      if (Array.isArray(next.steps)) {
        state.steps = next.steps;
      }
    });

    const context: any = {
      analyzeAudio: vi.fn(),
      openFile: async () => {},
      getAnalysisAbort: () => currentAbort,
      getState: () => state,
      updateState,
      logCorpusTrace: vi.fn(),
    };

    const first = it_cancelAnalyzeFromWebview({ context });
    expect(first).toEqual({ cancelled: true });
    expect(firstAbort.aborted).toBe(true);
    expect(state.steps[0].status).toBe("error");

    currentAbort = secondAbort;
    state.steps = [
      { id: "asr", status: "running", progress: 10 },
      { id: "report", status: "pending", progress: 0 },
    ];

    const second = it_cancelAnalyzeFromWebview({ context });
    expect(second).toEqual({ cancelled: true });
    expect(secondAbort.aborted).toBe(true);
    expect(state.steps[0].status).toBe("error");
    expect(updateState).toHaveBeenCalledTimes(2);
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "result cancel_analyze success",
      expect.objectContaining({
        event: "application.result.cancel_analyze",
        status: "success",
      }),
    );
  });
});
