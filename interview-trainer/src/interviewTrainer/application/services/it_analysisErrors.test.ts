import { describe, expect, it } from "vitest";
import {
  IT_ANALYSIS_CANCELED_MESSAGE,
  IT_ANALYSIS_FAILED_MESSAGE,
  IT_ANALYSIS_FAILED_REASON_FALLBACK,
  IT_ANALYSIS_FAILED_SOLUTION,
  it_buildAnalysisFailedUserError,
  it_isAnalysisCanceledError,
} from "./it_analysisErrors";

describe("it_analysisErrors", () => {
  it("detects cancellation errors by message", () => {
    expect(it_isAnalysisCanceledError(new Error(IT_ANALYSIS_CANCELED_MESSAGE))).toBe(true);
    expect(
      it_isAnalysisCanceledError(
        new Error(`prefix: ${IT_ANALYSIS_CANCELED_MESSAGE} (manual stop)`),
      ),
    ).toBe(true);
    expect(it_isAnalysisCanceledError(new Error("other error"))).toBe(false);
    expect(it_isAnalysisCanceledError("error")).toBe(false);
  });

  it("builds analysis failed user error with fallback", () => {
    const known = it_buildAnalysisFailedUserError(new Error("network down"));
    expect(known).toEqual({
      type: "analysis",
      reason: "network down",
      solution: IT_ANALYSIS_FAILED_SOLUTION,
    });

    const unknown = it_buildAnalysisFailedUserError(null);
    expect(unknown).toEqual({
      type: "analysis",
      reason: IT_ANALYSIS_FAILED_REASON_FALLBACK,
      solution: IT_ANALYSIS_FAILED_SOLUTION,
    });
  });

  it("exports stable status message constants", () => {
    expect(IT_ANALYSIS_CANCELED_MESSAGE.length).toBeGreaterThan(0);
    expect(IT_ANALYSIS_FAILED_MESSAGE.length).toBeGreaterThan(0);
  });
});
