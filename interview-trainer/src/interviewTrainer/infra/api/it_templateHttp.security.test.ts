import { Readable } from "stream";
import { describe, expect, it, vi } from "vitest";
import { it_consumeTemplateSse } from "./it_templateHttp";

function createSseStream(chunks: Array<string | Error>, autoEnd = true): Readable {
  const stream = new Readable({
    read() {},
  });

  const emitChunk = (index: number) => {
    if (index >= chunks.length) {
      if (autoEnd) {
        stream.push(null);
      }
      return;
    }

    const chunk = chunks[index];
    if (chunk instanceof Error) {
      stream.emit("error", chunk);
      return;
    }

    stream.push(chunk);
    queueMicrotask(() => emitChunk(index + 1));
  };

  queueMicrotask(() => emitChunk(0));
  return stream;
}

describe("it_templateHttp security", () => {
  it("keeps collected delta text when SSE ends without explicit done signal", async () => {
    const onDelta = vi.fn();
    const stream = createSseStream([
      'data: {"delta":"A"}\n\n',
      'data: {"delta":"B"}\n\n',
    ]);

    const text = await it_consumeTemplateSse(stream, undefined, undefined, onDelta);

    expect(text).toBe("AB");
    expect(onDelta).toHaveBeenNthCalledWith(1, "A", "A");
    expect(onDelta).toHaveBeenNthCalledWith(2, "B", "AB");
  });

  it("falls back to JSON payload when response is not SSE-formatted", async () => {
    const stream = createSseStream([JSON.stringify({ output_text: "fallback-json" })]);

    const text = await it_consumeTemplateSse(stream, undefined, undefined);

    expect(text).toBe("fallback-json");
  });

  it("falls back to plain text when response is not SSE-formatted", async () => {
    const stream = createSseStream(["fallback-text"]);

    const text = await it_consumeTemplateSse(stream, undefined, undefined);

    expect(text).toBe("fallback-text");
  });

  it("rejects fast when abort signal is already on", async () => {
    const stream = createSseStream(['data: {"delta":"x"}\n\n']);

    await expect(
      it_consumeTemplateSse(stream, undefined, undefined, undefined, { aborted: true }),
    ).rejects.toThrow("stream aborted");
  });

  it("surfaces stream-level transport errors", async () => {
    const stream = createSseStream(
      ['data: {"delta":"partial"}\n\n', new Error("socket hang up")],
      false,
    );

    await expect(
      it_consumeTemplateSse(stream, undefined, undefined),
    ).rejects.toThrow("socket hang up");
  });

  it("tolerates malformed SSE JSON payload without crashing", async () => {
    const onDelta = vi.fn();
    const stream = createSseStream([
      'data: {"delta":\n\n',
      "data: [DONE]\n\n",
    ]);

    const text = await it_consumeTemplateSse(stream, undefined, undefined, onDelta);

    expect(text).toBe("");
    expect(onDelta).not.toHaveBeenCalled();
  });
});
