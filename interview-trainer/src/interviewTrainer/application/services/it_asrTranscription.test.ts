import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";

const mocks = vi.hoisted(() => ({
  executeTemplate: vi.fn(),
  createTraceLogger: vi.fn(),
  splitPcmBase64: vi.fn(),
  buildAsrTemplateVars: vi.fn(),
  transcribePcmWithChunks: vi.fn(),
  logTemplateRequest: vi.fn(),
  logTemplateResponse: vi.fn(),
  logTemplateError: vi.fn(),
}));

vi.mock("./it_templateGateway", () => ({
  it_executeTemplate: mocks.executeTemplate,
}));

vi.mock("./it_traceGateway", () => ({
  it_createTraceLogger: mocks.createTraceLogger,
}));

vi.mock("./it_recordingGateway", () => ({
  it_splitPcmBase64: mocks.splitPcmBase64,
}));

vi.mock("../../domain/analyze/asr", () => ({
  it_buildAsrTemplateVars: mocks.buildAsrTemplateVars,
  it_transcribePcmWithChunks: mocks.transcribePcmWithChunks,
}));

import { it_transcribeAudio } from "./it_asrTranscription";

function createRequest(overrides: Partial<ItAnalyzeRequest> = {}): ItAnalyzeRequest {
  return {
    audio: {
      format: "wav",
      sampleRate: 16000,
      byteLength: 24,
      durationSec: 5,
      base64: "AQIDBAUG",
    },
    questionText: "question",
    questionList: ["question"],
    runId: "asr-service-test",
    ...overrides,
  };
}

function createProgressCollector() {
  const events: Array<{
    step: string;
    progress: number;
    message?: string;
    status?: string;
  }> = [];
  const report = (step: string, progress: number, message?: string, status?: string) => {
    events.push({ step, progress, message, status });
  };
  return { events, report };
}

