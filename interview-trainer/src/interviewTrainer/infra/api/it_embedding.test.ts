import { describe, expect, it, vi } from "vitest";
import type { ItApiTemplate } from "../../../protocol/interviewTrainer";
import { it_callEmbedding } from "./it_embedding";
import { it_executeTemplate } from "./it_templateExecutor";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

vi.mock("./it_templateExecutor", () => ({
  it_executeTemplate: vi.fn(),
}));

function createTemplate(url: string): ItApiTemplate {
  return {
    id: "embedding:test-template",
    name: "Embedding Test Template",
    category: "embedding",
    request: {
      method: "POST",
      url,
      body: {
        model: "{{model}}",
        input: "{{embeddingInputs}}",
      },
    },
    response: {
      mode: "json",
      jsonPath: "data",
    },
  };
}

function createConfig(template: ItApiTemplate) {
  return {
    provider: "volc_doubao",
    apiKey: "test-key",
    baseUrl: "https://ark.cn-beijing.volces.com",
    model: "doubao-embedding-vision-250615",
    timeoutSec: 30,
    maxRetries: 1,
    template,
    templateEnv: "prod",
    templateContext: {} as any,
  };
}

describe("it_callEmbedding template fan-out", () => {
  it("fans out multimodal template calls for multiple inputs", async () => {
    const executeTemplateMock = vi.mocked(it_executeTemplate);
    executeTemplateMock.mockReset();
    executeTemplateMock
      .mockResolvedValueOnce({
        raw: { data: { embedding: [1, 2, 3] } },
        value: undefined,
      } as any)
      .mockResolvedValueOnce({
        raw: { data: { embedding: [4, 5, 6] } },
        value: undefined,
      } as any);

    const template = createTemplate(
      "https://ark.cn-beijing.volces.com/api/v3/embeddings/multimodal",
    );
    const vectors = await it_callEmbedding(createConfig(template), ["ping-a", "ping-b"]);

    expect(vectors).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
    expect(executeTemplateMock).toHaveBeenCalledTimes(2);

    const firstCall = executeTemplateMock.mock.calls[0]?.[0] as any;
    const secondCall = executeTemplateMock.mock.calls[1]?.[0] as any;
    expect(firstCall.variables.embeddingInput).toBe("ping-a");
    expect(firstCall.variables.embeddingInputs).toEqual([{ type: "text", text: "ping-a" }]);
    expect(secondCall.variables.embeddingInput).toBe("ping-b");
    expect(secondCall.variables.embeddingInputs).toEqual([{ type: "text", text: "ping-b" }]);
  });

  it("falls back to fan-out when template batch response returns a single vector", async () => {
    const executeTemplateMock = vi.mocked(it_executeTemplate);
    executeTemplateMock.mockReset();
    executeTemplateMock
      .mockResolvedValueOnce({
        raw: { data: { embedding: [9, 9, 9] } },
        value: undefined,
      } as any)
      .mockResolvedValueOnce({
        raw: { data: { embedding: [11, 12] } },
        value: undefined,
      } as any)
      .mockResolvedValueOnce({
        raw: { data: { embedding: [21, 22] } },
        value: undefined,
      } as any);

    const template = createTemplate("https://example.com/embeddings");
    const cfg = {
      ...createConfig(template),
      model: "text-embedding-v1",
    };
    const vectors = await it_callEmbedding(cfg, ["foo", "bar"]);

    expect(vectors).toEqual([
      [11, 12],
      [21, 22],
    ]);
    expect(executeTemplateMock).toHaveBeenCalledTimes(3);

    const batchCall = executeTemplateMock.mock.calls[0]?.[0] as any;
    expect(batchCall.variables.embeddingInput).toEqual(["foo", "bar"]);
    expect(batchCall.variables.embeddingInputs).toEqual([
      { type: "text", text: "foo" },
      { type: "text", text: "bar" },
    ]);
  });
});
