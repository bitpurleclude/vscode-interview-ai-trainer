import { describe, expect, it, vi } from "vitest";
import { IT_STATUS_INIT } from "./it_progress";
import {
  it_applyAnalysisPartial,
  it_finishAnalysisSessionCanceled,
  it_finishAnalysisSessionError,
  it_finishAnalysisSessionSuccess,
  it_markAnalysisCorpusClean,
  it_startAnalysisSession,
} from "./it_analysisSessionState";

function createHost() {
  const updateState = vi.fn();
  const scheduleEmbeddingWarmup = vi.fn();
  return {
    state: {
      ...IT_STATUS_INIT,
      steps: IT_STATUS_INIT.steps.map((step) => ({ ...step })),
      draftTranscript: "old",
      draftDetailedTranscript: "old-detail",
    },
    analysisAbort: null as { aborted: boolean } | null,
    embeddingWarmupAbort: { aborted: false },
    corpusDirty: true,
    corpusDirtyFiles: new Set(["a.md"]),
    buildRunSteps: () => IT_STATUS_INIT.steps.map((step) => ({ ...step })),
    computeOverallProgress: vi.fn(() => 12),
    updateState,
    scheduleEmbeddingWarmup,
  };
}

describe("it_analysisSessionState", () => {
  it("starts analysis session and resets draft state", () => {
    const host = createHost();
    it_startAnalysisSession(host, "run-1");

    expect(host.embeddingWarmupAbort?.aborted).toBe(true);
    expect(host.analysisAbort).toEqual({ aborted: false });
    expect(host.updateState).toHaveBeenCalledTimes(1);

    const patch = host.updateState.mock.calls[0][0];
    expect(patch.statusMessage).toContain("run-1");
    expect(patch.overallProgress).toBe(12);
    expect(patch.steps.find((step: any) => step.id === "recording")?.status).toBe("success");
    expect(patch.steps.find((step: any) => step.id === "asr")?.status).toBe("running");
    expect(patch.draftTranscript).toBeUndefined();
  });

  it("applies partial updates and keeps previous values when partial is missing", () => {
    const host = createHost();
    it_applyAnalysisPartial(host, {
      transcript: "new-transcript",
      notes: [{ source: "a", snippet: "b", score: 0.1 }],
    });

    expect(host.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTranscript: "new-transcript",
        draftDetailedTranscript: "old-detail",
      }),
    );
  });

  it("marks corpus clean and finalizes success", () => {
    const host = createHost();
    host.state.steps = host.state.steps.map((step) =>
      step.id === "asr" ? { ...step, status: "running", progress: 10 } : step,
    );
    host.analysisAbort = { aborted: false };

    it_markAnalysisCorpusClean(host);
    expect(host.corpusDirty).toBe(false);
    expect(host.corpusDirtyFiles.size).toBe(0);

    it_finishAnalysisSessionSuccess(host, "done");
    expect(host.updateState).toHaveBeenCalledWith(
      expect.objectContaining({
        statusMessage: "done",
        overallProgress: 100,
      }),
    );
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("after-analysis", 3000);
    expect(host.analysisAbort).toBeNull();
  });

  it("marks running steps as error for cancel/error outcomes", () => {
    const host = createHost();
    host.state.steps = host.state.steps.map((step) =>
      step.id === "asr" ? { ...step, status: "running", progress: 77 } : step,
    );
    host.analysisAbort = { aborted: false };

    it_finishAnalysisSessionCanceled(host, "cancel");
    const cancelPatch = host.updateState.mock.calls[0][0];
    expect(cancelPatch.statusMessage).toBe("cancel");
    expect(cancelPatch.lastError).toBeUndefined();
    expect(cancelPatch.steps.find((step: any) => step.id === "asr")?.status).toBe("error");

    host.updateState.mockClear();
    host.analysisAbort = { aborted: false };

    it_finishAnalysisSessionError(host, "failed", {
      type: "analysis",
      reason: "boom",
      solution: "retry",
    });
    const errorPatch = host.updateState.mock.calls[0][0];
    expect(errorPatch.statusMessage).toBe("failed");
    expect(errorPatch.lastError.reason).toBe("boom");
    expect(host.analysisAbort).toBeNull();
  });
});
