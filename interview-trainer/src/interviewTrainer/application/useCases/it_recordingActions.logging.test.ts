import { describe, expect, it, vi } from "vitest";
import {
  it_listNativeInputsFromWebview,
  it_startNativeRecordingFromWebview,
} from "./it_recordingActions";

describe("it_recordingActions logging", () => {
  it("logs start native recording success", async () => {
    const context: any = {
      findFfmpeg: vi.fn(async () => "ffmpeg"),
      listInputs: vi.fn(async () => []),
      startNativeRecording: vi.fn(async () => ({
        tmpDir: "/tmp",
        tmpPath: "/tmp/in.wav",
        startedAt: Date.now(),
      })),
      stopNativeRecording: vi.fn(async () => ({
        audio: { format: "wav", sampleRate: 16000, byteLength: 1, base64: "AQ==" },
      })),
      resetNativeInputs: vi.fn(),
      logCorpusTrace: vi.fn(),
    };

    await it_startNativeRecordingFromWebview({
      context,
      payload: { device: "mic-1" },
    });

    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "recording start_native success",
      expect.objectContaining({
        event: "application.recording.start_native",
        hasDevice: true,
      }),
    );
  });

  it("logs list inputs errors when ffmpeg is missing", async () => {
    const context: any = {
      findFfmpeg: vi.fn(async () => null),
      listInputs: vi.fn(async () => []),
      startNativeRecording: vi.fn(),
      stopNativeRecording: vi.fn(),
      resetNativeInputs: vi.fn(),
      logCorpusTrace: vi.fn(),
    };

    await expect(
      it_listNativeInputsFromWebview({
        context,
        payload: { refresh: true },
      }),
    ).rejects.toThrow(/ffmpeg/i);

    expect(context.resetNativeInputs).toHaveBeenCalledTimes(1);
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "recording list_inputs error",
      expect.objectContaining({
        event: "application.recording.list_inputs",
        errorCode: "ffmpeg_not_found",
      }),
    );
  });
});
