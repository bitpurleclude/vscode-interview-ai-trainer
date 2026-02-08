import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ItConfigBundle } from "./it_configGateway";
import { ItTokenService } from "./it_tokens";
import { it_executeTemplate } from "./it_templateGateway";

vi.mock("./it_templateGateway", () => ({
  it_executeTemplate: vi.fn(),
  it_readPath: vi.fn(),
}));

type TestHost = {
  context: {
    secrets: {
      store: ReturnType<typeof vi.fn>;
    };
  };
  webviewProtocol: {
    send: ReturnType<typeof vi.fn>;
  };
  configBundle: ItConfigBundle;
  configSnapshot: Record<string, unknown>;
  buildConfigSnapshot: ReturnType<typeof vi.fn>;
  logCorpusTrace: ReturnType<typeof vi.fn>;
};

function createConfigBundle(): ItConfigBundle {
  return {
    api: {
      active: {
        environment: "prod",
      },
      environments: {
        prod: {},
      },
    },
    skill: {},
    templates: {
      version: 1,
      environments: {
        prod: {
          token_options: {
            auto_refresh: false,
          },
          templates: {
            tokenMain: {
              id: "tokenMain",
              category: "token",
              method: "GET",
              path: "/token",
              token: {
                name: "access",
                enabled: true,
              },
            } as any,
          },
        },
      },
    },
    providers: {
      default: "",
      available: {},
    },
    guardrails: {},
  } as unknown as ItConfigBundle;
}

function createHost(): TestHost {
  const configBundle = createConfigBundle();
  return {
    context: {
      secrets: {
        store: vi.fn().mockResolvedValue(undefined),
      },
    },
    webviewProtocol: {
      send: vi.fn(),
    },
    configBundle,
    configSnapshot: {},
    buildConfigSnapshot: vi.fn().mockReturnValue({ updated: true }),
    logCorpusTrace: vi.fn(),
  };
}

function getTraceEvents(host: TestHost): Array<{ event?: string; status?: string; detail?: unknown }> {
  return host.logCorpusTrace.mock.calls.map((args) => {
    const detail = args[1] as { event?: string; status?: string } | undefined;
    return {
      event: detail?.event,
      status: detail?.status,
      detail,
    };
  });
}

describe("ItTokenService structured logs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("logs sync start/success and keeps token state aligned", () => {
    const host = createHost();
    const service = new ItTokenService(host as any);

    service.sync();

    const events = getTraceEvents(host).map((item) => `${item.event}:${item.status}`);
    expect(events).toContain("application.tokens.sync:start");
    expect(events).toContain("application.tokens.sync:success");

    const snapshot = service.getSnapshot("prod");
    expect(snapshot.tokens).toHaveLength(1);
    expect(snapshot.tokens[0]?.status).toBe("idle");
  });

  it("logs refresh success without leaking token value", async () => {
    const host = createHost();
    const service = new ItTokenService(host as any);
    vi.mocked(it_executeTemplate).mockResolvedValue({ value: "secret-token" } as any);

    await service.refreshTokenByName("access");

    expect(host.context.secrets.store).toHaveBeenCalledWith(
      "interviewTrainer.prod.token.access",
      "secret-token",
    );
    const events = getTraceEvents(host).map((item) => `${item.event}:${item.status}`);
    expect(events).toContain("application.tokens.refresh_single:start");
    expect(events).toContain("application.tokens.refresh_single:success");

    const combinedDetail = JSON.stringify(getTraceEvents(host));
    expect(combinedDetail).not.toContain("secret-token");
  });

  it("logs refresh error and missing token path", async () => {
    const host = createHost();
    const service = new ItTokenService(host as any);
    vi.mocked(it_executeTemplate).mockRejectedValue(new Error("network down"));

    await service.refreshTokenByName("access");
    await service.refreshTokenByName("unknown-token");

    const events = getTraceEvents(host).map((item) => `${item.event}:${item.status}`);
    expect(events).toContain("application.tokens.refresh_single:error");
    expect(events).toContain("application.tokens.refresh_single:not_found");

    const snapshot = service.getSnapshot("prod");
    expect(snapshot.tokens[0]?.status).toBe("error");
  });
});
