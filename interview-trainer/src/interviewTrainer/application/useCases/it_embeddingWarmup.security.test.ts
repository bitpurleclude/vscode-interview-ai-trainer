import { beforeEach, describe, expect, it, vi } from "vitest";
import { it_runEmbeddingWarmup } from "./it_embeddingWarmup";

const mocks = vi.hoisted(() => ({
  resolveBindingTemplate: vi.fn(),
  buildCorpusAsync: vi.fn(),
  prepareEmbeddingCache: vi.fn(),
}));

vi.mock("../services/it_templateGateway", () => ({
  it_resolveBindingTemplate: mocks.resolveBindingTemplate,
}));

vi.mock("../services/it_notesGateway", () => ({
  it_buildCorpusAsync: mocks.buildCorpusAsync,
  it_prepareEmbeddingCache: mocks.prepareEmbeddingCache,
}));

vi.mock("../services/it_textGateway", () => ({
  it_hashText: () => "hash",
}));

vi.mock("../services/it_configSnapshot", () => ({
  it_normalizeWorkspaceKey: (value: string) => value,
}));

function createHost(concurrency: number) {
  const configBundle: any = {
    skill: {
      retrieval: {
        enabled: true,
        mode: "vector",
        embedding_max_concurrency: concurrency,
        vector: {
          provider: "mock",
          base_url: "https://example.com",
          api_key: "key",
          model: "model",
        },
      },
      workspace: {
        notes_dir: "notes",
      },
    },
    api: {
      active: {
        environment: "prod",
      },
    },
    templates: {
      version: 1,
      environments: {},
    },
    providers: {},
  };

  return {
    context: {
      globalStorageUri: {
        fsPath: "/cache",
      },
    },
    state: {
      recordingState: "idle",
      steps: [],
    },
    configBundle,
    configService: {
      loadBundle: () => configBundle,
      ensureTemplatesConfig: async () => configBundle,
    },
    embeddingWarmupTimer: null,
    embeddingWarmupAbort: null,
    embeddingWarmupRunning: false,
    corpusDirty: false,
    corpusDirtyFiles: new Set<string>(),
    updateEmbeddingWarmup: vi.fn(),
    logCorpusTrace: vi.fn(),
    requireWorkspaceRoot: () => "/workspace",
    isIdleForWarmup: () => true,
    scheduleEmbeddingWarmup: vi.fn(),
  } as any;
}

describe("it_embeddingWarmup security", () => {
  beforeEach(() => {
    mocks.resolveBindingTemplate.mockReset();
    mocks.buildCorpusAsync.mockReset();
    mocks.prepareEmbeddingCache.mockReset();

    mocks.resolveBindingTemplate.mockReturnValue({ id: "embedding-template" });
    mocks.buildCorpusAsync.mockResolvedValue([
      {
        kind: "notes",
        source: "a.md",
        text: "hello",
      },
    ]);
    mocks.prepareEmbeddingCache.mockResolvedValue({
      total: 1,
      created: 1,
      cached: 0,
      aborted: false,
    });
  });

  it("caps excessive warmup concurrency to a safe upper bound", async () => {
    const host = createHost(9999);

    await it_runEmbeddingWarmup(host, "security-test");

    expect(mocks.prepareEmbeddingCache).toHaveBeenCalledTimes(1);
    const options = mocks.prepareEmbeddingCache.mock.calls[0][2];
    expect(options.maxConcurrency).toBeLessThanOrEqual(256);
    expect(options.maxConcurrency).toBeGreaterThanOrEqual(1);
  });

  it("normalizes non-positive warmup concurrency to at least one worker", async () => {
    const host = createHost(0);

    await it_runEmbeddingWarmup(host, "security-test");

    expect(mocks.prepareEmbeddingCache).toHaveBeenCalledTimes(1);
    const options = mocks.prepareEmbeddingCache.mock.calls[0][2];
    expect(options.maxConcurrency).toBe(1);
  });
});
