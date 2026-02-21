import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const workspace = {
    workspaceFolders: [] as any[],
    createFileSystemWatcher: vi.fn(),
  };

  return {
    workspace,
    RelativePattern: vi.fn((base: string, pattern: string) => ({ base, pattern })),
    hashText: vi.fn(),
    collectGuardrailIssues: vi.fn(),
  };
});

vi.mock("vscode", () => ({
  workspace: mocks.workspace,
  RelativePattern: mocks.RelativePattern,
}));

vi.mock("./it_textGateway", () => ({
  it_hashText: mocks.hashText,
}));

vi.mock("./it_guardrails", () => ({
  it_collectGuardrailNormalizationIssues: mocks.collectGuardrailIssues,
}));

import {
  it_buildConfigSnapshot,
  it_normalizeWorkspaceKey,
  it_refreshConfigSnapshot,
  it_updateCorpusWatchers,
  type ItConfigSnapshotHost,
} from "./it_configSnapshot";

function createConfigBundle() {
  return {
    api: {
      version: 1,
      active: {
        environment: "prod",
        llm: "openai",
        asr: "baidu_vop",
        acoustic: "api",
      },
      environments: {
        prod: {
          llm: {
            provider: "openai",
            api_key: "env-key",
            base_url: "https://api.example.com",
            model: "gpt-4o-mini",
            temperature: 0.6,
          },
          asr: {
            provider: "mock",
            mock_text: "hello",
          },
          llm_profiles: {
            profileA: {
              provider: "openai",
            },
          },
          asr_profiles: {
            profileAsr: {
              provider: "mock",
            },
          },
        },
      },
    },
    templates: {
      version: 1,
      environments: {
        prod: {
          templates: {
            tplA: {
              id: "tplA",
              name: "Template A",
              category: "llm",
              request: {
                headers: {
                  Authorization: "Bearer {{apiKey}}",
                },
                body: {
                  model: "{{model}}",
                  custom: "{{customVar}}",
                },
              },
              response: {},
            },
          },
          bindings: {
            llm: {
              evaluation: "tplA",
            },
            asr: {},
            embedding: {},
          },
          secrets: ["SECRET_A"],
          param_options: {
            reasoning_effort: ["low", "medium"],
          },
        },
      },
    },
    skill: {
      sessions_dir: "sessions",
      prompts: {
        evaluation_prompt: "eval prompt",
      },
      llm_tasks: {
        evaluation: "profileA",
      },
      evaluation: {
        answer_mode: "two-step",
      },
      topics: {
        title_mode: "llm",
        max_title_len: 20,
      },
      streaming: {
        enabled: true,
        auto_collapse: true,
        preview_chars: 150,
      },
      retrieval: {
        mode: "vector",
        top_k: 4,
        vector: {
          provider: "volc_doubao",
          api_key: "vector-key",
        },
      },
      workspace: {
        notes_dir: "inputs/notes",
        prompts_dir: "inputs/prompts",
        rubrics_dir: "inputs/rubrics",
        knowledge_dir: "inputs/knowledge",
        examples_dir: "inputs/examples",
      },
    },
    providers: {
      openai: {
        llm: {
          api_key: "provider-key",
        },
      },
    },
    guardrails: {},
  } as any;
}

function createHost(overrides: Partial<ItConfigSnapshotHost> = {}) {
  const configBundle = createConfigBundle();
  const host = {
    context: {
      globalStorageUri: { fsPath: "C:\\storage" },
      subscriptions: [] as any[],
    } as any,
    configBundle,
    configSnapshot: {} as any,
    configService: {
      loadBundle: vi.fn(() => configBundle),
      ensureTemplatesConfig: vi.fn(async (bundle: any) => bundle),
      saveSkillConfig: vi.fn(),
    } as any,
    corpusWatchers: [] as any[],
    corpusDirty: false,
    corpusDirtyFiles: new Set<string>(),
    resolveApiConfigWithProviders: vi.fn((api: any) => api),
    tokenService: {
      getSnapshot: vi.fn(() => ({ tokens: [] })),
      sync: vi.fn(),
    },
    logCorpusTrace: vi.fn(),
    ...overrides,
  } as ItConfigSnapshotHost;
  return host;
}

function createWatcher() {
  let onCreate: ((uri: any) => void) | undefined;
  let onChange: ((uri: any) => void) | undefined;
  let onDelete: ((uri: any) => void) | undefined;
  return {
    watcher: {
      onDidCreate: vi.fn((cb: (uri: any) => void) => {
        onCreate = cb;
      }),
      onDidChange: vi.fn((cb: (uri: any) => void) => {
        onChange = cb;
      }),
      onDidDelete: vi.fn((cb: (uri: any) => void) => {
        onDelete = cb;
      }),
      dispose: vi.fn(),
    },
    triggerCreate: (uri: any) => onCreate?.(uri),
    triggerChange: (uri: any) => onChange?.(uri),
    triggerDelete: (uri: any) => onDelete?.(uri),
  };
}

