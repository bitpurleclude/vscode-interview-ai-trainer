import type { ItWebviewHandlersHost } from "./it_webviewHandlers";
import { it_registerEnvironmentHandlers } from "./it_webviewEnvironmentHandlers";
import { it_registerProviderHandlers } from "./it_webviewProviderHandlers";
import { it_registerTemplateHandlers } from "./it_webviewTemplateHandlers";
import { it_registerWorkspaceHandlers } from "./it_webviewWorkspaceHandlers";

export function it_registerConfigHandlers(host: ItWebviewHandlersHost): void {
  it_registerTemplateHandlers(host);
  it_registerEnvironmentHandlers(host);
  it_registerProviderHandlers(host);
  it_registerWorkspaceHandlers(host);
}
