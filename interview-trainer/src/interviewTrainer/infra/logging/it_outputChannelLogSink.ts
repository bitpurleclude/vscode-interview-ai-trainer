import type * as vscode from "vscode";

export type ItStructuredLogSink = (serializedLine: string) => void;

export function it_createOutputChannelLogSink(
  outputChannel: vscode.OutputChannel | undefined | null,
): ItStructuredLogSink {
  return (serializedLine) => {
    if (!outputChannel || typeof outputChannel.appendLine !== "function") {
      return;
    }
    try {
      outputChannel.appendLine(serializedLine);
    } catch {
      // swallow sink failures to avoid breaking business requests
    }
  };
}
