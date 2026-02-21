import { beforeEach, describe, expect, it, vi } from "vitest";

const gatewayMocks = vi.hoisted(() => ({
  renderTemplateRequest: vi.fn(),
  executeTemplate: vi.fn(),
  resolveTemplateById: vi.fn(),
  extractTokenInfo: vi.fn(),
}));

vi.mock("../services/it_templateGateway", () => ({
  it_renderTemplateRequest: gatewayMocks.renderTemplateRequest,
  it_executeTemplate: gatewayMocks.executeTemplate,
  it_resolveTemplateById: gatewayMocks.resolveTemplateById,
}));

vi.mock("../services/it_tokens", () => ({
  it_extractTokenInfo: gatewayMocks.extractTokenInfo,
}));

import { it_testTemplateDryRun, it_testTemplateLive } from "./it_templateTestActions";

function createContext() {
  const configSnapshot = {
    llm: {
      model: "gpt-4o-mini",
      temperature: 0.7,
      topP: 0.9,
      reasoningEffort: "low",
      maxOutputTokens: 256,
      reusePrefix: true,
      stream: true,
    },
    retrieval: {
      vector: {
        model: "text-embedding-3-large",
      },
    },
    asr: {
      language: "zh",
      devPid: 1537,
    },
  } as any;

  return {
    extensionContext: { extensionPath: "/tmp/ext" } as any,
    configService: {
      loadBundle: vi.fn(() => ({
        api: {
          active: { environment: "prod" },
        },
        templates: {
          version: 1,
          environments: {},
        },
      })),
    } as any,
    configSnapshot,
    emitTemplateTestDelta: vi.fn(),
    logTrace: vi.fn(),
  };
}

describe("it_templateTestActions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("dry-run resolves template, builds request preview and masks sensitive headers", async () => {
    const context = createContext();
    gatewayMocks.resolveTemplateById.mockReturnValue({
      id: "tpl-llm",
      category: "llm",
    });
    gatewayMocks.renderTemplateRequest.mockImplementation(async ({ variables }: any) => {
      expect(variables).toEqual(
        expect.objectContaining({
          input: "hello",
          model: "gpt-4o-mini",
          temperature: 0.7,
          stream: false,
        }),
      );
      expect(variables.messages).toEqual([
        { role: "system", content: "You are a template test assistant." },
        { role: "user", content: "hello" },
      ]);
      return {
        method: "POST",
        url: "https://example.com/template",
        headers: {
          Authorization: "Bearer abc",
          "x-api-key": "k1",
          "x-custom": "visible",
        },
        stream: false,
        missing: ["apiKey"],
      };
    });

    const result = await it_testTemplateDryRun({
      context,
      payload: {
        runId: "run-1",
        templateId: "tpl-llm",
        inputText: "hello",
        stream: false,
      },
    });

    expect(result).toEqual({
      request: {
        method: "POST",
        url: "https://example.com/template",
        headers: {
          Authorization: "Bearer ***",
          "x-api-key": "***",
          "x-custom": "visible",
        },
        stream: false,
        missing: ["apiKey"],
      },
      missing: ["apiKey"],
    });
    expect(context.logTrace).toHaveBeenCalledWith(
      "template_test dry_run success",
      expect.objectContaining({
        event: "application.template_test.dry_run",
        status: "success",
        templateId: "tpl-llm",
      }),
    );
  });

  it("dry-run traces and throws when template id is missing", async () => {
    const context = createContext();

    await expect(
      it_testTemplateDryRun({
        context,
        payload: {
          runId: "run-missing-id",
        },
      }),
    ).rejects.toThrow("missing template id");

    expect(context.logTrace).toHaveBeenCalledWith(
      "template_test dry_run error",
      expect.objectContaining({
        event: "application.template_test.dry_run",
        status: "error",
        runId: "run-missing-id",
      }),
    );
  });

  it("live test emits deltas and returns token info for token template", async () => {
    const context = createContext();
    gatewayMocks.resolveTemplateById.mockReturnValue({
      id: "tpl-token",
      category: "token",
    });
    gatewayMocks.renderTemplateRequest.mockResolvedValue({
      method: "POST",
      url: "https://example.com/live",
      headers: {},
      stream: true,
      missing: [],
    });
    gatewayMocks.executeTemplate.mockImplementation(async ({ onDelta, onTrace }: any) => {
      onTrace?.("gateway trace", { stage: "execute" });
      onDelta?.("delta-1", "full-1");
      return {
        status: 200,
        body: {
          access_token: "token-value",
          expires_in: 3600,
        },
      };
    });
    gatewayMocks.extractTokenInfo.mockReturnValue({
      value: "token-value",
      expiresInSec: 3600,
    });

    const result = await it_testTemplateLive({
      context,
      payload: {
        runId: "run-live",
        templateId: "tpl-token",
        inputText: "token pls",
      },
    });

    expect(context.emitTemplateTestDelta).toHaveBeenCalledWith({
      runId: "run-live",
      delta: "delta-1",
      full: "full-1",
    });
    expect(gatewayMocks.extractTokenInfo).toHaveBeenCalledWith(
      expect.objectContaining({ id: "tpl-token" }),
      expect.objectContaining({ status: 200 }),
    );
    expect(result).toEqual({
      runId: "run-live",
      result: {
        status: 200,
        body: {
          access_token: "token-value",
          expires_in: 3600,
        },
      },
      tokenInfo: {
        value: "token-value",
        expiresInSec: 3600,
      },
    });
  });

  it("live test throws when preview has missing variables", async () => {
    const context = createContext();
    gatewayMocks.resolveTemplateById.mockReturnValue({
      id: "tpl-asr",
      category: "asr",
    });
    gatewayMocks.renderTemplateRequest.mockResolvedValue({
      method: "POST",
      url: "https://example.com/live",
      headers: {},
      stream: true,
      missing: ["apiKey", "baseUrl"],
    });

    await expect(
      it_testTemplateLive({
        context,
        payload: {
          runId: "run-live-error",
          templateId: "tpl-asr",
        },
      }),
    ).rejects.toThrow("missing template variables: apiKey, baseUrl");

    expect(gatewayMocks.executeTemplate).not.toHaveBeenCalled();
    expect(context.logTrace).toHaveBeenCalledWith(
      "template_test live error",
      expect.objectContaining({
        event: "application.template_test.live",
        status: "error",
        runId: "run-live-error",
      }),
    );
  });
});