describe("it_asrTranscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.logTemplateRequest.mockResolvedValue(undefined);
    mocks.logTemplateResponse.mockReturnValue(undefined);
    mocks.logTemplateError.mockReturnValue(undefined);
    mocks.createTraceLogger.mockReturnValue({
      logTemplateRequest: mocks.logTemplateRequest,
      logTemplateResponse: mocks.logTemplateResponse,
      logTemplateError: mocks.logTemplateError,
    });

    mocks.buildAsrTemplateVars.mockReturnValue({
      vars: {
        audioFile: "AQIDBAUG",
        audio: {
          format: "wav",
          rate: 16000,
          sampleRate: 16000,
          channel: 1,
          byteLength: 24,
        },
        asr: {
          lang: "zh",
          dev_pid: 1537,
          language: "zh",
          devPid: 1537,
        },
      },
      runtimeConfig: {
        devPid: 1537,
        language: "zh",
        timeoutSec: 30,
        maxRetries: 1,
      },
      maxChunkSec: 45,
      maxConcurrency: 1,
      audioUrl: "",
    });
  });

  it("returns mock transcript without template calls when provider is mock", async () => {
    const request = createRequest();
    const progress = createProgressCollector();

    const text = await it_transcribeAudio(
      request,
      { provider: "mock", mock_text: "mock transcript", mock_delay_ms: 0 },
      null,
      progress.report as any,
    );

    expect(text).toBe("mock transcript");
    expect(mocks.executeTemplate).not.toHaveBeenCalled();
    expect(mocks.buildAsrTemplateVars).not.toHaveBeenCalled();
    expect(progress.events[0]).toMatchObject({
      step: "asr",
      progress: 0,
      status: "running",
    });
    expect(progress.events.at(-1)).toMatchObject({
      step: "asr",
      progress: 100,
      status: "success",
    });
  });

  it("throws when template runtime is missing for non-mock provider", async () => {
    const request = createRequest();

    await expect(
      it_transcribeAudio(request, { provider: "baidu_vop" }, null, vi.fn()),
    ).rejects.toThrow("ASR template is not bound.");
  });

  it("uses audioUrl template path and reports request/response traces", async () => {
    const request = createRequest();
    const runtime = { template: { id: "tpl-asr" }, environment: "prod" } as any;
    const progress = createProgressCollector();

    mocks.buildAsrTemplateVars.mockReturnValue({
      vars: {
        audioFile: "AQIDBAUG",
        audio: {
          format: "wav",
          rate: 16000,
          sampleRate: 16000,
          channel: 1,
          byteLength: 24,
        },
        asr: {
          lang: "zh",
          dev_pid: 1537,
          language: "zh",
          devPid: 1537,
        },
      },
      runtimeConfig: {
        devPid: 1537,
        language: "zh",
        timeoutSec: 21,
        maxRetries: 2,
      },
      maxChunkSec: 50,
      maxConcurrency: 1,
      audioUrl: "https://example.com/audio.wav",
    });
    mocks.executeTemplate.mockResolvedValueOnce({ text: "url transcript" });

    const text = await it_transcribeAudio(
      request,
      { provider: "template" },
      runtime,
      progress.report as any,
    );

    expect(text).toBe("url transcript");
    expect(mocks.executeTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime,
        variables: expect.objectContaining({
          audioUrl: "https://example.com/audio.wav",
        }),
        maxRetries: 2,
        timeoutSec: 21,
        stream: false,
      }),
    );
    expect(mocks.logTemplateRequest).toHaveBeenCalledWith(
      "asr_transcription",
      runtime,
      expect.objectContaining({ audioUrl: "https://example.com/audio.wav" }),
      { stream: false, timeoutSec: 21 },
    );
    expect(mocks.logTemplateResponse).toHaveBeenCalledWith(
      "asr_transcription",
      runtime,
      { text: "url transcript" },
    );
    expect(mocks.transcribePcmWithChunks).not.toHaveBeenCalled();
    expect(progress.events.some((item) => item.progress === 25)).toBe(true);
    expect(progress.events.at(-1)).toMatchObject({ progress: 100, status: "success" });
  });

  it("uses pcm chunk path and forwards chunk requests to template executor", async () => {
    const request = createRequest({
      audio: {
        format: "pcm",
        sampleRate: 16000,
        byteLength: 32,
        durationSec: 7,
        base64: "PCMBASE64",
      },
    });
    const runtime = { template: { id: "tpl-asr" }, environment: "prod" } as any;
    const progress = createProgressCollector();

    mocks.buildAsrTemplateVars.mockReturnValue({
      vars: {
        audioFile: "PCMBASE64",
        audio: {
          format: "pcm",
          rate: 16000,
          sampleRate: 16000,
          channel: 1,
          byteLength: 32,
        },
        asr: {
          lang: "zh",
          dev_pid: 1537,
          language: "zh",
          devPid: 1537,
        },
      },
      runtimeConfig: {
        devPid: 1537,
        language: "zh",
        timeoutSec: 40,
        maxRetries: 1,
      },
      maxChunkSec: 20,
      maxConcurrency: 2,
      audioUrl: "",
    });
    mocks.executeTemplate.mockResolvedValue({ value: "chunk-part-text" });
    mocks.transcribePcmWithChunks.mockImplementation(async (params: any) => {
      params.onProgress?.(1, 2);
      await params.requestChunk({
        audioFile: "chunk-base64",
        audio: {
          format: "pcm",
          rate: 16000,
          sampleRate: 16000,
          channel: 1,
          byteLength: 4,
        },
        asr: {
          lang: "zh",
          dev_pid: 1537,
          language: "zh",
          devPid: 1537,
        },
      });
      params.onProgress?.(2, 2);
      return "chunk transcript";
    });

    const text = await it_transcribeAudio(
      request,
      { provider: "template" },
      runtime,
      progress.report as any,
    );

    expect(text).toBe("chunk transcript");
    expect(mocks.transcribePcmWithChunks).toHaveBeenCalledTimes(1);
    expect(mocks.executeTemplate).toHaveBeenCalledWith(
      expect.objectContaining({
        runtime,
        variables: expect.objectContaining({ audioFile: "chunk-base64" }),
      }),
    );
    expect(progress.events.some((item) => item.progress === 50)).toBe(true);
    expect(progress.events.some((item) => item.progress === 100)).toBe(true);
    expect(progress.events.at(-1)).toMatchObject({ status: "success" });
  });

  it("falls back to direct template request when not using audioUrl or pcm chunks", async () => {
    const request = createRequest({
      audio: {
        format: "wav",
        sampleRate: 16000,
        byteLength: 0,
        durationSec: 0,
        base64: "",
      },
    });
    const runtime = { template: { id: "tpl-asr" }, environment: "prod" } as any;
    const progress = createProgressCollector();

    mocks.executeTemplate.mockResolvedValueOnce({ value: "direct transcript" });

    const text = await it_transcribeAudio(
      request,
      { provider: "template" },
      runtime,
      progress.report as any,
    );

    expect(text).toBe("direct transcript");
    expect(mocks.logTemplateRequest).toHaveBeenCalledWith(
      "asr_transcription",
      runtime,
      expect.objectContaining({
        audio: expect.objectContaining({ format: "wav" }),
      }),
      { stream: false, timeoutSec: 30 },
    );
    expect(mocks.transcribePcmWithChunks).not.toHaveBeenCalled();
    expect(progress.events.some((item) => item.progress === 25)).toBe(true);
  });

  it("logs template error and rethrows on template execution failure", async () => {
    const request = createRequest();
    const runtime = { template: { id: "tpl-asr" }, environment: "prod" } as any;

    mocks.buildAsrTemplateVars.mockReturnValue({
      vars: {
        audioFile: "AQIDBAUG",
        audio: {
          format: "wav",
          rate: 16000,
          sampleRate: 16000,
          channel: 1,
          byteLength: 24,
        },
        asr: {
          lang: "zh",
          dev_pid: 1537,
          language: "zh",
          devPid: 1537,
        },
      },
      runtimeConfig: {
        devPid: 1537,
        language: "zh",
        timeoutSec: 30,
        maxRetries: 1,
      },
      maxChunkSec: 50,
      maxConcurrency: 1,
      audioUrl: "https://example.com/error.wav",
    });
    mocks.executeTemplate.mockRejectedValueOnce(new Error("template failed"));

    await expect(
      it_transcribeAudio(request, { provider: "template" }, runtime, vi.fn()),
    ).rejects.toThrow("template failed");
    expect(mocks.logTemplateError).toHaveBeenCalledWith(
      "asr_transcription",
      runtime,
      expect.any(Error),
    );
  });
});
