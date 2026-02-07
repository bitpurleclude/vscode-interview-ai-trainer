import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_emitLlmTestRequest(
  host: ItWebviewHandlersHost,
  detail: Record<string, unknown>,
): void {
  const stamp = new Date().toISOString();
  host.outputChannel.appendLine(`[${stamp}] LLM test request`);
  try {
    host.outputChannel.appendLine(JSON.stringify(detail, null, 2));
  } catch {
    host.outputChannel.appendLine(String(detail));
  }
  host.outputChannel.show(true);
}
