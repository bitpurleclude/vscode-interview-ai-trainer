import axios from "axios";
import { describe, expect, it, vi } from "vitest";
import { it_executeTemplate, it_renderTemplateRequest } from "./it_templateExecutor";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
  },
}));

function createRuntime() {
  return {
    environment: "prod",
    context: {
      secrets: {
        get: vi.fn(async () => undefined),
      },
    },
    template: {
      id: "tmpl-log",
      category: "llm",
      request: {
        method: "POST",
        url: "https://example.com/api",
        body: {
          prompt: "hello",
        },
      },
      response: {
        mode: "json",
      },
    },
  } as any;
}

describe("it_templateExecutor logging", () => {
  it("emits render_request start/success traces", async () => {
    const traces: Array<{ message: string; detail?: Record<string, unknown> }> = [];
    const runtime = createRuntime();

    await it_renderTemplateRequest({
      runtime,
      variables: {},
      onTrace: (message, detail) => {
        traces.push({ message, detail });
      },
    });

    const events = traces.map((item) => String(item.detail?.event || ""));
    const statuses = traces.map((item) => String(item.detail?.status || ""));
    expect(events).toContain("infra.template_executor.render_request");
    expect(statuses).toContain("start");
    expect(statuses).toContain("success");
  });

  it("emits attempt and run error traces across retries", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();
    requestMock.mockRejectedValue({
      response: { status: 500 },
      message: "boom",
    });

    const traces: Array<{ message: string; detail?: Record<string, unknown> }> = [];

    await expect(
      it_executeTemplate({
        runtime: createRuntime(),
        variables: {},
        maxRetries: 1,
        onTrace: (message, detail) => {
          traces.push({ message, detail });
        },
      }),
    ).rejects.toThrow();

    const attemptErrors = traces.filter(
      (item) =>
        item.detail?.event === "infra.template_executor.attempt" &&
        item.detail?.status === "error",
    );
    const runErrors = traces.filter(
      (item) =>
        item.detail?.event === "infra.template_executor.run" &&
        item.detail?.status === "error",
    );

    expect(attemptErrors).toHaveLength(2);
    expect(runErrors).toHaveLength(1);
  });

  it("emits attempt and run success traces", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();
    requestMock.mockResolvedValue({
      status: 200,
      headers: {},
      data: {
        output_text: "ok",
      },
    } as any);

    const traces: Array<{ message: string; detail?: Record<string, unknown> }> = [];

    await it_executeTemplate({
      runtime: createRuntime(),
      variables: {},
      onTrace: (message, detail) => {
        traces.push({ message, detail });
      },
    });

    const attemptSuccess = traces.find(
      (item) =>
        item.detail?.event === "infra.template_executor.attempt" &&
        item.detail?.status === "success",
    );
    const runSuccess = traces.find(
      (item) =>
        item.detail?.event === "infra.template_executor.run" &&
        item.detail?.status === "success",
    );

    expect(attemptSuccess).toBeTruthy();
    expect(runSuccess).toBeTruthy();
  });
});
