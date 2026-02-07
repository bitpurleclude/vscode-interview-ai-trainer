import axios from "axios";
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
});
