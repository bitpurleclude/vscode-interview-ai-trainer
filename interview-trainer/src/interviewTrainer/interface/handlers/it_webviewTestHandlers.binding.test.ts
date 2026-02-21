import { describe, expect, it, vi } from "vitest";

const registerMocks = vi.hoisted(() => ({
  llm: vi.fn(),
  asr: vi.fn(),
  embedding: vi.fn(),
  templateTest: vi.fn(),
}));

vi.mock("./it_webviewTestLlmHandlers", () => ({
  it_registerLlmTestHandler: registerMocks.llm,
}));

vi.mock("./it_webviewTestAsrHandlers", () => ({
  it_registerAsrTestHandler: registerMocks.asr,
}));

vi.mock("./it_webviewTestEmbeddingHandlers", () => ({
  it_registerEmbeddingTestHandler: registerMocks.embedding,
}));

vi.mock("./it_webviewTemplateTestHandlers", () => ({
  it_registerTemplateTestHandlers: registerMocks.templateTest,
}));

import { it_registerTestHandlers } from "./it_webviewTestHandlers";

describe("it_webviewTestHandlers", () => {
  it("registers llm/asr/embedding/template-test handlers", () => {
    const host = { marker: "host" } as any;

    it_registerTestHandlers(host);

    expect(registerMocks.llm).toHaveBeenCalledWith(host);
    expect(registerMocks.asr).toHaveBeenCalledWith(host);
    expect(registerMocks.embedding).toHaveBeenCalledWith(host);
    expect(registerMocks.templateTest).toHaveBeenCalledWith(host);
  });
});

