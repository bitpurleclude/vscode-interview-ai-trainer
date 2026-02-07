import { describe, expect, it, vi } from "vitest";
import { it_prepareAnalysisRunDeps } from "./it_analysisRunConfig";

describe("it_prepareAnalysisRunDeps", () => {
  it("loads config, resolves provider profile, and builds run deps", async () => {
    const loadedBundle = {
      api: {
        version: 1,
        active: {
          environment: "prod",
          llm: "default",
          asr: "default",
          acoustic: "default",
        },
        environments: {
          prod: {
            asr: {
              timeout_sec: 60,
              dev_pid: 1537,
            },
          },
        },
      },
      templates: { version: 1, environments: { prod: {} } },
      skill: {
        asr: {
          language: "zh",
          concurrency: 1,
        },
      },
      providers: {
        default: { asr: { provider: "template" } },
      },
    } as any;

    const host = {
      context: { globalStorageUri: { fsPath: "cache-root" } } as any,
      configService: {
        loadBundle: vi.fn(() => loadedBundle),
        ensureTemplatesConfig: vi.fn(async (bundle) => bundle),
      } as any,
      configBundle: loadedBundle,
      corpusDirty: true,
      corpusDirtyFiles: new Set(["a.md", "b.md"]),
      analysisAbort: { aborted: false },
      updateProgress: vi.fn(),
      emitStreamUpdate: vi.fn(),
      emitEvaluationStreamUpdate: vi.fn(),
      logCorpusTrace: vi.fn(),
      requireWorkspaceRoot: vi.fn(() => "D:/workspace"),
      resolveApiConfigWithProviders: vi.fn((api) => ({ ...api, resolved: true })),
    };

    const onPartial = vi.fn();
    const deps = await it_prepareAnalysisRunDeps(host as any, onPartial as any);

    expect(host.configService.loadBundle).toHaveBeenCalledTimes(1);
    expect(host.configService.ensureTemplatesConfig).toHaveBeenCalledTimes(1);
    expect(host.resolveApiConfigWithProviders).toHaveBeenCalledTimes(1);
    expect(host.requireWorkspaceRoot).toHaveBeenCalledTimes(1);

    expect(deps.workspaceRoot).toBe("D:/workspace");
    expect((deps.apiConfig as any).resolved).toBe(true);
    expect(deps.templatesConfig).toBe(loadedBundle.templates);
    expect(deps.corpusDirty).toBe(true);
    expect(deps.corpusDirtyFiles).toEqual(["a.md", "b.md"]);
    expect(deps.abortSignal).toEqual({ aborted: false });

    expect(deps.skillConfig.providers).toEqual(loadedBundle.providers);
    expect(deps.skillConfig.asr).toEqual(
      expect.objectContaining({
        timeout_sec: 60,
        dev_pid: 1537,
        language: "zh",
        concurrency: 1,
      }),
    );

    deps.onProgress?.({ step: "asr", progress: 10 });
    deps.onStream?.({ step: "asr", text: "delta" });
    deps.onEvalStream?.({ questionIndex: 0, text: "score" });
    deps.onCorpusTrace?.("trace", { x: 1 });
    deps.onPartial?.({ transcript: "hello" } as any);

    expect(host.updateProgress).toHaveBeenCalledWith({ step: "asr", progress: 10 });
    expect(host.emitStreamUpdate).toHaveBeenCalledWith({ step: "asr", text: "delta" });
    expect(host.emitEvaluationStreamUpdate).toHaveBeenCalledWith({ questionIndex: 0, text: "score" });
    expect(host.logCorpusTrace).toHaveBeenCalledWith("trace", { x: 1 });
    expect(onPartial).toHaveBeenCalledWith({ transcript: "hello" });
  });
});
