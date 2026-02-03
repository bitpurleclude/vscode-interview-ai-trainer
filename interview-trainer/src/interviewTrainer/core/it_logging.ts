import * as vscode from "vscode";
import { ItConfigSnapshot, ItWorkflowStep } from "../../protocol/interviewTrainer";
import { WebviewProtocol } from "../../webview/WebviewProtocol";

export type ItLogHost = {
  outputChannel: vscode.OutputChannel;
  traceLogsEnabled: boolean;
  webviewProtocol: WebviewProtocol;
  configSnapshot: ItConfigSnapshot;
};

export function it_logEmbeddingTestFailure(host: ItLogHost, error: unknown): void {
  const stamp = new Date().toISOString();
  host.outputChannel.appendLine(`[${stamp}] Embedding test failed.`);
  const debug = (error as { itDebug?: unknown })?.itDebug;
  if (debug) {
    host.outputChannel.appendLine("Request/Response:");
    try {
      host.outputChannel.appendLine(JSON.stringify(debug, null, 2));
    } catch {
      host.outputChannel.appendLine(String(debug));
    }
  }
  if (error instanceof Error) {
    host.outputChannel.appendLine(`Message: ${error.message}`);
  } else if (error) {
    host.outputChannel.appendLine(`Message: ${String(error)}`);
  }
  host.outputChannel.show(true);
}

export function it_logLlmTestFailure(
  host: ItLogHost,
  error: unknown,
  detail?: Record<string, unknown>,
): void {
  const stamp = new Date().toISOString();
  host.outputChannel.appendLine(`[${stamp}] LLM test failed.`);
  if (detail) {
    try {
      host.outputChannel.appendLine(JSON.stringify(detail, null, 2));
    } catch {
      host.outputChannel.appendLine(String(detail));
    }
  }
  const debug = (error as { itDebug?: unknown })?.itDebug;
  if (debug) {
    host.outputChannel.appendLine("Request/Response:");
    try {
      host.outputChannel.appendLine(JSON.stringify(debug, null, 2));
    } catch {
      host.outputChannel.appendLine(String(debug));
    }
  }
  const response = (error as any)?.response;
  if (response?.status || response?.data) {
    try {
      host.outputChannel.appendLine(
        JSON.stringify(
          {
            status: response?.status,
            data: response?.data,
          },
          null,
          2,
        ),
      );
    } catch {
      host.outputChannel.appendLine(String(response?.status ?? ""));
    }
  }
  if (error instanceof Error) {
    host.outputChannel.appendLine(`Message: ${error.message}`);
  } else if (error) {
    host.outputChannel.appendLine(`Message: ${String(error)}`);
  }
  host.outputChannel.show(true);
}

export function it_logCorpusTrace(
  host: ItLogHost,
  message: string,
  detail?: Record<string, unknown>,
): void {
  if (!host.traceLogsEnabled) {
    return;
  }
  const stamp = new Date().toISOString();
  if (detail && Object.keys(detail).length) {
    host.outputChannel.appendLine(
      `[${stamp}] ${message} ${JSON.stringify(detail)}`,
    );
  } else {
    host.outputChannel.appendLine(`[${stamp}] ${message}`);
  }
}

export function it_emitStreamUpdate(
  host: ItLogHost,
  update: {
    step: ItWorkflowStep;
    text: string;
    done?: boolean;
    reset?: boolean;
  },
): void {
  if (host.configSnapshot?.streaming?.enabled === false) {
    return;
  }
  host.webviewProtocol.send("it/stepStreamUpdate", update);
}
