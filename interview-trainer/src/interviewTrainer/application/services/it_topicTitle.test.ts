import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  callLlmChat: vi.fn(),
  extractJson: vi.fn(),
}));

vi.mock("./it_llmGateway", () => ({
  it_callLlmChat: mocks.callLlmChat,
}));

vi.mock("../../domain/analyze/shared", () => ({
  it_extractJson: mocks.extractJson,
}));

import {
  it_deriveTopicTitle,
  it_generateTopicTitleWithLlm,
  it_sanitizeTopicTitle,
} from "./it_topicTitle";

describe("it_topicTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callLlmChat.mockResolvedValue('{"title":"系统设计-高并发"}');
    mocks.extractJson.mockReturnValue({ title: "系统设计-高并发" });
  });

  it("returns null when llm config is missing or no prompt content exists", async () => {
    await expect(
      it_generateTopicTitleWithLlm(null, "question", [], 16),
    ).resolves.toBeNull();
    await expect(
      it_generateTopicTitleWithLlm({ provider: "openai" } as any, "  ", [], 16),
    ).resolves.toBeNull();
    expect(mocks.callLlmChat).not.toHaveBeenCalled();
  });

  it("calls llm with normalized retries and returns sanitized title", async () => {
    const result = await it_generateTopicTitleWithLlm(
      {
        provider: "openai",
        maxRetries: -5,
      } as any,
      "背景材料",
      ["问题一", "问题二"],
      6,
    );

    expect(mocks.callLlmChat).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "openai",
        maxRetries: 0,
      }),
      expect.any(Array),
    );
    expect(result).toBe("系统设计高并");
  });

  it("falls back to first response line when parsed json is missing", async () => {
    mocks.extractJson.mockReturnValueOnce(null);
    mocks.callLlmChat.mockResolvedValueOnce("标题候选\nother lines");

    const result = await it_generateTopicTitleWithLlm(
      { provider: "openai", maxRetries: 1 } as any,
      "背景",
      [],
      16,
    );

    expect(result).toBe("标题候选");
  });

  it("returns null when llm call throws", async () => {
    mocks.callLlmChat.mockRejectedValueOnce(new Error("llm failed"));

    await expect(
      it_generateTopicTitleWithLlm({ provider: "openai" } as any, "背景", ["q1"], 16),
    ).resolves.toBeNull();
  });

  it("exports sanitize and derive helpers", () => {
    expect(it_sanitizeTopicTitle("  A/B? C  ", 5)).toBe("ABC");
    expect(it_deriveTopicTitle("  主题标题  ", [], "", 6)).toBe("主题标题");
  });
});
