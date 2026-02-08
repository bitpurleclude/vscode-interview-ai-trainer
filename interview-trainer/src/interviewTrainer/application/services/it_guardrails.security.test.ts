import { describe, expect, it } from "vitest";
import {
  it_clampFloat,
  it_clampInteger,
  it_getLoggingGuardrailsFromConfig,
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

  it("normalizes logging guardrails and policy", () => {
    const logging = it_getLoggingGuardrailsFromConfig({
      version: 1,
      logging: {
        limits: {
          message_max_chars: 1,
          detail_max_chars: 999999,
          detail_max_depth: -3,
          detail_max_keys_per_object: 4096,
          detail_max_items_per_array: Number.NaN,
        },
        policy: {
          emit_error_when_trace_disabled: false,
        },
      },
    });

    expect(logging.limits.messageMaxChars).toBe(128);
    expect(logging.limits.detailMaxChars).toBe(200000);
    expect(logging.limits.detailMaxDepth).toBe(1);
    expect(logging.limits.detailMaxKeysPerObject).toBe(1024);
    expect(logging.limits.detailMaxItemsPerArray).toBe(64);
    expect(logging.policy.emitErrorWhenTraceDisabled).toBe(false);
  });
});
