import * as vscode from "vscode";
import {
  it_analyzeAudioFromWebview,
  it_cancelAnalyzeFromWebview,
  it_openResultFileFromWebview,
  type ItResultUseCaseContext,
} from "../../application/useCases/it_resultActions";
import {
  it_saveCurrentResult,
  type ItSaveCurrentResultPayload,
} from "../../application/useCases/it_saveCurrentResult";
import { it_runLoggedHandler } from "./it_webviewHandlerLogging";
import type { ItResultHandlersPort } from "./it_webviewHandlerPorts";

function it_createResultUseCaseContext(host: ItResultHandlersPort): ItResultUseCaseContext {
  return {
    openFile: async (filePath) => {
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(filePath));
    },
    analyzeAudio: async (request) => await host.handleAnalyze(request),
    getAnalysisAbort: () => host.analysisAbort,
    getState: () => host.state,
    updateState: (next) => {
      host.updateState(next);
    },
    logCorpusTrace: host.logCorpusTrace,
  };
}

export function it_registerResultHandlers(host: ItResultHandlersPort): void {
  host.webviewProtocol.on("openFile", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "openFile",
        event: "interface.result.open_file",
        payload: msg.data,
      },
      () =>
        it_openResultFileFromWebview({
          context: it_createResultUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/analyzeAudio", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/analyzeAudio",
        event: "interface.result.analyze_audio",
        payload: msg.data,
      },
      () =>
        it_analyzeAudioFromWebview({
          context: it_createResultUseCaseContext(host),
          payload: msg.data,
        }),
    ),
  );

  host.webviewProtocol.on("it/saveCurrentResult", async (msg) =>
    it_runLoggedHandler(
      host,
      {
        request: "it/saveCurrentResult",
        event: "interface.result.save_current",
        payload: msg.data,
      },
      async () =>
        await it_saveCurrentResult({
          payload: (msg.data || {}) as ItSaveCurrentResultPayload,
          configBundle: host.configBundle,
          requireWorkspaceRoot: () => host.requireWorkspaceRoot(),
          onTrace: host.logCorpusTrace,
        }),
    ),
  );

  host.webviewProtocol.on("it/cancelAnalyze", async () =>
    it_runLoggedHandler(
      host,
      {
        request: "it/cancelAnalyze",
        event: "interface.result.cancel_analyze",
      },
      () =>
        it_cancelAnalyzeFromWebview({
          context: it_createResultUseCaseContext(host),
        }),
    ),
  );
}
