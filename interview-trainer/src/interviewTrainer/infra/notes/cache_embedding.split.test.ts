import { beforeEach, describe, expect, it, vi } from "vitest";
import { it_embedTexts } from "./cache_embedding";

const mocks = vi.hoisted(() => ({
  requestEmbeddings: vi.fn(),
}));

vi.mock("../clients/embeddingClient", () => ({
  it_requestEmbeddings: mocks.requestEmbeddings,
}));

const BASE_CONFIG = {
  provider: "mock",
  apiKey: "key",
  baseUrl: "https://example.com",
  model: "mock-model",
  timeoutSec: 30,
  maxRetries: 1,
  batchSize: 256,
  queryMaxChars: 1500,
};

describe("it_embedTexts split threshold", () => {
  beforeEach(() => {
    mocks.requestEmbeddings.mockReset();
    mocks.requestEmbeddings.mockImplementation(async (_cfg: unknown, texts: string[]) =>
      texts.map((text) => [text.length]),
    );
  });

  it("splits oversized embedding requests into multiple sub-requests", async () => {
    const texts = new Array(10).fill(0).map((_, idx) => `text-${idx}`);

    const vectors = await it_embedTexts(
      {
        ...BASE_CONFIG,
        embeddingRequestSplitThreshold: 4,
      },
      texts,
    );

    expect(mocks.requestEmbeddings).toHaveBeenCalledTimes(3);
    expect(mocks.requestEmbeddings.mock.calls[0][1]).toHaveLength(4);
    expect(mocks.requestEmbeddings.mock.calls[1][1]).toHaveLength(4);
    expect(mocks.requestEmbeddings.mock.calls[2][1]).toHaveLength(2);
    expect(vectors).toHaveLength(10);
  });

  it("keeps single-call behavior when request size is within threshold", async () => {
    const texts = ["a", "bb", "ccc"];

    const vectors = await it_embedTexts(
      {
        ...BASE_CONFIG,
        embeddingRequestSplitThreshold: 8,
      },
      texts,
    );

    expect(mocks.requestEmbeddings).toHaveBeenCalledTimes(1);
    expect(vectors).toHaveLength(3);
  });
});
