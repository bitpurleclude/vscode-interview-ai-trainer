import { beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  getLoggingGuardrailsFromConfig: vi.fn(),
  createOutputChannelLogSink: vi.fn(),
  createStructuredLogger: vi.fn(),
  loggerInfo: vi.fn(),
}));

vi.mock("../../application/services/it_guardrails", () => ({
  it_getLoggingGuardrailsFromConfig: dependencyMocks.getLoggingGuardrailsFromConfig,
}));

vi.mock("../../application/services/it_logSinkGateway", () => ({
  it_createOutputChannelLogSink: dependencyMocks.createOutputChannelLogSink,
}));

vi.mock("../../application/services/it_structuredLogger", () => ({
  it_createStructuredLogger: dependencyMocks.createStructuredLogger,
}));

import { it_emitLlmTestRequest } from "./it_webviewTestHelpers";

describe("it_webviewTestHelpers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dependencyMocks.getLoggingGuardrailsFromConfig.mockReturnValue({
      detailMaxChars: 100,
    });
    dependencyMocks.createOutputChannelLogSink.mockReturnValue({ sink: "output-channel" });
    dependencyMocks.createStructuredLogger.mockReturnValue({
      info: dependencyMocks.loggerInfo,
    });
  });

  it("shows output channel when logger emits a record", () => {
    dependencyMocks.loggerInfo.mockReturnValue({ id: "record-1" });
    const host = {
      outputChannel: { show: vi.fn() },
      traceLogsEnabled: true,
      configBundle: { guardrails: { logging: { detailMaxChars: 100 } } },
    } as any;

    it_emitLlmTestRequest(host, {
      model: "gpt-4o-mini",
      provider: "demo",
    });

    expect(dependencyMocks.getLoggingGuardrailsFromConfig).toHaveBeenCalledWith({
      logging: { detailMaxChars: 100 },
    });
    expect(dependencyMocks.createOutputChannelLogSink).toHaveBeenCalledWith(host.outputChannel);
    expect(dependencyMocks.createStructuredLogger).toHaveBeenCalledWith({
      sink: { sink: "output-channel" },
      traceLogsEnabled: true,
      guardrails: {
        detailMaxChars: 100,
      },
    });
    expect(dependencyMocks.loggerInfo).toHaveBeenCalledWith({
      event: "test.llm.request",
      layer: "interface",
      module: "it_webviewTestHelpers",
      message: "LLM test request",
      detail: {
        model: "gpt-4o-mini",
        provider: "demo",
      },
    });
    expect(host.outputChannel.show).toHaveBeenCalledWith(true);
  });

  it("does not show output channel when logger returns nullish record", () => {
    dependencyMocks.loggerInfo.mockReturnValue(undefined);
    const host = {
      outputChannel: { show: vi.fn() },
      traceLogsEnabled: false,
      configBundle: {},
    } as any;

    it_emitLlmTestRequest(host, { model: "gpt-4.1-mini" });

    expect(host.outputChannel.show).not.toHaveBeenCalled();
  });
});

