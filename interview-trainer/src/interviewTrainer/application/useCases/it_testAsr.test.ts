import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  callBaiduAsr: vi.fn(),
  callVolcAsr: vi.fn(),
  pcm16ToWavBuffer: vi.fn(),
}));

vi.mock("../services/it_asrGateway", () => ({
  it_callBaiduAsr: gatewayMocks.callBaiduAsr,
  it_callVolcAsr: gatewayMocks.callVolcAsr,
}));

vi.mock("../services/it_textGateway", () => ({
  it_pcm16ToWavBuffer: gatewayMocks.pcm16ToWavBuffer,
}));

import { it_testAsr } from "./it_testAsr";

describe("it_testAsr", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    gatewayMocks.pcm16ToWavBuffer.mockReturnValue(Buffer.from("wav-binary"));
  });

  it("returns mock text in mock mode", async () => {
    const onTrace = vi.fn();

    const result = await it_testAsr({
      payload: {
        asr: {
          provider: "mock",
          mockText: "hello mock",
        },
      },
      onTrace,
    });

    expect(result).toEqual({ ok: true, content: "hello mock" });
    expect(gatewayMocks.callVolcAsr).not.toHaveBeenCalled();
    expect(gatewayMocks.callBaiduAsr).not.toHaveBeenCalled();
    expect(onTrace).toHaveBeenNthCalledWith(
      2,
      "test_asr run success",
      expect.objectContaining({
        event: "application.test_asr.run",
        status: "success",
        provider: "mock",
        mode: "mock",
      }),
    );
  });

  it("runs volc flash mode with inline wav payload", async () => {
    const onTrace = vi.fn();
    gatewayMocks.callVolcAsr.mockResolvedValue("volc asr text");

    const result = await it_testAsr({
      payload: {
        asr: {
          provider: "volc_doubao",
          apiKey: "volc-app-key",
          secretKey: "volc-access-key",
          mode: "flash",
          baseUrl: "https://volc.example",
          resource_id: "rid",
          model_name: "bigmodel",
        },
      },
      onTrace,
    });

    expect(result).toEqual({ ok: true, content: "volc asr text" });
    expect(gatewayMocks.callVolcAsr).toHaveBeenCalledWith(
      expect.objectContaining({
        appKey: "volc-app-key",
        accessKey: "volc-access-key",
        mode: "flash",
        baseUrl: "https://volc.example",
        resourceId: "rid",
        modelName: "bigmodel",
      }),
      expect.objectContaining({
        data: Buffer.from("wav-binary").toString("base64"),
        format: "wav",
        rate: 16000,
      }),
    );
    expect(onTrace).toHaveBeenNthCalledWith(
      2,
      "test_asr run success",
      expect.objectContaining({
        provider: "volc_doubao",
        mode: "flash",
      }),
    );
  });

  it("returns error result when volc standard mode misses audio_url", async () => {
    const result = await it_testAsr({
      payload: {
        asr: {
          provider: "volc_asr",
          apiKey: "volc-app-key",
          secretKey: "volc-access-key",
          mode: "standard",
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "Volc standard mode requires audio_url.",
      raw: {
        meta: expect.objectContaining({
          provider: "volc_asr",
          mode: "standard",
        }),
      },
    });
    expect(gatewayMocks.callVolcAsr).not.toHaveBeenCalled();
  });

  it("returns fallback content for baidu when api reachable but no transcript", async () => {
    gatewayMocks.callBaiduAsr.mockResolvedValue("");

    const result = await it_testAsr({
      payload: {
        asr: {
          provider: "baidu_vop",
          apiKey: "baidu-key",
          secretKey: "baidu-secret",
          language: "zh",
          devPid: 1537,
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      content: "(no asr result, but api reachable)",
    });
    expect(gatewayMocks.callBaiduAsr).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "baidu-key",
        secretKey: "baidu-secret",
      }),
      expect.objectContaining({
        format: "pcm",
        rate: 16000,
        channel: 1,
      }),
    );
  });

  it("returns error payload with response/status when baidu request fails", async () => {
    gatewayMocks.callBaiduAsr.mockRejectedValue({
      message: "bad gateway",
      response: {
        status: 502,
        data: { code: "gateway_error" },
      },
    });

    const result = await it_testAsr({
      payload: {
        asr: {
          provider: "baidu_vop",
          apiKey: "baidu-key",
          secretKey: "baidu-secret",
        },
      },
    });

    expect(result).toMatchObject({
      ok: false,
      error: "[object Object]",
      raw: {
        status: 502,
        response: { code: "gateway_error" },
        meta: expect.objectContaining({
          provider: "baidu_vop",
        }),
      },
    });
  });
});

