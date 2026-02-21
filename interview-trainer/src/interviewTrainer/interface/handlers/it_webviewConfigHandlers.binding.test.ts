import { describe, expect, it, vi } from "vitest";

const registerMocks = vi.hoisted(() => ({
  template: vi.fn(),
  environment: vi.fn(),
  provider: vi.fn(),
  workspace: vi.fn(),
}));

vi.mock("./it_webviewTemplateHandlers", () => ({
  it_registerTemplateHandlers: registerMocks.template,
}));

vi.mock("./it_webviewEnvironmentHandlers", () => ({
  it_registerEnvironmentHandlers: registerMocks.environment,
}));

vi.mock("./it_webviewProviderHandlers", () => ({
  it_registerProviderHandlers: registerMocks.provider,
}));

vi.mock("./it_webviewWorkspaceHandlers", () => ({
  it_registerWorkspaceHandlers: registerMocks.workspace,
}));

import { it_registerConfigHandlers } from "./it_webviewConfigHandlers";

describe("it_webviewConfigHandlers", () => {
  it("registers template/environment/provider/workspace handlers", () => {
    const host = { marker: "host" } as any;

    it_registerConfigHandlers(host);

    expect(registerMocks.template).toHaveBeenCalledWith(host);
    expect(registerMocks.environment).toHaveBeenCalledWith(host);
    expect(registerMocks.provider).toHaveBeenCalledWith(host);
    expect(registerMocks.workspace).toHaveBeenCalledWith(host);
  });
});

