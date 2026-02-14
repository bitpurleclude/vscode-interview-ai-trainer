import axios from "axios";
import { Readable } from "stream";
import { describe, expect, it, vi } from "vitest";
import { it_executeTemplate } from "./it_templateExecutor";

vi.mock("axios", () => ({
  default: {
    request: vi.fn(),
  },
}));

describe("it_templateExecutor security", () => {
  const runtime: any = {
    environment: "prod",
    context: {
      secrets: {
        get: vi.fn(async () => undefined),
      },
    },
    template: {
      id: "tmpl",
      request: {
        method: "POST",
        url: "https://example.com/{{missingVar}}",
        body: {
          text: "{{missingVar}}",
        },
      },
    },
  };

  it("fails fast when required template variables are missing", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();

    await expect(
      it_executeTemplate({
        runtime,
        variables: {},
      }),
    ).rejects.toThrow();

    expect(requestMock).not.toHaveBeenCalled();
  });

  it("returns deterministic error when request throws non-Error values", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();
    requestMock.mockRejectedValue("boom");

    await expect(
      it_executeTemplate({
        runtime: {
          ...runtime,
          template: {
            ...runtime.template,
            request: {
              method: "POST",
              url: "https://example.com/api",
              body: {},
            },
          },
        },
        variables: {},
        maxRetries: 1,
      }),
    ).rejects.toThrow("Template request failed.");
  });

  it("surfaces provider error details for HTTP responses", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();
    requestMock.mockRejectedValue({
      message: "Request failed with status code 403",
      response: {
        status: 403,
        headers: {
          "x-request-id": "sf-req-123",
        },
        data: {
          code: 20003,
          message: "Insufficient balance",
        },
      },
    });

    await expect(
      it_executeTemplate({
        runtime: {
          ...runtime,
          template: {
            ...runtime.template,
            request: {
              method: "POST",
              url: "https://example.com/api",
              body: {},
            },
          },
        },
        variables: {},
      }),
    ).rejects.toThrow("HTTP 403 (20003): Insufficient balance [request_id=sf-req-123]");
  });

  it("extracts provider error details from stream error bodies", async () => {
    const requestMock = vi.mocked(axios.request);
    requestMock.mockReset();
    requestMock.mockRejectedValue({
      message: "Request failed with status code 403",
      response: {
        status: 403,
        headers: {},
        data: Readable.from([
          JSON.stringify({
            error: {
              code: "permission_denied",
              message: "Model access denied",
            },
          }),
        ]),
      },
    });

    await expect(
      it_executeTemplate({
        runtime: {
          ...runtime,
          template: {
            ...runtime.template,
            request: {
              method: "POST",
              url: "https://example.com/api",
              body: {},
            },
            response: {
              mode: "sse",
            },
          },
        },
        variables: {},
      }),
    ).rejects.toThrow("HTTP 403 (permission_denied): Model access denied");
  });
});
