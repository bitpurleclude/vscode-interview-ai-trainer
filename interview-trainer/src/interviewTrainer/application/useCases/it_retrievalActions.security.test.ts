import { describe, expect, it, vi } from "vitest";
import { it_updateRetrievalSettingsFromWebview } from "./it_retrievalActions";

function createContext() {
  const configBundle: any = {
    skill: {
      retrieval: {
        enabled: true,
        mode: "vector",
        top_k: 5,
        top_k_notes: 5,
        top_k_knowledge: 5,
        top_k_rubrics: 5,
        top_k_examples: 5,
        max_concurrency: 3,
        embedding_max_concurrency: 1,
        min_score: 0.2,
        vector: {
          batch_size: 16,
          query_max_chars: 1500,
        },
      },
    },
  };
  const context: any = {
    extensionContext: {},
    configService: {
      loadBundle: () => configBundle,
      saveSkillConfig: vi.fn((skill: unknown) => {
        configBundle.skill = skill as any;
      }),
    },
    refreshConfigSnapshot: vi.fn(async () => ({ refreshed: true } as any)),
    requireWorkspaceRoot: () => "",
    normalizeWorkspaceKey: (v: string) => v,
    scheduleEmbeddingWarmup: vi.fn(),
    updateEmbeddingWarmup: vi.fn(),
  };
  return { context, configBundle };
}

describe("it_retrievalActions security", () => {
  it("clamps malicious large numeric values", async () => {
    const { context, configBundle } = createContext();

    await it_updateRetrievalSettingsFromWebview({
      context,
      payload: {
        retrieval: {
          topK: 100000,
          topKNotes: 99999,
          topKKnowledge: 99999,
          topKRubrics: 99999,
          topKExamples: 99999,
          maxConcurrency: 999,
          embeddingMaxConcurrency: 999,
          minScore: 999,
          queryWindowSize: 999,
          questionMaxConcurrency: 999,
          kindMaxConcurrency: 999,
          vector: {
            batchSize: 999,
            queryMaxChars: 999999,
          },
        },
      },
    });

    const retrieval = configBundle.skill.retrieval;
    expect(retrieval.top_k).toBeLessThanOrEqual(50);
    expect(retrieval.top_k_notes).toBeLessThanOrEqual(50);
    expect(retrieval.top_k_knowledge).toBeLessThanOrEqual(50);
    expect(retrieval.top_k_rubrics).toBeLessThanOrEqual(50);
    expect(retrieval.top_k_examples).toBeLessThanOrEqual(50);
    expect(retrieval.max_concurrency).toBeLessThanOrEqual(1024);
    expect(retrieval.embedding_max_concurrency).toBeLessThanOrEqual(256);
    expect(retrieval.min_score).toBeLessThanOrEqual(1);
    expect(retrieval.query_window_size).toBeLessThanOrEqual(64);
    expect(retrieval.question_max_concurrency).toBeLessThanOrEqual(16);
    expect(retrieval.kind_max_concurrency).toBeLessThanOrEqual(4);
    expect(retrieval.vector.batch_size).toBeLessThanOrEqual(256);
    expect(retrieval.vector.query_max_chars).toBeLessThanOrEqual(4000);
  });

  it("rejects invalid negative or non-finite numeric values", async () => {
    const { context, configBundle } = createContext();

    await it_updateRetrievalSettingsFromWebview({
      context,
      payload: {
        retrieval: {
          topK: -3,
          maxConcurrency: Number.NaN,
          embeddingMaxConcurrency: 0,
          minScore: -2,
          queryWindowSize: -100,
          questionMaxConcurrency: 0,
          kindMaxConcurrency: Number.NaN,
          vector: {
            batchSize: -100,
            queryMaxChars: Number.POSITIVE_INFINITY,
          },
        },
      },
    });

    const retrieval = configBundle.skill.retrieval;
    expect(retrieval.top_k).toBeGreaterThanOrEqual(1);
    expect(retrieval.max_concurrency).toBeGreaterThanOrEqual(1);
    expect(retrieval.embedding_max_concurrency).toBeGreaterThanOrEqual(1);
    expect(retrieval.min_score).toBeGreaterThanOrEqual(0);
    expect(retrieval.query_window_size).toBeGreaterThanOrEqual(1);
    expect(retrieval.question_max_concurrency).toBeGreaterThanOrEqual(1);
    expect(retrieval.kind_max_concurrency).toBeGreaterThanOrEqual(1);
    expect(retrieval.vector.batch_size).toBeGreaterThanOrEqual(1);
    expect(retrieval.vector.query_max_chars).toBeGreaterThanOrEqual(64);
    expect(Number.isFinite(retrieval.max_concurrency)).toBe(true);
    expect(Number.isFinite(retrieval.vector.query_max_chars)).toBe(true);
  });
});
