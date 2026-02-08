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
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItTemplateHandlersPort } from "./it_webviewHandlerPorts";

function it_createTemplateUseCaseContext(
  host: ItTemplateHandlersPort,
): ItTemplateUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    tokenService: host.tokenService,
  };
}

async function it_runTemplateConfigUseCase<T>(
  host: ItTemplateHandlersPort,
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

export function it_registerTemplateHandlers(host: ItTemplateHandlersPort): void {
  host.webviewProtocol.on("it/saveTemplate", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveTemplate",
        event: "interface.template.save",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_saveTemplateFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/deleteTemplate", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/deleteTemplate",
        event: "interface.template.delete",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_deleteTemplateFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/saveTemplateBindings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveTemplateBindings",
        event: "interface.template.save_bindings",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_saveTemplateBindingsFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/saveTemplateParamOptions", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveTemplateParamOptions",
        event: "interface.template.save_param_options",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_saveTemplateParamOptionsFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/saveTemplateSecret", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveTemplateSecret",
        event: "interface.template.save_secret",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_saveTemplateSecretFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/deleteTemplateSecret", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/deleteTemplateSecret",
        event: "interface.template.delete_secret",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_deleteTemplateSecretFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/refreshToken", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/refreshToken",
        event: "interface.template.refresh_token",
        payload: msg.data,
      },
      () =>
        it_refreshTokenFromWebview({
          context: it_createTemplateUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/refreshAllTokens", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/refreshAllTokens",
        event: "interface.template.refresh_all_tokens",
      },
      () =>
        it_refreshAllTokensFromWebview({
          context: it_createTemplateUseCaseContext(host),
        }),
    ),
  );

  host.webviewProtocol.on("it/setTokenAutoRefresh", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/setTokenAutoRefresh",
        event: "interface.template.set_token_auto_refresh",
        payload: msg.data,
      },
      () => it_runTemplateConfigUseCase(host, it_setTokenAutoRefreshFromWebview, msg.data),
    ),
  );
}
