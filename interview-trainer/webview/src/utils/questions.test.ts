import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseQuestionsRemote } from "./questions";
import { request } from "../messenger";

vi.mock("../messenger", () => ({
  request: vi.fn(),
}));

const requestMock = vi.mocked(request);

describe("parseQuestionsRemote", () => {
  beforeEach(() => {
    requestMock.mockReset();
  });

  it("returns parsed material and questions", async () => {
    requestMock.mockResolvedValue({
      status: "success",
      content: {
        material: " 题干 ",
        questions: ["Q1", "", 2],
        source: "remote",
      },
    });

    const result = await parseQuestionsRemote("input");
    expect(result).toEqual({
      prompt: "题干",
      questions: ["Q1", "2"],
      source: "remote",
    });
  });

  it("returns null when response has no usable content", async () => {
    requestMock.mockResolvedValue({
      status: "success",
      content: { material: "", questions: [] },
    });

    const result = await parseQuestionsRemote("input");
    expect(result).toBeNull();
  });

  it("returns null when questions is not an array", async () => {
    requestMock.mockResolvedValue({
      status: "success",
      content: { material: "", questions: "bad" },
    });

    const result = await parseQuestionsRemote("input");
    expect(result).toBeNull();
  });

  it("returns null on request error", async () => {
    requestMock.mockRejectedValue(new Error("network"));

    const result = await parseQuestionsRemote("input");
    expect(result).toBeNull();
  });
});
