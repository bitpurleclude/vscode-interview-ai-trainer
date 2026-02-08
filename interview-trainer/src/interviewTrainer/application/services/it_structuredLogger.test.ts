import { describe, expect, it } from "vitest";
import { it_createStructuredLogger } from "./it_structuredLogger";

describe("it_structuredLogger", () => {
  const baseGuardrails = {
    limits: {
      messageMaxChars: 32,
      detailMaxChars: 120,
      detailMaxDepth: 3,
      detailMaxKeysPerObject: 2,
      detailMaxItemsPerArray: 2,
    },
    policy: {
      emitErrorWhenTraceDisabled: true,
    },
  };

  it("emits info logs when trace is enabled", () => {
    const lines: string[] = [];
    const logger = it_createStructuredLogger({
      sink: (line) => lines.push(line),
      traceLogsEnabled: true,
      guardrails: baseGuardrails,
      nowIso: () => "2026-02-08T00:00:00.000Z",
    });

    const record = logger.info({
      event: "analysis.start",
      layer: "application",
      module: "it_analysisFlow",
      message: "analysis started",
      detail: { requestId: "r1" },
    });

    expect(record).not.toBeNull();
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("analysis.start");
    expect(parsed.level).toBe("info");
    expect(parsed.ts).toBe("2026-02-08T00:00:00.000Z");
  });

  it("emits only error when trace is disabled", () => {
    const lines: string[] = [];
    const logger = it_createStructuredLogger({
      sink: (line) => lines.push(line),
      traceLogsEnabled: false,
      guardrails: baseGuardrails,
    });

    const infoRecord = logger.info({
      event: "analysis.stage",
      layer: "application",
      module: "flow",
      message: "stage",
    });
    const errorRecord = logger.error({
      event: "analysis.error",
      layer: "application",
      module: "flow",
      message: "failed",
    });

    expect(infoRecord).toBeNull();
    expect(errorRecord).not.toBeNull();
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]).level).toBe("error");
  });

  it("masks sensitive fields and truncates message", () => {
    const lines: string[] = [];
    const logger = it_createStructuredLogger({
      sink: (line) => lines.push(line),
      traceLogsEnabled: true,
      guardrails: baseGuardrails,
    });

    logger.error({
      event: "test.failure",
      layer: "application",
      module: "it_logging",
      message: "x".repeat(200),
      detail: {
        api_key: "secret-value",
        nested: {
          authorization: "Bearer token",
        },
      },
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.message).toContain("truncated");
    expect(parsed.detail.api_key).toBe("***");
  });

  it("applies depth, key, item, and serialized size limits", () => {
    const lines: string[] = [];
    const logger = it_createStructuredLogger({
      sink: (line) => lines.push(line),
      traceLogsEnabled: true,
      guardrails: {
        limits: {
          messageMaxChars: 64,
          detailMaxChars: 40,
          detailMaxDepth: 2,
          detailMaxKeysPerObject: 1,
          detailMaxItemsPerArray: 1,
        },
        policy: {
          emitErrorWhenTraceDisabled: true,
        },
      },
    });

    logger.info({
      event: "trace.payload",
      layer: "application",
      module: "it_logging",
      message: "payload",
      detail: {
        first: {
          second: {
            third: "value",
          },
          longText: "x".repeat(400),
        },
        secondKey: "dropped",
        array: [1, 2, 3],
      },
    });

    const parsed = JSON.parse(lines[0]);
    expect(parsed.detail.truncated).toBe(true);
    expect(parsed.detail.preview).toContain("detail-truncated");
  });
});
