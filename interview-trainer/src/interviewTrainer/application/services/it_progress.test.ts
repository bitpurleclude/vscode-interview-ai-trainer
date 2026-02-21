import { describe, expect, it, vi } from "vitest";
import {
  IT_STATUS_INIT,
  it_buildRunSteps,
  it_computeOverallProgress,
  it_updateEmbeddingWarmupState,
  it_updateProgress,
} from "./it_progress";

describe("it_progress", () => {
  it("builds run steps with init fixed to success and other steps reset", () => {
    const steps = it_buildRunSteps();

    expect(steps).toHaveLength(IT_STATUS_INIT.steps.length);
    expect(steps[0]).toMatchObject({
      id: "init",
      status: "success",
      progress: 100,
      message: undefined,
    });
    expect(steps.slice(1).every((step) => step.status === "pending" && step.progress === 0)).toBe(
      true,
    );
  });

  it("computes weighted overall progress and clamps invalid progress values", () => {
    const progress = it_computeOverallProgress([
      { id: "asr", progress: 50, status: "running" } as any,
      { id: "acoustic", progress: 120, status: "running" } as any,
      { id: "question", progress: -20, status: "running" } as any,
      { id: "recording", progress: 100, status: "success" } as any,
    ]);

    expect(progress).toBe(59);
    expect(it_computeOverallProgress([{ id: "recording", progress: 100, status: "success" } as any])).toBe(
      0,
    );
  });

  it("updates a target step and pushes recalculated overall progress", () => {
    const updateState = vi.fn();
    const computeOverallProgress = vi.fn(() => 42);
    const host = {
      state: {
        ...IT_STATUS_INIT,
        statusMessage: "old-status",
        steps: it_buildRunSteps(),
      },
      updateState,
      computeOverallProgress,
    };

    it_updateProgress(host as any, {
      step: "asr",
      progress: 48.6,
      status: "running",
      message: "asr running",
    });

    expect(computeOverallProgress).toHaveBeenCalledTimes(1);
    const nextState = updateState.mock.calls[0]?.[0];
    const asrStep = nextState.steps.find((item: any) => item.id === "asr");
    expect(asrStep).toMatchObject({
      id: "asr",
      progress: 49,
      status: "running",
      message: "asr running",
    });
    expect(nextState.overallProgress).toBe(42);
    expect(nextState.statusMessage).toBe("asr running");
  });

  it("keeps previous status message when update message is not provided", () => {
    const updateState = vi.fn();
    const host = {
      state: {
        ...IT_STATUS_INIT,
        statusMessage: "existing-status",
        steps: it_buildRunSteps(),
      },
      updateState,
      computeOverallProgress: () => 30,
    };

    it_updateProgress(host as any, {
      step: "notes",
      progress: 10,
      status: "running",
    });

    const nextState = updateState.mock.calls[0]?.[0];
    expect(nextState.statusMessage).toBe("existing-status");
    const notesStep = nextState.steps.find((item: any) => item.id === "notes");
    expect(notesStep).toMatchObject({
      progress: 10,
      status: "running",
    });
  });

  it("merges embedding warmup state updates and sets updatedAt", () => {
    const updateState = vi.fn();
    const host = {
      state: {
        ...IT_STATUS_INIT,
        embeddingWarmup: {
          status: "running",
          progress: 20,
          total: 10,
          done: 2,
        },
      },
      updateState,
    };

    it_updateEmbeddingWarmupState(host as any, { done: 5, progress: 50 });

    const nextState = updateState.mock.calls[0]?.[0];
    expect(nextState.embeddingWarmup).toMatchObject({
      status: "running",
      total: 10,
      done: 5,
      progress: 50,
    });
    expect(typeof nextState.embeddingWarmup.updatedAt).toBe("string");
    expect(Number.isNaN(Date.parse(nextState.embeddingWarmup.updatedAt))).toBe(false);
  });

  it("uses default embedding warmup state when current state is missing", () => {
    const updateState = vi.fn();
    const host = {
      state: {
        ...IT_STATUS_INIT,
        embeddingWarmup: undefined,
      },
      updateState,
    };

    it_updateEmbeddingWarmupState(host as any, { status: "success", done: 3, total: 3 });

    const nextState = updateState.mock.calls[0]?.[0];
    expect(nextState.embeddingWarmup).toMatchObject({
      status: "success",
      done: 3,
      total: 3,
      progress: 0,
    });
  });
});
