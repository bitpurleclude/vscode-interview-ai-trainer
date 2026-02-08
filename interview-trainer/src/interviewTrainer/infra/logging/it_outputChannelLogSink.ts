import type * as vscode from "vscode";

export type ItStructuredLogSink = (serializedLine: string) => void;

export function it_createOutputChannelLogSink(
  outputChannel: vscode.OutputChannel,
): ItStructuredLogSink {
  return (serializedLine) => {
    outputChannel.appendLine(serializedLine);
  };
}
