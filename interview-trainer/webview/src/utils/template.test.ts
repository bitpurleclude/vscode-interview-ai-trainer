import { describe, expect, it } from "vitest";
import type { ItApiTemplate } from "../types";
import { cloneTemplate, formatJson, parseJson } from "./template";

describe("cloneTemplate", () => {
  it("deep clones template data", () => {
    const template: ItApiTemplate = {
      id: "t1",
      name: "demo",
      category: "evaluation",
      enabled: true,
      content: {
        prompt: "hello",
        model: "gpt",
        provider: "demo",
        params: {
          temperature: 0.3,
        },
      },
    } as ItApiTemplate;

    const cloned = cloneTemplate(template);

    expect(cloned).toEqual(template);
    expect(cloned).not.toBe(template);
    expect(cloned.content).not.toBe(template.content);
  });
});

describe("formatJson", () => {
  it("stringifies objects with indentation", () => {
    expect(formatJson({ a: 1 })).toBe("{\n  \"a\": 1\n}");
  });

  it("returns fallback on circular structures", () => {
    const value: Record<string, unknown> = {};
    value.self = value;
    expect(formatJson(value, "fallback")).toBe("fallback");
  });

  it("returns fallback for nullish values", () => {
    expect(formatJson(undefined, "fallback")).toBe("fallback");
    expect(formatJson(null, "fallback")).toBe("fallback");
  });
});

describe("parseJson", () => {
  it("parses valid json", () => {
    const result = parseJson("{\"a\": 1}");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ a: 1 });
    }
  });

  it("returns ok for empty string", () => {
    const result = parseJson("");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBeUndefined();
    }
  });

  it("returns error for invalid json", () => {
    const result = parseJson("{");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0);
    }
  });
});
