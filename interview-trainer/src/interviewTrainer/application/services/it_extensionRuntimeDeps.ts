import { it_handleAnalyze } from "../useCases/it_analysisFlow";
import {
  it_isIdleForWarmup,
  it_runEmbeddingWarmup,
  it_scheduleEmbeddingWarmup,
} from "../useCases/it_embeddingWarmup";
import {
  it_buildRunSteps,
  it_computeOverallProgress,
  it_updateEmbeddingWarmupState,
  it_updateProgress,
} from "./it_progress";
import type { ItExtensionRuntimeDeps } from "./it_extensionRuntime";

export const IT_EXTENSION_RUNTIME_DEPS: ItExtensionRuntimeDeps = {
  handleAnalyze: it_handleAnalyze,
  isIdleForWarmup: it_isIdleForWarmup,
  runEmbeddingWarmup: it_runEmbeddingWarmup,
  scheduleEmbeddingWarmup: it_scheduleEmbeddingWarmup,
  buildRunSteps: it_buildRunSteps,
  computeOverallProgress: it_computeOverallProgress,
  updateEmbeddingWarmupState: it_updateEmbeddingWarmupState,
  updateProgress: it_updateProgress,
};
