import { describe, expect, it, vi } from "vitest";
import {
  it_refreshTokenFromWebview,
  it_saveTemplateSecretFromWebview,
} from "./it_templateActions";

describe("it_templateActions logging", () => {
  it("logs save secret lifecycle without leaking value", async () => {
    const saveTemplatesConfig = vi.fn();
    const saveTemplateSecrets = vi.fn((templatesConfig: any, env: string, secrets: string[]) => ({
      ...templatesConfig,
      environments: {
        ...(templatesConfig.environments || {}),
        [env]: {
          ...((templatesConfig.environments || {})[env] || {}),
          secrets,
        },
      },
    }));

    const context: any = {
      extensionContext: {
        secrets: {
          store: vi.fn(async () => {}),
          delete: vi.fn(async () => {}),
        },
      },
      configService: {
        loadBundle: vi.fn(() => ({
          api: { active: { environment: "prod" } },
          templates: { version: 1, environments: { prod: { secrets: ["existing"] } } },
        })),
        saveTemplateSecrets,
        saveTemplatesConfig,
      },
      refreshConfigSnapshot: vi.fn(async () => ({ ok: true })),
      tokenService: {
        refreshTokenByName: vi.fn(async () => {}),
        refreshAll: vi.fn(async () => {}),
      },
      logCorpusTrace: vi.fn(),
    };

    await it_saveTemplateSecretFromWebview({
      context,
      payload: {
        name: "demo",
        value: "super-secret-value",
      },
    });

    expect(context.extensionContext.secrets.store).toHaveBeenCalledWith(
      "interviewTrainer.prod.secret.demo",
      "super-secret-value",
    );
    expect(context.configService.saveTemplatesConfig).toHaveBeenCalledWith(
      expect.objectContaining({
        environments: expect.objectContaining({
          prod: expect.objectContaining({
            secret_hints: expect.objectContaining({
              demo: "sup***lue",
            }),
          }),
        }),
      }),
    );
    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "template save_secret success",
      expect.objectContaining({
        event: "application.template_secret.save",
        name: "demo",
        hasValue: true,
      }),
    );
    const serializedCalls = JSON.stringify(context.logCorpusTrace.mock.calls);
    expect(serializedCalls).not.toContain("super-secret-value");
  });

  it("logs token refresh payload errors", async () => {
    const context: any = {
      extensionContext: {
        secrets: {
          store: vi.fn(async () => {}),
          delete: vi.fn(async () => {}),
        },
      },
      configService: {
        loadBundle: vi.fn(() => ({ api: { active: { environment: "prod" } } })),
      },
      refreshConfigSnapshot: vi.fn(async () => ({ ok: true })),
      tokenService: {
        refreshTokenByName: vi.fn(async () => {}),
        refreshAll: vi.fn(async () => {}),
      },
      logCorpusTrace: vi.fn(),
    };

    await expect(
      it_refreshTokenFromWebview({
        context,
        payload: {},
      }),
    ).rejects.toThrow(/missing token name/i);

    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "template refresh_token error",
      expect.objectContaining({
        event: "application.template_token.refresh",
        reason: "missing_token_name",
      }),
    );
  });

  it("rejects invalid secret name and logs reason", async () => {
    const context: any = {
      extensionContext: {
        secrets: {
          store: vi.fn(async () => {}),
          delete: vi.fn(async () => {}),
        },
      },
      configService: {
        loadBundle: vi.fn(() => ({
          api: { active: { environment: "prod" } },
          templates: { version: 1, environments: { prod: { secrets: [] } } },
        })),
        saveTemplateSecrets: vi.fn(),
        saveTemplatesConfig: vi.fn(),
      },
      refreshConfigSnapshot: vi.fn(async () => ({ ok: true })),
      tokenService: {
        refreshTokenByName: vi.fn(async () => {}),
        refreshAll: vi.fn(async () => {}),
      },
      logCorpusTrace: vi.fn(),
    };

    await expect(
      it_saveTemplateSecretFromWebview({
        context,
        payload: {
          name: "ark api key",
          value: "x",
        },
      }),
    ).rejects.toThrow(/invalid secret name/i);

    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "template save_secret error",
      expect.objectContaining({
        event: "application.template_secret.save",
        reason: "invalid_secret_name",
      }),
    );
    expect(context.configService.saveTemplateSecrets).not.toHaveBeenCalled();
    expect(context.extensionContext.secrets.store).not.toHaveBeenCalled();
  });
});
