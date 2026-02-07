import { describe, expect, it } from "vitest";
import { it_maskTemplateSecrets } from "./it_templateVars";

describe("it_templateVars security", () => {
  it("masks secrets and tokens while keeping non-sensitive fields", () => {
    const variables: Record<string, unknown> = {
      apiKey: "api-secret",
      secretKey: "secret-key",
      secrets: {
        one: "value-1",
        two: "value-2",
      },
      tokens: {
        access: "token-1",
        refresh: "token-2",
      },
      passthrough: "visible",
    };

    it_maskTemplateSecrets(variables);

    expect(variables.apiKey).toBe("***");
    expect(variables.secretKey).toBe("***");
    expect(variables.secrets).toEqual({
      one: "***",
      two: "***",
    });
    expect(variables.tokens).toEqual({
      access: "***",
      refresh: "***",
    });
    expect(variables.passthrough).toBe("visible");
  });

  it("handles missing secret containers without throwing", () => {
    const variables: Record<string, unknown> = {
      prompt: "hello",
    };

    expect(() => it_maskTemplateSecrets(variables)).not.toThrow();
    expect(variables).toEqual({ prompt: "hello" });
  });
});
