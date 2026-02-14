import {
  it_createTemplateEnvironment,
  it_deleteLlmProfile,
  it_deleteTemplateEnvironment,
  type ItEnvironmentConfigContext,
  type ItEnvironmentConfigResult,
  it_runEnvironmentAction,
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
    refreshConfigSnapshot: () => host.refreshConfigSnapshot(),
    buildConfigSnapshot: (apiConfig) => host.buildConfigSnapshot(apiConfig),
    logTrace: (message, detail) => {
      host.logCorpusTrace(message, detail);
    },
  };
}

async function it_runEnvironmentUseCase<T>(
  host: ItEnvironmentHandlersPort,
  action: string,
  useCase: (
    context: ItEnvironmentConfigContext,
    payload: unknown,
  ) => Promise<ItEnvironmentConfigResult<T>>,
  payload: unknown,
): Promise<T> {
  const context = it_createEnvironmentContext(host);
  const result = await it_runEnvironmentAction(context, action, payload, () =>
    useCase(context, payload),
  );
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
      () => it_runEnvironmentUseCase(host, "set_active", it_setActiveEnvironment, msg.data),
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
      () => it_runEnvironmentUseCase(host, "create", it_createTemplateEnvironment, msg.data),
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
      () => it_runEnvironmentUseCase(host, "delete", it_deleteTemplateEnvironment, msg.data),
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
      () => it_runEnvironmentUseCase(host, "update_topic_settings", it_updateTopicSettings, msg.data),
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
      () => it_runEnvironmentUseCase(host, "update_asr_settings", it_updateAsrSettings, msg.data),
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
      () => it_runEnvironmentUseCase(host, "update_llm_settings", it_updateLlmSettings, msg.data),
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
      () => it_runEnvironmentUseCase(host, "update_llm_task_profiles", it_updateLlmTaskProfiles, msg.data),
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
      () => it_runEnvironmentUseCase(host, "save_llm_profile", it_saveLlmProfile, msg.data),
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
      () => it_runEnvironmentUseCase(host, "delete_llm_profile", it_deleteLlmProfile, msg.data),
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
      () => it_runEnvironmentUseCase(host, "save_prompts", it_savePrompts, msg.data),
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
      () => it_runEnvironmentUseCase(host, "update_streaming_settings", it_updateStreamingSettings, msg.data),
    ),
  );
}
