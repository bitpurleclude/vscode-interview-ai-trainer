import { describe, expect, it, vi } from "vitest";
import {
  it_createProviderConfigFromWebview,
  it_saveProviderConfigFromWebview,
} from "./it_providerActions";

describe("it_providerActions logging", () => {
  it("logs create provider success", async () => {
    let bundle: any = {
      api: { active: { environment: "prod" } },
      providers: {},
    };
    const context: any = {
      extensionContext: {},
      configService: {
        loadBundle: vi.fn(() => bundle),
        saveProviderConfig: vi.fn((providerId: string, profile: unknown) => {
          bundle = {
            ...bundle,
            providers: {
              ...(bundle.providers || {}),
              [providerId]: profile,
            },
          };
        }),
      },
      buildConfigSnapshot: vi.fn(() => ({ ok: true })),
      openFile: vi.fn(async () => {}),
      logCorpusTrace: vi.fn(),
    };

    await it_createProviderConfigFromWebview({
      context,
      payload: { providerId: "demo", displayName: "Demo" },
    });

    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "provider create_config success",
      expect.objectContaining({
        event: "application.provider.create_config",
        providerId: "demo",
      }),
    );
  });

  it("logs save provider missing id errors", async () => {
    const context: any = {
      extensionContext: {},
      configService: {
        loadBundle: vi.fn(() => ({ api: { active: { environment: "prod" } }, providers: {} })),
        saveProviderConfig: vi.fn(),
      },
      buildConfigSnapshot: vi.fn(() => ({ ok: true })),
      openFile: vi.fn(async () => {}),
      logCorpusTrace: vi.fn(),
    };

    await expect(
      it_saveProviderConfigFromWebview({
        context,
        payload: { profile: {} },
      }),
    ).rejects.toThrow(/missing providerId/i);

    expect(context.logCorpusTrace).toHaveBeenCalledWith(
      "provider save_config error",
      expect.objectContaining({
        event: "application.provider.save_config",
        reason: "missing_provider_id",
      }),
    );
  });
});
