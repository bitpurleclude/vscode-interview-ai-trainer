import type * as vscode from "vscode";
import type { ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import type { ItApiConfig, ItConfigBundle } from "./it_configGateway";
import type { ItWebviewPort } from "./it_webviewPort";

type ItBootstrapConfigService = {
  loadBundle: () => ItConfigBundle;
};

type ItBootstrapTokenService = {
  sync: () => void;
};

export interface ItExtensionBootstrapHost {
  context: vscode.ExtensionContext;
  webviewProtocol: ItWebviewPort;
  outputChannel: vscode.OutputChannel;
  configService: ItBootstrapConfigService;
  configBundle: ItConfigBundle;
  tokenService: ItBootstrapTokenService;
  configSnapshot: ItConfigSnapshot;
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
  updateCorpusWatchers: () => void;
  registerHandlers: () => void;
  scheduleEmbeddingWarmup: (reason: string, delayMs?: number) => void;
}

export type ItExtensionBootstrapDeps = {
  createOutputChannel: (name: string) => vscode.OutputChannel;
  createConfigService: (context: vscode.ExtensionContext) => ItBootstrapConfigService;
  createTokenService: (host: ItExtensionBootstrapHost) => ItBootstrapTokenService;
};

export function it_bootstrapExtensionHost(
  host: ItExtensionBootstrapHost,
  deps: ItExtensionBootstrapDeps,
): void {
  host.outputChannel = deps.createOutputChannel("Interview Trainer");
  host.configService = deps.createConfigService(host.context);
  host.configBundle = host.configService.loadBundle();
  host.tokenService = deps.createTokenService(host);
  host.tokenService.sync();
  host.configSnapshot = host.buildConfigSnapshot(host.configBundle.api);
  host.updateCorpusWatchers();
  host.registerHandlers();
  host.scheduleEmbeddingWarmup("startup");
}
