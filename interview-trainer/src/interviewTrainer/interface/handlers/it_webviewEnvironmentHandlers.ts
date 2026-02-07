import {
  it_createTemplateEnvironment,
  it_deleteLlmProfile,
  it_deleteTemplateEnvironment,
  type ItEnvironmentConfigContext,
  type ItEnvironmentConfigResult,
  it_saveLlmProfile,
  it_savePrompts,
  it_setActiveEnvironment,
  it_updateAsrSettings,
  it_updateLlmSettings,
  it_updateLlmTaskProfiles,
  it_updateStreamingSettings,
  it_updateTopicSettings,
} from "../../application/useCases/it_environmentConfig";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

function it_createEnvironmentContext(host: ItWebviewHandlersHost): ItEnvironmentConfigContext {
  return {
    configBundle: host.configBundle,
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    buildConfigSnapshot: host.buildConfigSnapshot,
  };
}

async function it_runEnvironmentUseCase<T>(
  host: ItWebviewHandlersHost,
  useCase: (
    context: ItEnvironmentConfigContext,
    payload: unknown,
  ) => Promise<ItEnvironmentConfigResult<T>>,
  payload: unknown,
): Promise<T> {
  const result = await useCase(it_createEnvironmentContext(host), payload);
  host.configBundle = result.configBundle;
  host.configSnapshot = result.configSnapshot;
  host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  return result.value;
}

export function it_registerEnvironmentHandlers(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/setActiveEnvironment", async (msg) =>
    it_runEnvironmentUseCase(host, it_setActiveEnvironment, msg.data),
  );

  host.webviewProtocol.on("it/createTemplateEnvironment", async (msg) =>
    it_runEnvironmentUseCase(host, it_createTemplateEnvironment, msg.data),
  );

  host.webviewProtocol.on("it/deleteTemplateEnvironment", async (msg) =>
    it_runEnvironmentUseCase(host, it_deleteTemplateEnvironment, msg.data),
  );

  host.webviewProtocol.on("it/updateTopicSettings", async (msg) =>
    it_runEnvironmentUseCase(host, it_updateTopicSettings, msg.data),
  );

  host.webviewProtocol.on("it/updateAsrSettings", async (msg) =>
    it_runEnvironmentUseCase(host, it_updateAsrSettings, msg.data),
  );

  host.webviewProtocol.on("it/updateLlmSettings", async (msg) =>
    it_runEnvironmentUseCase(host, it_updateLlmSettings, msg.data),
  );

  host.webviewProtocol.on("it/updateLlmTaskProfiles", async (msg) =>
    it_runEnvironmentUseCase(host, it_updateLlmTaskProfiles, msg.data),
  );

  host.webviewProtocol.on("it/saveLlmProfile", async (msg) =>
    it_runEnvironmentUseCase(host, it_saveLlmProfile, msg.data),
  );

  host.webviewProtocol.on("it/deleteLlmProfile", async (msg) =>
    it_runEnvironmentUseCase(host, it_deleteLlmProfile, msg.data),
  );

  host.webviewProtocol.on("it/savePrompts", async (msg) =>
    it_runEnvironmentUseCase(host, it_savePrompts, msg.data),
  );

  host.webviewProtocol.on("it/updateStreamingSettings", async (msg) =>
    it_runEnvironmentUseCase(host, it_updateStreamingSettings, msg.data),
  );
}
