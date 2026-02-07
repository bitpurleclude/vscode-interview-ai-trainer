import { describe, expect, it, vi } from "vitest";
import { it_analyzeAudioFromWebview } from "./it_resultActions";

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
});
