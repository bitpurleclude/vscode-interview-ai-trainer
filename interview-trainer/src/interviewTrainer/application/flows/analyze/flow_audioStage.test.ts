import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItAnalyzeRequest } from "../../../../protocol/interviewTrainer";

const mocks = vi.hoisted(() => ({
  transcribeAudio: vi.fn(),
  summarizeAudioMetrics: vi.fn(),
  buildDetailedTranscript: vi.fn(),
}));

vi.mock("../../services/it_asrTranscription", () => ({
  it_transcribeAudio: mocks.transcribeAudio,
}));

vi.mock("../../services/it_audioGateway", () => ({
  it_summarizeAudioMetrics: mocks.summarizeAudioMetrics,
  it_buildDetailedTranscript: mocks.buildDetailedTranscript,
}));

import { it_runAudioStage } from "./flow_audioStage";

function createRequest(format: "pcm" | "wav" = "pcm"): ItAnalyzeRequest {
  return {
    audio: {
      format,
      sampleRate: 16000,
      byteLength: 16,
      durationSec: 9,
      base64: "AQIDBAUGBwg=",
    },
    questionText: "question",
    questionList: ["question"],
    runId: "audio-stage-test",
  };
}

describe("flow_audioStage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.summarizeAudioMetrics.mockReturnValue({
      durationSec: 9,
      speechDurationSec: 8.2,
      speechRateWpm: 125,
      pauseCount: 3,
      pauseAvgSec: 0.2,
      pauseMaxSec: 0.45,
      rmsDbMean: -20,
      rmsDbStd: 3,
      snrDb: 18,
    });
    mocks.buildDetailedTranscript.mockReturnValue({
      detailedTranscript: "detailed text",
      segments: [
        {
          text: "segment-1",
          startSec: 0,
          endSec: 1.5,
          confidence: 0.9,
        },
      ],
    });
  });

  it("runs pcm audio stage and emits transcript/acoustic/detailed partial updates", async () => {
    const partialEvents: Array<Record<string, unknown>> = [];
    const progressEvents: Array<Record<string, unknown>> = [];
    const onCorpusTrace = vi.fn();

    mocks.transcribeAudio.mockResolvedValueOnce("transcript-text");

    const request = createRequest("pcm");
    const asrCfg = { provider: "template" };
    const asrRuntime = { template: { id: "tpl-asr" }, environment: "prod" } as any;

    const result = await it_runAudioStage({
      deps: {
        onPartial: (event) => partialEvents.push(event as Record<string, unknown>),
        onCorpusTrace,
      } as any,
      request,
      asrCfg,
      asrRuntime,
      reportProgress: (step, progress, message, status) => {
        progressEvents.push({ step, progress, message, status });
      },
    });

    expect(mocks.transcribeAudio).toHaveBeenCalledWith(
      request,
      asrCfg,
      asrRuntime,
      expect.any(Function),
      onCorpusTrace,
    );
    expect(mocks.summarizeAudioMetrics).toHaveBeenCalledTimes(1);
    expect(mocks.buildDetailedTranscript).toHaveBeenCalledTimes(1);
    expect(partialEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transcript: "transcript-text" }),
        expect.objectContaining({ acoustic: expect.any(Object) }),
        expect.objectContaining({ detailedTranscript: "detailed text" }),
      ]),
    );
    expect(progressEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          step: "acoustic",
          progress: 20,
          status: "running",
        }),
        expect.objectContaining({
          step: "acoustic",
          progress: 100,
          status: "success",
        }),
      ]),
    );
    expect(result.transcript).toBe("transcript-text");
    expect(result.detailedTranscript).toBe("detailed text");
    expect(result.audioSegments?.length).toBe(1);
  });

  it("throws cancel error when abort is set after transcription", async () => {
    const partialEvents: Array<Record<string, unknown>> = [];
    mocks.transcribeAudio.mockResolvedValueOnce("transcript-text");

    await expect(
      it_runAudioStage({
        deps: {
          abortSignal: { aborted: true },
          onPartial: (event) => partialEvents.push(event as Record<string, unknown>),
        } as any,
        request: createRequest("pcm"),
        asrCfg: {},
        asrRuntime: {} as any,
        reportProgress: () => undefined,
      }),
    ).rejects.toThrow("分析已停止");

    expect(mocks.summarizeAudioMetrics).not.toHaveBeenCalled();
    expect(partialEvents).toHaveLength(0);
  });

  it("uses fallback acoustic metrics and skips detailed transcript for non-pcm audio", async () => {
    const partialEvents: Array<Record<string, unknown>> = [];
    mocks.transcribeAudio.mockResolvedValueOnce("wav-transcript");

    const result = await it_runAudioStage({
      deps: {
        onPartial: (event) => partialEvents.push(event as Record<string, unknown>),
      } as any,
      request: createRequest("wav"),
      asrCfg: {},
      asrRuntime: {} as any,
      reportProgress: () => undefined,
    });

    expect(mocks.summarizeAudioMetrics).not.toHaveBeenCalled();
    expect(mocks.buildDetailedTranscript).not.toHaveBeenCalled();
    expect(result.detailedTranscript).toBeUndefined();
    expect(result.audioSegments).toBeUndefined();
    expect(result.acoustic).toMatchObject({
      durationSec: 9,
      speechDurationSec: 9,
      pauseCount: 0,
      rmsDbMean: 0,
    });
    expect(partialEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ transcript: "wav-transcript" }),
        expect.objectContaining({ acoustic: expect.any(Object) }),
      ]),
    );
  });
});
