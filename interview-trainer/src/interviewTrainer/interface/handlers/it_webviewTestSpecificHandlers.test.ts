import { beforeEach, describe, expect, it, vi } from "vitest";

const useCaseMocks = vi.hoisted(() => ({
  testAsr: vi.fn(),
  testEmbedding: vi.fn(),
  testLlm: vi.fn(),
}));

const helperMocks = vi.hoisted(() => ({
  emitLlmTestRequest: vi.fn(),
}));

vi.mock("../../application/useCases/it_testAsr", () => ({
  it_testAsr: useCaseMocks.testAsr,
}));

vi.mock("../../application/useCases/it_testEmbedding", () => ({
  it_testEmbedding: useCaseMocks.testEmbedding,
}));

vi.mock("../../application/useCases/it_testLlm", () => ({
  it_testLlm: useCaseMocks.testLlm,
}));

vi.mock("./it_webviewTestHelpers", () => ({
  it_emitLlmTestRequest: helperMocks.emitLlmTestRequest,
}));

import { it_registerAsrTestHandler } from "./it_webviewTestAsrHandlers";
import { it_registerEmbeddingTestHandler } from "./it_webviewTestEmbeddingHandlers";
import { it_registerLlmTestHandler } from "./it_webviewTestLlmHandlers";

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

describe("it_webview test-specific handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers and runs ASR test handler with host trace callback", async () => {
    const protocol = new FakeProtocol();
    const host = {
      webviewProtocol: protocol,
      logCorpusTrace: vi.fn(),
    } as any;

    useCaseMocks.testAsr.mockImplementation(async ({ payload, onTrace }: any) => {
      expect(payload).toEqual({ provider: "asr-a" });
      onTrace("asr test trace", { status: "ok" });
      return { ok: true };
    });

    it_registerAsrTestHandler(host);
    const result = await protocol.emit("it/testAsr", { provider: "asr-a" });

    expect(result).toEqual({ ok: true });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("asr test trace", { status: "ok" });
  });

  it("registers and runs embedding test handler with failure callback", async () => {
    const protocol = new FakeProtocol();
    const host = {
      webviewProtocol: protocol,
      logCorpusTrace: vi.fn(),
      logEmbeddingTestFailure: vi.fn(),
    } as any;

    useCaseMocks.testEmbedding.mockImplementation(async ({ payload, onFailure, onTrace }: any) => {
      expect(payload).toEqual({ provider: "embed-a" });
      onTrace("embedding test trace", { status: "ok" });
      onFailure(new Error("embedding failed"));
      return { ok: false };
    });

    it_registerEmbeddingTestHandler(host);
    const result = await protocol.emit("it/testEmbedding", { provider: "embed-a" });

    expect(result).toEqual({ ok: false });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("embedding test trace", {
      status: "ok",
    });
    expect(host.logEmbeddingTestFailure).toHaveBeenCalledTimes(1);
  });

  it("registers and runs llm test handler with request emit + failure callback", async () => {
    const protocol = new FakeProtocol();
    const host = {
      webviewProtocol: protocol,
      logCorpusTrace: vi.fn(),
      logLlmTestFailure: vi.fn(),
      outputChannel: { show: vi.fn() },
      traceLogsEnabled: false,
      configBundle: {},
    } as any;

    useCaseMocks.testLlm.mockImplementation(
      async ({ payload, onEmitRequest, onFailure, onTrace }: any) => {
        expect(payload).toEqual({ provider: "llm-a" });
        onEmitRequest({ model: "gpt-4o-mini" });
        onTrace("llm test trace", { status: "ok" });
        onFailure(new Error("llm failed"), { stage: "send" });
        return { ok: true };
      },
    );

    it_registerLlmTestHandler(host);
    const result = await protocol.emit("it/testLlm", { provider: "llm-a" });

    expect(result).toEqual({ ok: true });
    expect(helperMocks.emitLlmTestRequest).toHaveBeenCalledWith(host, {
      model: "gpt-4o-mini",
    });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("llm test trace", { status: "ok" });
    expect(host.logLlmTestFailure).toHaveBeenCalledWith(expect.any(Error), {
      stage: "send",
    });
  });
});

