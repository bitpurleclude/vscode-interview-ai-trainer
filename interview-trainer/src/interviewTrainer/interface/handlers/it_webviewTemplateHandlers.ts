import {
  it_deleteTemplateFromWebview,
  it_deleteTemplateSecretFromWebview,
  it_refreshAllTokensFromWebview,
  it_refreshTokenFromWebview,
  it_saveTemplateBindingsFromWebview,
  it_saveTemplateFromWebview,
  it_saveTemplateParamOptionsFromWebview,
  it_saveTemplateSecretFromWebview,
  it_setTokenAutoRefreshFromWebview,
  type ItTemplateConfigResult,
  type ItTemplateUseCaseContext,
} from "../../application/useCases/it_templateActions";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createTemplateUseCaseContext(
  host: ItWebviewHandlersHost,
): ItTemplateUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    tokenService: host.tokenService,
  };
}

async function it_runTemplateConfigUseCase<T>(
  host: ItWebviewHandlersHost,
  useCase: (params: {
    context: ItTemplateUseCaseContext;
    payload: unknown;
  }) => Promise<ItTemplateConfigResult<T>>,
  payload: unknown,
): Promise<T> {
  const result = await useCase({
    context: it_createTemplateUseCaseContext(host),
    payload,
  });
  host.configBundle = result.configBundle;
  host.configSnapshot = result.configSnapshot;
  host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  return result.value;
}

export function it_registerTemplateHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/saveTemplate", async (msg) =>
    it_runTemplateConfigUseCase(host, it_saveTemplateFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/deleteTemplate", async (msg) =>
    it_runTemplateConfigUseCase(host, it_deleteTemplateFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/saveTemplateBindings", async (msg) =>
    it_runTemplateConfigUseCase(host, it_saveTemplateBindingsFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/saveTemplateParamOptions", async (msg) =>
    it_runTemplateConfigUseCase(host, it_saveTemplateParamOptionsFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/saveTemplateSecret", async (msg) =>
    it_runTemplateConfigUseCase(host, it_saveTemplateSecretFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/deleteTemplateSecret", async (msg) =>
    it_runTemplateConfigUseCase(host, it_deleteTemplateSecretFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/refreshToken", async (msg) =>
    it_refreshTokenFromWebview({
      context: it_createTemplateUseCaseContext(host),
      payload: msg.data,
    }),
  );

  host.webviewProtocol.on("it/refreshAllTokens", async () =>
    it_refreshAllTokensFromWebview({
      context: it_createTemplateUseCaseContext(host),
    }),
  );

  host.webviewProtocol.on("it/setTokenAutoRefresh", async (msg) =>
    it_runTemplateConfigUseCase(host, it_setTokenAutoRefreshFromWebview, msg.data),
  );
}