describe("it_configSnapshot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.workspace.workspaceFolders = [];
    mocks.hashText.mockReturnValue("ws-hash");
    mocks.collectGuardrailIssues.mockReturnValue([]);
    mocks.workspace.createFileSystemWatcher.mockReset();
  });

  it("normalizes workspace keys deterministically", () => {
    const key = it_normalizeWorkspaceKey("D:\\WORKSPACE\\project");
    if (process.platform === "win32") {
      expect(key).toBe("d:\\workspace\\project");
    } else {
      expect(key).toContain("WORKSPACE");
    }
  });

  it("builds snapshot with templates, cache dirs, and usage metadata", () => {
    mocks.workspace.workspaceFolders = [{ uri: { fsPath: "D:\\workspace" } }];
    const host = createHost();

    const snapshot = it_buildConfigSnapshot(host, host.configBundle.api);

    expect(snapshot.activeEnvironment).toBe("prod");
    expect(snapshot.templates.templates).toHaveLength(1);
    expect(snapshot.templates.secretNames).toEqual(["SECRET_A"]);
    expect(snapshot.templates.paramUsage.tplA.used).toContain("apiKey");
    expect(snapshot.templates.paramUsage.tplA.unknown).toContain("customVar");
    expect(snapshot.retrievalCache.embeddingCacheDir).toContain("ws-hash");
    expect(snapshot.streaming.previewChars).toBe(150);
    expect(snapshot.llm.model).toBe("gpt-4o-mini");
    expect(host.tokenService?.getSnapshot).toHaveBeenCalledWith("prod");
  });

  it("resets existing watchers and skips setup when workspace is missing", () => {
    const oldWatcher = { dispose: vi.fn() };
    const host = createHost({
      corpusWatchers: [oldWatcher as any],
    });

    it_updateCorpusWatchers(host);

    expect(oldWatcher.dispose).toHaveBeenCalledTimes(1);
    expect(host.corpusWatchers).toHaveLength(0);
    expect(
      (host.logCorpusTrace as any).mock.calls.some(
        (call: any[]) => call[0] === "corpus_watchers setup skipped",
      ),
    ).toBe(true);
  });

  it("creates watchers for configured workspace dirs and marks corpus dirty on events", () => {
    mocks.workspace.workspaceFolders = [{ uri: { fsPath: "D:\\workspace" } }];
    const host = createHost();
    const watcherA = createWatcher();
    const watcherB = createWatcher();
    const watcherC = createWatcher();
    const watcherD = createWatcher();
    const watcherE = createWatcher();
    const watcherQueue = [watcherA, watcherB, watcherC, watcherD, watcherE];
    mocks.workspace.createFileSystemWatcher.mockImplementation(
      () => watcherQueue.shift()?.watcher,
    );

    it_updateCorpusWatchers(host);
    watcherA.triggerCreate({ fsPath: "D:\\workspace\\inputs\\notes\\n1.md" });

    expect(mocks.workspace.createFileSystemWatcher).toHaveBeenCalledTimes(5);
    expect(host.corpusWatchers).toHaveLength(5);
    expect(host.context.subscriptions).toHaveLength(5);
    expect(host.corpusDirty).toBe(true);
    expect(host.corpusDirtyFiles.size).toBe(1);
  });

  it("refreshes snapshot, migrates legacy workspace keys, and syncs token store", async () => {
    mocks.workspace.workspaceFolders = [{ uri: { fsPath: "D:\\workspace" } }];
    mocks.collectGuardrailIssues.mockReturnValue(["issue-1"]);
    mocks.workspace.createFileSystemWatcher.mockImplementation(() => ({
      onDidCreate: vi.fn(),
      onDidChange: vi.fn(),
      onDidDelete: vi.fn(),
      dispose: vi.fn(),
    }));
    const bundleWithLegacy = createConfigBundle();
    bundleWithLegacy.skill.notes_dir = "legacy/notes";
    delete bundleWithLegacy.skill.workspace;

    const configService = {
      loadBundle: vi
        .fn()
        .mockReturnValueOnce(bundleWithLegacy)
        .mockReturnValueOnce({
          ...bundleWithLegacy,
          skill: {
            ...bundleWithLegacy.skill,
            workspace: {
              notes_dir: "legacy/notes",
            },
          },
        }),
      ensureTemplatesConfig: vi.fn(async (bundle: any) => bundle),
      saveSkillConfig: vi.fn(),
    };
    const host = createHost({
      configService: configService as any,
      configBundle: bundleWithLegacy,
    });

    const snapshot = await it_refreshConfigSnapshot(host);

    expect(configService.saveSkillConfig).toHaveBeenCalledTimes(1);
    expect(host.tokenService?.sync).toHaveBeenCalledTimes(1);
    expect(host.resolveApiConfigWithProviders).toHaveBeenCalledTimes(1);
    expect(snapshot.activeEnvironment).toBe("prod");
    expect(host.configSnapshot).toEqual(snapshot);
    expect(
      (host.logCorpusTrace as any).mock.calls.some(
        (call: any[]) => call[0] === "guardrails normalization detected",
      ),
    ).toBe(true);
  });
});
