import {
  it_clearCorpusCacheFromWebview,
  it_clearEmbeddingCacheFromWebview,
  type ItRetrievalConfigResult,
  type ItRetrievalResult,
  type ItRetrievalUseCaseContext,
  it_setRetrievalEnabledFromWebview,
  it_updateRetrievalSettingsFromWebview,
} from "../../application/useCases/it_retrievalActions";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItRetrievalHandlersPort } from "./it_webviewHandlerPorts";

function it_createRetrievalUseCaseContext(
  host: ItRetrievalHandlersPort,
): ItRetrievalUseCaseContext {
  return {
    extensionContext: host.context,
    configService: host.configService,
    refreshConfigSnapshot: () => host.refreshConfigSnapshot(),
    requireWorkspaceRoot: () => host.requireWorkspaceRoot(),
    normalizeWorkspaceKey: (root) => host.normalizeWorkspaceKey(root),
    scheduleEmbeddingWarmup: (reason, delayMs) => {
      host.scheduleEmbeddingWarmup(reason, delayMs);
    },
    updateEmbeddingWarmup: (next) => {
      host.updateEmbeddingWarmup(next);
    },
    logCorpusTrace: (message, detail) => {
      host.logCorpusTrace(message, detail);
    },
  };
}

function it_applyRetrievalPatch(
  host: ItRetrievalHandlersPort,
  patch: ItRetrievalResult<unknown>["patch"],
): void {
  if (patch?.corpusDirty !== undefined) {
    host.corpusDirty = patch.corpusDirty;
  }
}

async function it_runRetrievalConfigUseCase<T>(
  host: ItRetrievalHandlersPort,
  useCase: (params: {
    context: ItRetrievalUseCaseContext;
    payload: unknown;
  }) => Promise<ItRetrievalConfigResult<T>>,
  payload: unknown,
): Promise<T> {
  const result = await useCase({
    context: it_createRetrievalUseCaseContext(host),
    payload,
  });
  host.configBundle = result.configBundle;
  host.configSnapshot = result.configSnapshot;
  it_applyRetrievalPatch(host, result.patch);
  host.webviewProtocol.send("it/configUpdate", result.configSnapshot);
  return result.value;
}

async function it_runRetrievalUseCase<T>(
  host: ItRetrievalHandlersPort,
  useCase: (params: {
    context: ItRetrievalUseCaseContext;
  }) => Promise<ItRetrievalResult<T>>,
): Promise<T> {
  const result = await useCase({
    context: it_createRetrievalUseCaseContext(host),
  });
  host.configBundle = result.configBundle;
  it_applyRetrievalPatch(host, result.patch);
  return result.value;
}

export function it_registerRetrievalHandlers(host: ItRetrievalHandlersPort): void {
  host.webviewProtocol.on("it/setRetrievalEnabled", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/setRetrievalEnabled",
        event: "interface.retrieval.set_enabled",
        payload: msg.data,
      },
      () => it_runRetrievalConfigUseCase(host, it_setRetrievalEnabledFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/updateRetrievalSettings", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/updateRetrievalSettings",
        event: "interface.retrieval.update_settings",
        payload: msg.data,
      },
      () => it_runRetrievalConfigUseCase(host, it_updateRetrievalSettingsFromWebview, msg.data),
    ),
  );

  host.webviewProtocol.on("it/clearEmbeddingCache", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/clearEmbeddingCache",
        event: "interface.retrieval.clear_embedding_cache",
      },
      () => it_runRetrievalUseCase(host, it_clearEmbeddingCacheFromWebview),
    ),
  );

  host.webviewProtocol.on("it/clearCorpusCache", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/clearCorpusCache",
        event: "interface.retrieval.clear_corpus_cache",
      },
      () => it_runRetrievalUseCase(host, it_clearCorpusCacheFromWebview),
    ),
  );
}
