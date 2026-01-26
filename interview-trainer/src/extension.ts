import path from "path";
import * as vscode from "vscode";

import { InterviewTrainerExtension } from "./interviewTrainer/InterviewTrainerExtension";
import { InterviewTrainerWebviewViewProvider } from "./webview/InterviewTrainerWebviewViewProvider";
import { it_ensureConfigFiles, it_getUserConfigDir } from "./interviewTrainer/api/it_apiConfig";

export function activate(context: vscode.ExtensionContext) {
  const viewProvider = new InterviewTrainerWebviewViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      InterviewTrainerWebviewViewProvider.viewType,
      viewProvider,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  new InterviewTrainerExtension(context, viewProvider.webviewProtocol);

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.open", () => {
      vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "itInterviewTrainer.analyzeAudioFile",
      async () => {
        const selection = await vscode.window.showOpenDialog({
          canSelectFiles: true,
          canSelectFolders: false,
          canSelectMany: false,
          filters: { Audio: ["wav", "m4a", "mp3", "aac"] },
        });
        if (!selection || selection.length === 0) {
          return;
        }
        void vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
        void vscode.window.showInformationMessage(
          "已选中音频文件，请在面试训练助手面板中点击“导入音频”后开始分析。",
        );
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openSettings", async () => {
      it_ensureConfigFiles(context);
      const configDir = it_getUserConfigDir(context);
      const target = path.join(configDir, "api_config.yaml");
      await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openHistory", () => {
      void vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
      void vscode.window.showInformationMessage(
        "历史记录已在面试训练助手面板提供。",
      );
    }),
  );
}

export function deactivate() {}
