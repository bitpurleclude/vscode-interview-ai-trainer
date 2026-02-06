import { beforeAll, describe, expect, it } from "vitest";
import { bytesToBase64, pcmToBase64 } from "./audio";

beforeAll(() => {
  if (!globalThis.btoa) {
    globalThis.btoa = (value: string) =>
      Buffer.from(value, "binary").toString("base64");
  }
});

describe("bytesToBase64", () => {
  it("encodes bytes to base64", () => {
    const bytes = Uint8Array.from([0, 1, 2, 255]);
    const expected = Buffer.from(bytes).toString("base64");
    expect(bytesToBase64(bytes)).toBe(expected);
  });
});

describe("pcmToBase64", () => {
  it("encodes Int16Array to base64", () => {
    const pcm = new Int16Array([0, 1, -1, 32767, -32768]);
    const buffer = new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength);
    const expected = Buffer.from(buffer).toString("base64");
    expect(pcmToBase64(pcm)).toBe(expected);
  });
});
