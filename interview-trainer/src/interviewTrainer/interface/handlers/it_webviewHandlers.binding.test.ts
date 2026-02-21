import { describe, expect, it, vi } from "vitest";

const registerMocks = vi.hoisted(() => ({
  core: vi.fn(),
  clientTrace: vi.fn(),
  recording: vi.fn(),
  question: vi.fn(),
  retrieval: vi.fn(),
  config: vi.fn(),
  test: vi.fn(),
  result: vi.fn(),
}));

vi.mock("./it_webviewCoreHandlers", () => ({
  it_registerCoreHandlers: registerMocks.core,
}));

vi.mock("./it_webviewClientTraceHandlers", () => ({
  it_registerClientTraceHandlers: registerMocks.clientTrace,
}));

vi.mock("./it_webviewRecordingHandlers", () => ({
  it_registerRecordingHandlers: registerMocks.recording,
}));

vi.mock("./it_webviewQuestionHandlers", () => ({
  it_registerQuestionHandlers: registerMocks.question,
}));

vi.mock("./it_webviewRetrievalHandlers", () => ({
  it_registerRetrievalHandlers: registerMocks.retrieval,
}));

vi.mock("./it_webviewConfigHandlers", () => ({
  it_registerConfigHandlers: registerMocks.config,
}));

vi.mock("./it_webviewTestHandlers", () => ({
  it_registerTestHandlers: registerMocks.test,
}));

vi.mock("./it_webviewResultHandlers", () => ({
  it_registerResultHandlers: registerMocks.result,
}));

import { it_registerHandlers } from "./it_webviewHandlers";

describe("it_webviewHandlers", () => {
  it("registers all grouped handlers on the same host", () => {
    const host = { marker: "host" } as any;

    it_registerHandlers(host);

    expect(registerMocks.core).toHaveBeenCalledWith(host);
    expect(registerMocks.clientTrace).toHaveBeenCalledWith(host);
    expect(registerMocks.recording).toHaveBeenCalledWith(host);
    expect(registerMocks.question).toHaveBeenCalledWith(host);
    expect(registerMocks.retrieval).toHaveBeenCalledWith(host);
    expect(registerMocks.config).toHaveBeenCalledWith(host);
    expect(registerMocks.test).toHaveBeenCalledWith(host);
    expect(registerMocks.result).toHaveBeenCalledWith(host);
  });
});

