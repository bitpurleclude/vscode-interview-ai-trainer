import { describe, expect, it, vi } from "vitest";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";

describe("it_webviewHandlerLogging", () => {
  it("logs request and success around a successful handler", async () => {
    const host = {
      logCorpusTrace: vi.fn(),
    };

    const result = await it_runLoggedHandler(
      host,
      {
        request: "it/demo",
        event: "interface.demo.success",
        payload: { alpha: 1 },
      },
      async () => 42,
    );

    expect(result).toBe(42);
    expect(host.logCorpusTrace).toHaveBeenNthCalledWith(
      1,
      "it/demo request",
      expect.objectContaining({
        event: "interface.demo.success",
        status: "request",
      }),
    );
    expect(host.logCorpusTrace).toHaveBeenNthCalledWith(
      2,
      "it/demo success",
      expect.objectContaining({
        event: "interface.demo.success",
        status: "success",
      }),
    );
  });

  it("logs request and error when handler throws", async () => {
    const host = {
      logCorpusTrace: vi.fn(),
    };

    await expect(
      it_runLoggedHandler(
        host,
        {
          request: "it/demo",
          event: "interface.demo.error",
          payload: "bad",
        },
        async () => {
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");

    expect(host.logCorpusTrace).toHaveBeenNthCalledWith(
      1,
      "it/demo request",
      expect.objectContaining({
        event: "interface.demo.error",
        status: "request",
      }),
    );
    expect(host.logCorpusTrace).toHaveBeenNthCalledWith(
      2,
      "it/demo error",
      expect.objectContaining({
        event: "interface.demo.error",
        status: "error",
        error: "boom",
      }),
    );
  });
});
