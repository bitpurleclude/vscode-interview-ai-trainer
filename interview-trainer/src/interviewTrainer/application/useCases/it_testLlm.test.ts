import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  buildDoubaoChatRequest: vi.fn(),
  buildDoubaoResponsesRequest: vi.fn(),
  buildOpenAiChatRequest: vi.fn(),
  buildOpenAiResponsesRequest: vi.fn(),
  callLlmChat: vi.fn(),
}));

vi.mock("../services/it_llmGateway", () => ({
  it_buildDoubaoChatRequest: gatewayMocks.buildDoubaoChatRequest,
  it_buildDoubaoResponsesRequest: gatewayMocks.buildDoubaoResponsesRequest,
  it_buildOpenAiChatRequest: gatewayMocks.buildOpenAiChatRequest,
  it_buildOpenAiResponsesRequest: gatewayMocks.buildOpenAiResponsesRequest,
  it_callLlmChat: gatewayMocks.callLlmChat,
}));

import { it_testLlm } from "./it_testLlm";

describe("it_testLlm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when LLM api key is missing", async () => {
    await expect(
      it_testLlm({
        payload: {
          llm: {
            provider: "openai_compatible",
            apiKey: "",
          },
        },
      }),
    ).rejects.toThrow("Missing LLM API key.");
  });

  it("builds openai responses request and emits masked request preview", async () => {
    const onEmitRequest = vi.fn();
    const onTrace = vi.fn();
    gatewayMocks.buildOpenAiResponsesRequest.mockReturnValue({
      url: "https://api.openai.example/responses",
      headers: {
        Authorization: "Bearer sk-test",
        "x-api-key": "x-key",
        "x-goog-api-key": "goog-key",
        "api-key": "api-key",
        "x-custom": "visible",
      },
      payload: { input: "ping" },
    });
    gatewayMocks.callLlmChat.mockResolvedValue("pong");

    const result = await it_testLlm({
      payload: {
        llm: {
          provider: "openai_compatible",
          apiKey: "sk-test",
          baseUrl: "https://api.openai.example",
          model: "gpt-4o-mini",
          apiMode: "responses",
        },
      },
      onEmitRequest,
      onTrace,
    });

    expect(result).toEqual({ ok: true, content: "pong" });
    expect(gatewayMocks.buildOpenAiResponsesRequest).toHaveBeenCalledTimes(1);
    expect(gatewayMocks.buildOpenAiChatRequest).not.toHaveBeenCalled();
    expect(onEmitRequest).toHaveBeenCalledWith({
      url: "https://api.openai.example/responses",
      headers: {
        Authorization: "Bearer ***",
        "x-api-key": "***",
        "x-goog-api-key": "***",
        "api-key": "***",
        "x-custom": "visible",
      },
      payload: { input: "ping" },
    });
    expect(onTrace).toHaveBeenCalledWith(
      "test_llm request_preview success",
      expect.objectContaining({
        event: "application.test_llm.request_preview",
        status: "success",
        apiMode: "responses",
      }),
    );
  });

  it("builds doubao chat request when provider is volc_doubao", async () => {
    const onEmitRequest = vi.fn();
    gatewayMocks.buildDoubaoChatRequest.mockReturnValue({
      url: "https://doubao.example/chat",
      headers: { Authorization: "Token x" },
      payload: { messages: ["ping"] },
    });
    gatewayMocks.callLlmChat.mockResolvedValue("pong from doubao");

    const result = await it_testLlm({
      payload: {
        llm: {
          provider: "volc_doubao",
          apiKey: "volc-secret",
          apiMode: "chat",
          model: "doubao-model",
        },
      },
      onEmitRequest,
    });

    expect(result).toEqual({ ok: true, content: "pong from doubao" });
    expect(gatewayMocks.buildDoubaoChatRequest).toHaveBeenCalledTimes(1);
    expect(gatewayMocks.buildDoubaoResponsesRequest).not.toHaveBeenCalled();
    expect(onEmitRequest).toHaveBeenCalledWith({
      url: "https://doubao.example/chat",
      headers: { Authorization: "***" },
      payload: { messages: ["ping"] },
    });
  });

  it("emits failure callback with masked config when llm call fails", async () => {
    const onFailure = vi.fn();
    const onEmitRequest = vi.fn();
    const onTrace = vi.fn();
    const error = new Error("llm gateway failed");
    gatewayMocks.callLlmChat.mockRejectedValue(error);

    await expect(
      it_testLlm({
        payload: {
          llm: {
            provider: "baidu_qianfan",
            apiKey: "secret-key",
            baseUrl: "https://qianfan.example",
            model: "ernie-4.5-turbo-128k",
          },
        },
        onFailure,
        onEmitRequest,
        onTrace,
      }),
    ).rejects.toThrow("llm gateway failed");

    expect(onEmitRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "baidu_qianfan",
        baseUrl: "https://qianfan.example",
        model: "ernie-4.5-turbo-128k",
      }),
    );
    expect(onFailure).toHaveBeenCalledWith(error, {
      config: expect.objectContaining({
        apiKey: "***",
        provider: "baidu_qianfan",
      }),
    });
    expect(onTrace).toHaveBeenCalledWith(
      "test_llm run error",
      expect.objectContaining({
        event: "application.test_llm.run",
        status: "error",
        provider: "baidu_qianfan",
        error: "llm gateway failed",
      }),
    );
  });
});

