import { describe, expect, it } from "vitest";
import {
  it_clampFloat,
  it_clampInteger,
  it_getRetrievalGuardrailsFromConfig,
} from "./it_guardrails";

describe("it_guardrails security", () => {
  it("normalizes malformed retrieval ranges and caps split threshold", () => {
    const guardrails = it_getRetrievalGuardrailsFromConfig({
      version: 1,
      retrieval: {
        limits: {
          query_window_size: { min: 20, max: 8 },
          question_max_concurrency: { min: 10, max: 2 },
          kind_max_concurrency: { min: 5, max: 1 },
          vector_batch_size: { min: 16, max: 64 },
        },
        defaults: {
          query_window_size: 999,
          question_max_concurrency: -5,
          kind_max_concurrency: 999,
        },
        embedding_request_split_threshold: 999,
      },
    });

    expect(guardrails.queryWindowSize).toEqual({ min: 20, max: 20 });
    expect(guardrails.questionMaxConcurrency).toEqual({ min: 10, max: 10 });
    expect(guardrails.kindMaxConcurrency).toEqual({ min: 5, max: 5 });

    expect(guardrails.defaults.queryWindowSize).toBe(20);
    expect(guardrails.defaults.questionMaxConcurrency).toBe(10);
    expect(guardrails.defaults.kindMaxConcurrency).toBe(5);

    expect(guardrails.embeddingRequestSplitThreshold).toBe(64);
  });

  it("clamps integer and float values against poison numbers", () => {
    expect(it_clampInteger(Number.NaN, 8, { min: 1, max: 16 })).toBe(8);
    expect(it_clampInteger(Infinity, 8, { min: 1, max: 16 })).toBe(8);
    expect(it_clampInteger(-999, 8, { min: 1, max: 16 })).toBe(1);
    expect(it_clampInteger(999, 8, { min: 1, max: 16 })).toBe(16);

    expect(it_clampFloat(Number.NaN, 0.3, { min: 0, max: 1 })).toBe(0.3);
    expect(it_clampFloat(-10, 0.3, { min: 0, max: 1 })).toBe(0);
    expect(it_clampFloat(10, 0.3, { min: 0, max: 1 })).toBe(1);
  });
});
