import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLlmChatStreaming: vi.fn(),
  extractJsonPayload: vi.fn(),
  extractOutlineHeadings: vi.fn(),
  toOutlineArray: vi.fn(),
}));

vi.mock("./it_llmGateway", () => ({
  it_callLlmChatStreaming: mocks.callLlmChatStreaming,
}));

vi.mock("../../domain/evaluation/parser", () => ({
  it_extractJsonPayload: mocks.extractJsonPayload,
  it_extractOutlineHeadings: mocks.extractOutlineHeadings,
  it_toOutlineArray: mocks.toOutlineArray,
}));

import {
  it_canUseLlm,
  it_generateOutlines,
  it_generateRevisedByOutline,
} from "./it_evaluationLlm";

function createConfig(overrides: Record<string, unknown> = {}) {
  return {
    provider: "openai",
    apiKey: "test-key",
    baseUrl: "https://example.com/v1",
    model: "gpt-4o-mini",
    stream: true,
    maxRetries: 1,
    ...overrides,
  } as any;
}

describe("it_evaluationLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callLlmChatStreaming.mockResolvedValue("{}");
    mocks.extractJsonPayload.mockReturnValue({});
    mocks.extractOutlineHeadings.mockImplementation((lines: string[]) =>
      (Array.isArray(lines) ? lines : []).filter((line) => !line.startsWith("  ")),
    );
    mocks.toOutlineArray.mockImplementation((value: any) => {
      if (Array.isArray(value)) {
        return value.filter(Boolean);
      }
      if (typeof value === "string" && value.trim()) {
        return value
          .split(/\r?\n/)
          .map((item) => item.trim())
          .filter(Boolean);
      }
      return [];
    });
  });

  it("checks llm usability via template or apiKey", () => {
    expect(it_canUseLlm(createConfig({ apiKey: "k" }))).toBe(true);
    expect(it_canUseLlm(createConfig({ apiKey: "", template: { id: "tpl-1" } }))).toBe(true);
    expect(it_canUseLlm(createConfig({ apiKey: "", template: null }))).toBe(false);
  });

  it("returns null for generateOutlines when inputs are empty or llm unavailable", async () => {
    await expect(it_generateOutlines(createConfig(), [])).resolves.toBeNull();
    await expect(
      it_generateOutlines(createConfig({ apiKey: "", template: null }), [
        { question: "q1", original: "o1", revised: "r1" },
      ]),
    ).resolves.toBeNull();
    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
  });

  it("generates outlines and masks apiKey in trace payload", async () => {
    const traceEvents: Array<{ message: string; detail?: Record<string, unknown> }> = [];
    const streamEvents: Array<{ text: string; done?: boolean; reset?: boolean }> = [];

    mocks.callLlmChatStreaming.mockResolvedValueOnce('{"outlines":[{"outlineOriginal":"- A","outlineRevised":"- B"}]}');
    mocks.extractJsonPayload.mockReturnValue({
      outlines: [{ outlineOriginal: "- A", outlineRevised: "- B" }],
    });

    const result = await it_generateOutlines(
      createConfig({ apiKey: "secret-key" }),
      [{ question: "q1", original: "o1", revised: "r1" }],
      (message, detail) => traceEvents.push({ message, detail }),
      (update) => streamEvents.push(update),
    );

    expect(result).toEqual([
      {
        outlineOriginal: ["- A"],
        outlineRevised: ["- B"],
      },
    ]);
    expect(streamEvents[0]).toMatchObject({ reset: true });
    expect(streamEvents.at(-1)).toMatchObject({ done: true });
    const startTrace = traceEvents.find((item) =>
      item.message.includes("evaluation_llm generate_outlines start"),
    );
    expect(startTrace).toBeTruthy();
    expect((startTrace?.detail as any)?.config?.apiKey).toBe("***");
  });

  it("returns null for generateOutlines on parse-empty or llm exception", async () => {
    mocks.extractJsonPayload.mockReturnValue({ outlines: [] });
    await expect(
      it_generateOutlines(createConfig(), [{ question: "q1", original: "o1", revised: "r1" }]),
    ).resolves.toBeNull();

    mocks.callLlmChatStreaming.mockRejectedValueOnce(new Error("llm failed"));
    await expect(
      it_generateOutlines(createConfig(), [{ question: "q1", original: "o1", revised: "r1" }]),
    ).resolves.toBeNull();
  });

  it("returns null for generateRevisedByOutline when inputs invalid", async () => {
    await expect(it_generateRevisedByOutline(createConfig(), [])).resolves.toBeNull();
    await expect(
      it_generateRevisedByOutline(createConfig({ apiKey: "", template: null }), [
        { question: "q1", outlineRevised: ["- A"] },
      ]),
    ).resolves.toBeNull();
    expect(mocks.callLlmChatStreaming).not.toHaveBeenCalled();
  });

  it("generates revised answers from parsed answers list", async () => {
    mocks.callLlmChatStreaming.mockResolvedValueOnce(
      '{"answers":[{"revised":"answer-1"},{"revised":"answer-2"}]}',
    );
    mocks.extractJsonPayload.mockReturnValue({
      answers: [{ revised: "answer-1" }, { revised: "answer-2" }],
    });

    const result = await it_generateRevisedByOutline(
      createConfig(),
      [
        { question: "q1", outlineRevised: ["- A"] },
        { question: "q2", outlineRevised: ["- B"] },
      ],
      "demo prompt",
      "material text",
      ["bq1", "bq2"],
    );

    expect(mocks.extractOutlineHeadings).toHaveBeenCalled();
    expect(result).toEqual(["answer-1", "answer-2"]);
  });

  it("returns null for generateRevisedByOutline on parse-empty or llm exception", async () => {
    mocks.extractJsonPayload.mockReturnValue({ answers: [] });
    await expect(
      it_generateRevisedByOutline(createConfig(), [{ question: "q1", outlineRevised: ["- A"] }]),
    ).resolves.toBeNull();

    mocks.callLlmChatStreaming.mockRejectedValueOnce(new Error("llm down"));
    await expect(
      it_generateRevisedByOutline(createConfig(), [{ question: "q1", outlineRevised: ["- A"] }]),
    ).resolves.toBeNull();
  });
});
