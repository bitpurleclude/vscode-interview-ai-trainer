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
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItEnvironmentHandlersPort } from "./it_webviewHandlerPorts";

function it_createEnvironmentContext(host: ItEnvironmentHandlersPort): ItEnvironmentConfigContext {
  return {
    configBundle: host.configBundle,
    configService: host.configService,
    refreshConfigSnapshot: host.refreshConfigSnapshot,
    buildConfigSnapshot: host.buildConfigSnapshot,
  };
}

async function it_runEnvironmentUseCase<T>(
  host: ItEnvironmentHandlersPort,
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

export function it_registerEnvironmentHandlers(host: ItEnvironmentHandlersPort): void {
  host.webviewProtocol.on("it/setActiveEnvironment", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/setActiveEnvironment",
        event: "interface.environment.set_active",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_setActiveEnvironment, msg.data),
    ),
  );

  host.webviewProtocol.on("it/createTemplateEnvironment", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/createTemplateEnvironment",
        event: "interface.environment.create",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_createTemplateEnvironment, msg.data),
    ),
  );

  host.webviewProtocol.on("it/deleteTemplateEnvironment", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/deleteTemplateEnvironment",
        event: "interface.environment.delete",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_deleteTemplateEnvironment, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateTopicSettings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateTopicSettings",
        event: "interface.environment.update_topic_settings",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_updateTopicSettings, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateAsrSettings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateAsrSettings",
        event: "interface.environment.update_asr_settings",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_updateAsrSettings, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateLlmSettings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateLlmSettings",
        event: "interface.environment.update_llm_settings",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_updateLlmSettings, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateLlmTaskProfiles", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateLlmTaskProfiles",
        event: "interface.environment.update_llm_task_profiles",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_updateLlmTaskProfiles, msg.data),
    ),
  );

  host.webviewProtocol.on("it/saveLlmProfile", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveLlmProfile",
        event: "interface.environment.save_llm_profile",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_saveLlmProfile, msg.data),
    ),
  );

  host.webviewProtocol.on("it/deleteLlmProfile", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/deleteLlmProfile",
        event: "interface.environment.delete_llm_profile",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_deleteLlmProfile, msg.data),
    ),
  );

  host.webviewProtocol.on("it/savePrompts", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/savePrompts",
        event: "interface.environment.save_prompts",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_savePrompts, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateStreamingSettings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateStreamingSettings",
        event: "interface.environment.update_streaming_settings",
        payload: msg.data,
      },
      () => it_runEnvironmentUseCase(host, it_updateStreamingSettings, msg.data),
    ),
  );
}
