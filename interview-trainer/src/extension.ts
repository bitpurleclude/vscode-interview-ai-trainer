import path from "path";
import * as vscode from "vscode";

import { InterviewTrainerExtension } from "./interviewTrainer/InterviewTrainerExtension";
import { it_ensureConfigFiles, it_getUserConfigDir } from "./interviewTrainer/infra/api/it_apiConfig";
import { it_registerE2ETestCommands } from "./interviewTrainer/interface/e2e/it_e2eCommandRegistration";
import {
  InterviewTrainerWebviewViewProvider,
  type ItWebviewLifecycleEvent,
} from "./webview/InterviewTrainerWebviewViewProvider";

function it_commandErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function it_runLoggedCommand<T>(
  trainer: InterviewTrainerExtension,
  options: {
    commandId: string;
    event: string;
    detail?: Record<string, unknown>;
  },
  run: () => Promise<T> | T,
): Promise<T> {
  trainer.logCorpusTrace(`${options.commandId} request`, {
    event: options.event,
    status: "request",
    ...(options.detail || {}),
  });
  try {
    const result = await run();
    trainer.logCorpusTrace(`${options.commandId} success`, {
      event: options.event,
      status: "success",
      ...(options.detail || {}),
    });
    return result;
  } catch (error) {
    trainer.logCorpusTrace(`${options.commandId} error`, {
      event: options.event,
      status: "error",
      error: it_commandErrorMessage(error),
      ...(options.detail || {}),
    });
    throw error;
  }
}

type ItBridgeLogLevel = "debug" | "info" | "warn" | "error";

function it_logWebviewBridge(
  trainer: InterviewTrainerExtension,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
  level: ItBridgeLogLevel = "info",
): void {
  trainer.logCorpusTrace(`webview bridge ${action} ${status}`, {
    event: `extension.webview_bridge.${action}`,
    status,
    level,
    module: "extension",
    ...(detail || {}),
  });
}

export function activate(context: vscode.ExtensionContext) {
  const viewProvider = new InterviewTrainerWebviewViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InterviewTrainerWebviewViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: false } },
    ),
  );

  const trainer = new InterviewTrainerExtension(context, viewProvider.webviewProtocol);
  context.subscriptions.push(trainer);

  viewProvider.setLifecycleObserver((event: ItWebviewLifecycleEvent) => {
    if (event.type !== "webview_resolved") {
      return;
    }
    it_logWebviewBridge(
      trainer,
      "resolve",
      "success",
      { viewType: event.viewType },
      "debug",
    );
  });

  const sendToWebview = async (messageType: string, data?: any): Promise<boolean> => {
    it_logWebviewBridge(
      trainer,
      "send",
      "request",
      {
        messageType,
        hasData: data !== undefined,
      },
      "debug",
    );
    await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!viewProvider.webviewProtocol.webview) {
      it_logWebviewBridge(
        trainer,
        "send",
        "skipped",
        {
          messageType,
          reason: "webview_not_ready",
        },
        "warn",
      );
      return false;
    }
    try {
      viewProvider.webviewProtocol.send(messageType, data);
      it_logWebviewBridge(
        trainer,
        "send",
        "success",
        {
          messageType,
        },
        "debug",
      );
      return true;
    } catch (error) {
      it_logWebviewBridge(
        trainer,
        "send",
        "error",
        {
          messageType,
          errorCode: "webview_send_failed",
          error: it_commandErrorMessage(error),
        },
        "error",
      );
      return false;
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.open", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.open",
          event: "extension.command.open",
        },
        async () => {
          await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.analyzeAudioFile", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.analyzeAudioFile",
          event: "extension.command.analyze_audio_file",
        },
        async () => {
          const selection = await vscode.window.showOpenDialog({
            canSelectFiles: true,
            canSelectFolders: false,
            canSelectMany: false,
            filters: { Audio: ["wav", "m4a", "mp3", "aac"] },
          });
          if (!selection || selection.length === 0) {
            trainer.logCorpusTrace("itInterviewTrainer.analyzeAudioFile cancelled", {
              event: "extension.command.analyze_audio_file",
              status: "cancelled",
            });
            return;
          }
          await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
          await vscode.window.showInformationMessage(
            "已选中音频文件，请在面试训练助手面板中点击“导入音频”后开始分析。",
          );
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openSettings", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.openSettings",
          event: "extension.command.open_settings",
        },
        async () => {
          const sent = await sendToWebview("it/showSettings");
          if (sent) {
            return;
          }
          it_ensureConfigFiles(context);
          const configDir = it_getUserConfigDir(context);
          const target = path.join(configDir, "api_config.yaml");
          trainer.logCorpusTrace("itInterviewTrainer.openSettings fallback", {
            event: "extension.command.open_settings",
            status: "fallback",
            target,
          });
          await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
        },
      ),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openHistory", async () =>
      it_runLoggedCommand(
        trainer,
        {
          commandId: "itInterviewTrainer.openHistory",
          event: "extension.command.open_history",
        },
        async () => {
          const sent = await sendToWebview("it/showHistory");
          if (sent) {
            return;
          }
          trainer.logCorpusTrace("itInterviewTrainer.openHistory fallback", {
            event: "extension.command.open_history",
            status: "fallback",
          });
          await vscode.window.showInformationMessage("请先打开面试训练助手面板。");
        },
      ),
    ),
  );

  it_registerE2ETestCommands({
    context,
    trainer,
    viewProvider,
    sendToWebview,
    logWebviewBridge: (action, status, detail, level) =>
      it_logWebviewBridge(trainer, action, status, detail, level),
  });
}

export function deactivate() {}
