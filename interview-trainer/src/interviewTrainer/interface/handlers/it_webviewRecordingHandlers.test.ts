import { beforeEach, describe, expect, it, vi } from "vitest";

const useCaseMocks = vi.hoisted(() => ({
  startNativeRecording: vi.fn(),
  stopNativeRecording: vi.fn(),
  listNativeInputs: vi.fn(),
  convertAudioToPcm: vi.fn(),
}));

vi.mock("../../application/useCases/it_recordingActions", () => ({
  it_startNativeRecordingFromWebview: useCaseMocks.startNativeRecording,
  it_stopNativeRecordingFromWebview: useCaseMocks.stopNativeRecording,
  it_listNativeInputsFromWebview: useCaseMocks.listNativeInputs,
  it_convertAudioToPcmFromWebview: useCaseMocks.convertAudioToPcm,
}));

import { it_registerRecordingHandlers } from "./it_webviewRecordingHandlers";

type FakeMessage = {
  messageType: string;
  data?: unknown;
};

class FakeProtocol {
  private handlers = new Map<string, (msg: FakeMessage) => Promise<unknown> | unknown>();

  on(messageType: string, handler: (msg: FakeMessage) => Promise<unknown> | unknown): void {
    this.handlers.set(messageType, handler);
  }

  async emit(messageType: string, data?: unknown): Promise<unknown> {
    const handler = this.handlers.get(messageType);
    if (!handler) {
      throw new Error(`missing handler for ${messageType}`);
    }
    return await handler({ messageType, data });
  }
}

function createHost(protocol: FakeProtocol) {
  return {
    webviewProtocol: protocol,
    availableInputs: ["mic"],
    detectedInput: "mic",
    it_findFfmpeg: vi.fn(async () => "/usr/bin/ffmpeg"),
    it_listInputs: vi.fn(async () => ["mic", "loopback"]),
    it_startNativeRecording: vi.fn(async () => ({
      tmpDir: "/tmp",
      tmpPath: "/tmp/recording.wav",
      startedAt: Date.now(),
    })),
    it_stopNativeRecording: vi.fn(async () => ({
      audio: { path: "/tmp/recording.wav" },
    })),
    logCorpusTrace: vi.fn(),
  } as any;
}

describe("it_webviewRecordingHandlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts native recording with mapped context methods", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.startNativeRecording.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ device: "mic" });
      await context.findFfmpeg();
      await context.listInputs("/usr/bin/ffmpeg");
      await context.startNativeRecording("mic");
      context.resetNativeInputs();
      context.logCorpusTrace("recording start", { ok: true });
      return { started: true };
    });

    it_registerRecordingHandlers(host);
    const result = await protocol.emit("it/startNativeRecording", { device: "mic" });

    expect(result).toEqual({ started: true });
    expect(host.it_findFfmpeg).toHaveBeenCalledTimes(1);
    expect(host.it_listInputs).toHaveBeenCalledWith("/usr/bin/ffmpeg");
    expect(host.it_startNativeRecording).toHaveBeenCalledWith("mic");
    expect(host.logCorpusTrace).toHaveBeenCalledWith("recording start", { ok: true });
    expect(host.availableInputs).toBeNull();
    expect(host.detectedInput).toBeNull();
  });

  it("stops native recording", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.stopNativeRecording.mockImplementation(async ({ context }: any) => {
      return await context.stopNativeRecording();
    });

    it_registerRecordingHandlers(host);
    const result = await protocol.emit("it/stopNativeRecording");

    expect(result).toEqual({
      audio: { path: "/tmp/recording.wav" },
    });
    expect(host.it_stopNativeRecording).toHaveBeenCalledTimes(1);
  });

  it("lists native inputs", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.listNativeInputs.mockImplementation(async ({ context, payload }: any) => {
      expect(payload).toEqual({ refresh: true });
      await context.findFfmpeg();
      return await context.listInputs("/usr/bin/ffmpeg");
    });

    it_registerRecordingHandlers(host);
    const result = await protocol.emit("it/listNativeInputs", { refresh: true });

    expect(result).toEqual(["mic", "loopback"]);
    expect(host.it_findFfmpeg).toHaveBeenCalledTimes(1);
    expect(host.it_listInputs).toHaveBeenCalledWith("/usr/bin/ffmpeg");
  });

  it("converts audio to pcm", async () => {
    const protocol = new FakeProtocol();
    const host = createHost(protocol);

    useCaseMocks.convertAudioToPcm.mockResolvedValue({
      pcmPath: "/tmp/converted.pcm",
    });

    it_registerRecordingHandlers(host);
    const result = await protocol.emit("it/convertAudioToPcm", {
      path: "/tmp/input.wav",
    });

    expect(result).toEqual({ pcmPath: "/tmp/converted.pcm" });
    expect(useCaseMocks.convertAudioToPcm).toHaveBeenCalledTimes(1);
  });
});

