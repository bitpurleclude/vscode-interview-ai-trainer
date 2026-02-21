import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  callEmbedding: vi.fn(),
}));

vi.mock("../services/it_embeddingGateway", () => ({
  it_callEmbedding: gatewayMocks.callEmbedding,
}));

import { it_testEmbedding } from "./it_testEmbedding";

describe("it_testEmbedding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when apiKey is missing", async () => {
    await expect(
      it_testEmbedding({
        payload: {
          embedding: {
            baseUrl: "https://example.com",
            model: "embed-model",
          },
        },
      }),
    ).rejects.toThrow("Missing Embedding API key.");
  });

  it("throws when baseUrl/model is missing", async () => {
    await expect(
      it_testEmbedding({
        payload: {
          embedding: {
            apiKey: "secret",
            baseUrl: "",
            model: "",
          },
        },
      }),
    ).rejects.toThrow("Embedding baseUrl/model is required.");
  });

  it("returns vector length and traces start/success", async () => {
    const onTrace = vi.fn();
    gatewayMocks.callEmbedding.mockResolvedValue([[0.1, 0.2, 0.3]]);

    const result = await it_testEmbedding({
      payload: {
        embedding: {
          provider: "openai_compatible",
          apiKey: "secret",
          baseUrl: "https://example.com",
          model: "text-embedding-3-large",
          timeoutSec: 20,
          maxRetries: 2,
        },
      },
      onTrace,
    });

    expect(result).toEqual({ ok: true, length: 3 });
    expect(gatewayMocks.callEmbedding).toHaveBeenCalledWith(
      {
        provider: "openai_compatible",
        apiKey: "secret",
        baseUrl: "https://example.com",
        model: "text-embedding-3-large",
        timeoutSec: 20,
        maxRetries: 2,
      },
      ["embedding test"],
    );
    expect(onTrace).toHaveBeenNthCalledWith(
      1,
      "test_embedding run start",
      expect.objectContaining({
        event: "application.test_embedding.run",
        status: "start",
        provider: "openai_compatible",
      }),
    );
    expect(onTrace).toHaveBeenNthCalledWith(
      2,
      "test_embedding run success",
      expect.objectContaining({
        event: "application.test_embedding.run",
        status: "success",
        provider: "openai_compatible",
        length: 3,
      }),
    );
  });

  it("calls onFailure and rethrows when embedding request fails", async () => {
    const onTrace = vi.fn();
    const onFailure = vi.fn();
    const error = new Error("embedding gateway down");
    gatewayMocks.callEmbedding.mockRejectedValue(error);

    await expect(
      it_testEmbedding({
        payload: {
          embedding: {
            provider: "volc_doubao",
            apiKey: "secret",
            baseUrl: "https://example.com",
            model: "embed-model",
          },
        },
        onTrace,
        onFailure,
      }),
    ).rejects.toThrow("embedding gateway down");

    expect(onFailure).toHaveBeenCalledWith(error);
    expect(onTrace).toHaveBeenNthCalledWith(
      2,
      "test_embedding run error",
      expect.objectContaining({
        event: "application.test_embedding.run",
        status: "error",
        provider: "volc_doubao",
        error: "embedding gateway down",
      }),
    );
  });
});

