import { describe, expect, it } from "vitest";
import { formatSeconds } from "./format";

describe("formatSeconds", () => {
  it("formats zero and small values", () => {
    expect(formatSeconds(0)).toBe("00:00");
    expect(formatSeconds(5)).toBe("00:05");
  });

  it("formats minutes and seconds", () => {
    expect(formatSeconds(65)).toBe("01:05");
    expect(formatSeconds(125)).toBe("02:05");
  });

  it("clamps negatives and floors decimals", () => {
    expect(formatSeconds(-1)).toBe("00:00");
    expect(formatSeconds(125.9)).toBe("02:05");
  });
});
