import { describe, expect, it, vi } from "vitest";
import {
  it_buildHostRunSteps,
  it_computeHostOverallProgress,
  it_handleHostAnalyze,
  it_hostIdleForWarmup,
  it_runHostEmbeddingWarmup,
  it_scheduleHostEmbeddingWarmup,
  it_updateHostEmbeddingWarmup,
  it_updateHostProgress,
} from "./it_extensionRuntime";

describe("it_extensionRuntime", () => {
  it("delegates progress and warmup sync helpers", () => {
    const deps = {
      handleAnalyze: vi.fn(),
      isIdleForWarmup: vi.fn(() => true),
      runEmbeddingWarmup: vi.fn(),
      scheduleEmbeddingWarmup: vi.fn(),
      buildRunSteps: vi.fn(() => [{ id: "init", status: "success", progress: 100 }]),
      computeOverallProgress: vi.fn(() => 88),
      updateEmbeddingWarmupState: vi.fn(),
      updateProgress: vi.fn(),
    } as any;

    const steps = it_buildHostRunSteps(deps);
    expect(steps).toHaveLength(1);
    expect(it_computeHostOverallProgress(steps, deps)).toBe(88);

    const warmupHost = {} as any;
    it_updateHostEmbeddingWarmup(warmupHost, { status: "running" }, deps);
    it_updateHostProgress(
      warmupHost,
      { step: "asr", progress: 12, status: "running" },
      deps,
    );
    expect(it_hostIdleForWarmup(warmupHost, deps)).toBe(true);
    it_scheduleHostEmbeddingWarmup(warmupHost, "test", 123, deps);

    expect(deps.buildRunSteps).toHaveBeenCalledTimes(1);
    expect(deps.computeOverallProgress).toHaveBeenCalledWith(steps);
    expect(deps.updateEmbeddingWarmupState).toHaveBeenCalledWith(warmupHost, { status: "running" });
    expect(deps.updateProgress).toHaveBeenCalledWith(warmupHost, {
      step: "asr",
      progress: 12,
      status: "running",
    });
    expect(deps.isIdleForWarmup).toHaveBeenCalledWith(warmupHost);
    expect(deps.scheduleEmbeddingWarmup).toHaveBeenCalledWith(warmupHost, "test", 123);
  });

  it("delegates async run and analyze helpers", async () => {
    const deps = {
      handleAnalyze: vi.fn(async () => ({ transcript: "ok" })),
      isIdleForWarmup: vi.fn(),
      runEmbeddingWarmup: vi.fn(async () => undefined),
      scheduleEmbeddingWarmup: vi.fn(),
      buildRunSteps: vi.fn(),
      computeOverallProgress: vi.fn(),
      updateEmbeddingWarmupState: vi.fn(),
      updateProgress: vi.fn(),
    } as any;

    const host = {} as any;
    const request = { audio: { format: "pcm", sampleRate: 16000, byteLength: 1, durationSec: 0.1, base64: "" } } as any;

    await it_runHostEmbeddingWarmup(host, "startup", deps);
    const response = await it_handleHostAnalyze(host, request, deps);

    expect(deps.runEmbeddingWarmup).toHaveBeenCalledWith(host, "startup");
    expect(deps.handleAnalyze).toHaveBeenCalledWith(host, request);
    expect(response).toEqual({ transcript: "ok" });
  });
});
