import * as vscode from "vscode";
import {
  it_createProviderConfigFromWebview,
  it_openProviderConfigFromWebview,
  type ItProviderConfigResult,
  type ItProviderUseCaseContext,
  it_saveProviderConfigFromWebview,
} from "../../application/useCases/it_providerActions";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createProviderUseCaseContext(host: ItWebviewHandlersHost): ItProviderUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    buildConfigSnapshot: host.buildConfigSnapshot,
    openFile: async (filePath) => {
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath));
    },
  };
}

async function it_runProviderConfigUseCase<T>(
  host: ItWebviewHandlersHost,
  useCase: (params: {
    context: ItProviderUseCaseContext;
    payload: unknown;
  }) => Promise<ItProviderConfigResult<T>>,
  payload: unknown,
): Promise<T> {
  const result = await useCase({
    context: it_createProviderUseCaseContext(host),
    payload,
  });
  host.configBundle = result.configBundle;
  host.configSnapshot = result.configSnapshot;
  host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  return result.value;
}

export function it_registerProviderHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/createProviderConfig", async (msg) =>
    it_runProviderConfigUseCase(host, it_createProviderConfigFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/saveProviderConfig", async (msg) =>
    it_runProviderConfigUseCase(host, it_saveProviderConfigFromWebview, msg.data),
  );

  host.webviewProtocol.on("it/openProviderConfig", async (msg) =>
    it_openProviderConfigFromWebview({
      context: it_createProviderUseCaseContext(host),
      payload: msg.data,
    }),
  );
}
