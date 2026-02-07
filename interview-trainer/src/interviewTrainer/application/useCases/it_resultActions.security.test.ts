import { describe, expect, it, vi } from "vitest";
import { it_analyzeAudioFromWebview, it_cancelAnalyzeFromWebview } from "./it_resultActions";

describe("it_resultActions security", () => {
  it("rejects non-object analyze payload", async () => {
    const analyzeAudio = vi.fn();
    await expect(
      it_analyzeAudioFromWebview({
        context: {
          analyzeAudio,
          openFile: async () => {},
          getAnalysisAbort: () => null,
          getState: () => ({ steps: [] } as any),
          updateState: () => {},
        },
        payload: null,
      }),
    ).rejects.toThrow(/invalid analyze request/i);
    expect(analyzeAudio).not.toHaveBeenCalled();
  });

  it("rejects analyze payload with invalid audio", async () => {
    const analyzeAudio = vi.fn();
    await expect(
      it_analyzeAudioFromWebview({
        context: {
          analyzeAudio,
          openFile: async () => {},
          getAnalysisAbort: () => null,
          getState: () => ({ steps: [] } as any),
          updateState: () => {},
        },
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
  });

  it("accepts valid analyze payload", async () => {
    const result = { transcript: "ok" } as any;
    const analyzeAudio = vi.fn(async () => result);
    await expect(
      it_analyzeAudioFromWebview({
        context: {
          analyzeAudio,
          openFile: async () => {},
          getAnalysisAbort: () => null,
          getState: () => ({ steps: [] } as any),
          updateState: () => {},
        },
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
  });

});
