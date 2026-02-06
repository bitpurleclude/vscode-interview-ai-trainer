import { describe, expect, it } from "vitest";
import {
  it_formatSeconds,
  it_hashText,
  it_makeSlug,
  it_normalizeText,
} from "./it_text";

describe("it_normalizeText", () => {
  it("removes whitespace", () => {
    expect(it_normalizeText(" a  b \n c ")).toBe("abc");
  });
});

describe("it_hashText", () => {
  it("returns empty for empty input", () => {
    expect(it_hashText("")).toBe("");
  });

  it("returns stable sha1 hash", () => {
    expect(it_hashText("hello")).toBe(it_hashText("hello"));
  });
});

describe("it_makeSlug", () => {
  it("builds unicode slug when enabled", () => {
    const slug = it_makeSlug("测试 / 名称", true, 20);
    expect(slug.includes("/")).toBe(false);
    expect(slug.length).toBeGreaterThan(0);
  });

  it("returns untitled for empty input", () => {
    expect(it_makeSlug("", true, 20)).toBe("untitled");
  });

  it("returns untitled when maxLen is zero", () => {
    expect(it_makeSlug("abc", true, 0)).toBe("untitled");
  });

  it("builds ascii slug when unicode disabled", () => {
    expect(it_makeSlug("Hello World", false, 20)).toBe("hello-world");
  });

  it("uses hash fallback for non-ascii", () => {
    const slug = it_makeSlug("中文", false, 20);
    expect(slug.startsWith("topic-")).toBe(true);
    expect(slug.length).toBe(14);
  });
});

describe("it_formatSeconds", () => {
  it("formats seconds", () => {
    expect(it_formatSeconds(0)).toBe("00:00");
    expect(it_formatSeconds(61)).toBe("01:01");
  });
});
