import { describe, expect, it, vi } from "vitest";
import { it_bootstrapExtensionHost } from "./it_extensionBootstrap";

describe("it_bootstrapExtensionHost", () => {
  it("initializes host lifecycle fields and calls startup hooks", () => {
    const mockBundle = {
      api: {
        version: 1,
        active: {
          environment: "prod",
          llm: "default",
          asr: "default",
          acoustic: "default",
        },
        environments: {
          prod: {},
        },
      },
      templates: { version: 1, environments: {} },
      skill: {},
      providers: {},
    };

    const outputChannel = { dispose: vi.fn() } as any;
    const configService = {
      loadBundle: vi.fn(() => mockBundle),
      setTraceSink: vi.fn(),
    };
    const tokenService = { sync: vi.fn() };

    const host = {
      context: {} as any,
      webviewProtocol: { send: vi.fn() } as any,
      outputChannel: null as any,
      configService: null as any,
      configBundle: null as any,
      tokenService: null as any,
      configSnapshot: null as any,
      buildConfigSnapshot: vi.fn(() => ({ ok: true } as any)),
      updateCorpusWatchers: vi.fn(),
      registerHandlers: vi.fn(),
      scheduleEmbeddingWarmup: vi.fn(),
      logCorpusTrace: vi.fn(),
    };

    it_bootstrapExtensionHost(host as any, {
      createOutputChannel: vi.fn(() => outputChannel),
      createConfigService: vi.fn(() => configService),
      createTokenService: vi.fn(() => tokenService),
    });

    expect(host.outputChannel).toBe(outputChannel);
    expect(host.configService).toBe(configService);
    expect(host.configBundle).toBe(mockBundle);
    expect(configService.setTraceSink).toHaveBeenCalledTimes(1);
    expect(host.tokenService).toBe(tokenService);
    expect(host.configSnapshot).toEqual({ ok: true });

    expect(host.buildConfigSnapshot).toHaveBeenCalledWith(mockBundle.api);
    expect(tokenService.sync).toHaveBeenCalledTimes(1);
    expect(host.updateCorpusWatchers).toHaveBeenCalledTimes(1);
    expect(host.registerHandlers).toHaveBeenCalledTimes(1);
    expect(host.scheduleEmbeddingWarmup).toHaveBeenCalledWith("startup");
  });
});
