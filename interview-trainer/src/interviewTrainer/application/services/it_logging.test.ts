import { describe, expect, it, vi } from "vitest";
import {
  it_emitEvaluationStreamUpdate,
  it_emitStreamUpdate,
  it_logCorpusTrace,
  type ItLogHost,
} from "./it_logging";

function it_createHost(traceLogsEnabled: boolean): {
  host: ItLogHost;
  lines: string[];
} {
  const lines: string[] = [];
  const outputChannel = {
    appendLine: (line: string) => {
      lines.push(line);
    },
    show: vi.fn(),
  } as any;

  const host: ItLogHost = {
    outputChannel,
    traceLogsEnabled,
    webviewProtocol: { send: vi.fn() } as any,
    configSnapshot: {} as any,
  };

  return { host, lines };
}

describe("it_logCorpusTrace", () => {
  it("promotes trace metadata to top-level structured fields", () => {
    const { host, lines } = it_createHost(true);

    it_logCorpusTrace(host, "it/demo request", {
      event: "interface.demo.action",
      layer: "interface",
      module: "it_webviewHandlers",
      status: "request",
      runId: "run-1",
      requestId: "req-1",
      stage: "input",
      payload: { alpha: 1 },
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("interface.demo.action");
    expect(parsed.layer).toBe("interface");
    expect(parsed.module).toBe("it_webviewHandlers");
    expect(parsed.status).toBe("request");
    expect(parsed.runId).toBe("run-1");
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.stage).toBe("input");
    expect(parsed.detail).toEqual({ payload: { alpha: 1 } });
  });

  it("falls back to trace.corpus when detail metadata is missing", () => {
    const { host, lines } = it_createHost(true);

    it_logCorpusTrace(host, "plain trace", {
      foo: "bar",
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("trace.corpus");
    expect(parsed.layer).toBe("application");
    expect(parsed.module).toBe("it_logging");
    expect(parsed.message).toBe("plain trace");
    expect(parsed.detail).toEqual({ foo: "bar" });
  });

  it("still emits error traces when trace switch is off", () => {
    const { host, lines } = it_createHost(false);

    it_logCorpusTrace(host, "cache clear failed", {
      event: "application.retrieval.clear_corpus_cache",
      status: "error",
      errorCode: "cache_clear_failed",
      error: "permission denied",
    });

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.level).toBe("error");
    expect(parsed.event).toBe("application.retrieval.clear_corpus_cache");
    expect(parsed.errorCode).toBe("cache_clear_failed");
  });

  it("suppresses non-error traces when trace switch is off", () => {
    const { host, lines } = it_createHost(false);

    it_logCorpusTrace(host, "cache clear success", {
      event: "application.retrieval.clear_corpus_cache",
      status: "success",
    });

    expect(lines).toHaveLength(0);
  });
});

describe("it_emitStreamUpdate", () => {
  it("skips send when streaming is disabled", () => {
    const { host, lines } = it_createHost(true);
    host.configSnapshot = {
      streaming: {
        enabled: false,
      },
    } as any;

    it_emitStreamUpdate(host, {
      step: "asr",
      text: "delta",
    });

    expect((host.webviewProtocol.send as any).mock.calls).toHaveLength(0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("application.streaming.step_update");
    expect(parsed.status).toBe("dropped");
  });

  it("logs and rethrows when send throws", () => {
    const { host, lines } = it_createHost(true);
    host.webviewProtocol.send = vi.fn(() => {
      throw new Error("send-fail");
    }) as any;

    expect(() =>
      it_emitStreamUpdate(host, {
        step: "evaluation",
        text: "delta",
      }),
    ).toThrow("send-fail");

    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("application.streaming.step_update");
    expect(parsed.status).toBe("error");
    expect(parsed.errorCode).toBe("webview_send_failed");
  });
});

describe("it_emitEvaluationStreamUpdate", () => {
  it("skips send when streaming is disabled", () => {
    const { host, lines } = it_createHost(true);
    host.configSnapshot = {
      streaming: {
        enabled: false,
      },
    } as any;

    it_emitEvaluationStreamUpdate(host, {
      questionIndex: 0,
      text: "delta",
    });

    expect((host.webviewProtocol.send as any).mock.calls).toHaveLength(0);
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("application.streaming.evaluation_update");
    expect(parsed.status).toBe("dropped");
  });
});

