import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertAudioToPcmBase64: vi.fn(),
}));

vi.mock("../services/it_recordingGateway", () => ({
  it_convertAudioToPcmBase64: mocks.convertAudioToPcmBase64,
}));

import {
  it_convertAudioToPcmFromWebview,
  it_listNativeInputsFromWebview,
  it_startNativeRecordingFromWebview,
  it_stopNativeRecordingFromWebview,
} from "./it_recordingActions";

function createContext(overrides: Record<string, unknown> = {}) {
  return {
    findFfmpeg: vi.fn(async () => "ffmpeg-path"),
    listInputs: vi.fn(async () => ["mic-1", "mic-2"]),
    startNativeRecording: vi.fn(async () => ({
      tmpDir: "tmp",
      tmpPath: "tmp/input.wav",
      startedAt: 1,
    })),
    stopNativeRecording: vi.fn(async () => ({
      audio: {
        format: "wav",
        sampleRate: 16000,
        byteLength: 8,
        base64: "AQID",
      },
      locked: ["tmp/input.wav"],
    })),
    resetNativeInputs: vi.fn(),
    logCorpusTrace: vi.fn(),
    ...overrides,
  } as any;
}

describe("it_recordingActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.convertAudioToPcmBase64.mockResolvedValue({
      base64: "PCMBASE64",
      byteLength: 16,
      durationSec: 4,
    });
  });

  it("starts and stops native recording with trace success logs", async () => {
    const context = createContext();

    const started = await it_startNativeRecordingFromWebview({
      context,
      payload: { device: "mic-1" },
    });
    const stopped = await it_stopNativeRecordingFromWebview({ context });

    expect(started).toMatchObject({ tmpPath: "tmp/input.wav" });
    expect(stopped.audio.format).toBe("wav");
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "recording stop_native success",
      expect.objectContaining({
        event: "application.recording.stop_native",
        format: "wav",
      }),
    );
  });

  it("lists native inputs and supports refresh reset behavior", async () => {
    const context = createContext();
    const result = await it_listNativeInputsFromWebview({
      context,
      payload: { refresh: true },
    });

    expect(context.resetNativeInputs).toHaveBeenCalledTimes(1);
    expect(context.findFfmpeg).toHaveBeenCalledTimes(1);
    expect(context.listInputs).toHaveBeenCalledWith("ffmpeg-path");
    expect(result).toEqual({ inputs: ["mic-1", "mic-2"] });
  });

  it("throws when converting audio without base64 payload", async () => {
    const context = createContext();

    await expect(
      it_convertAudioToPcmFromWebview({
        context,
        payload: { ext: "m4a" },
      }),
    ).rejects.toThrow("missing audio bytes");
    expect(mocks.convertAudioToPcmBase64).not.toHaveBeenCalled();
  });

  it("throws when ffmpeg is unavailable for conversion", async () => {
    const context = createContext({
      findFfmpeg: vi.fn(async () => null),
    });

    await expect(
      it_convertAudioToPcmFromWebview({
        context,
        payload: { base64: "AQID", ext: "wav" },
      }),
    ).rejects.toThrow(/ffmpeg/i);
    expect(mocks.convertAudioToPcmBase64).not.toHaveBeenCalled();
  });

  it("converts uploaded audio and returns pcm payload", async () => {
    const context = createContext();

    const result = await it_convertAudioToPcmFromWebview({
      context,
      payload: { base64: "AQID", ext: "m4a" },
    });

    expect(mocks.convertAudioToPcmBase64).toHaveBeenCalledWith("ffmpeg-path", "AQID", "m4a");
    expect(result).toEqual({
      base64: "PCMBASE64",
      byteLength: 16,
      durationSec: 4,
    });
  });

  it("rethrows conversion errors from gateway", async () => {
    mocks.convertAudioToPcmBase64.mockRejectedValueOnce(new Error("convert failed"));
    const context = createContext();

    await expect(
      it_convertAudioToPcmFromWebview({
        context,
        payload: { base64: "AQID", ext: "wav" },
      }),
    ).rejects.toThrow("convert failed");
  });
});
