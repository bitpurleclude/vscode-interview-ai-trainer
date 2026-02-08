import fs from "fs";
import path from "path";
import * as vscode from "vscode";

import type { ItAnalyzeRequest } from "./protocol/interviewTrainer";
import { InterviewTrainerExtension } from "./interviewTrainer/InterviewTrainerExtension";
import { it_ensureConfigFiles, it_getUserConfigDir } from "./interviewTrainer/infra/api/it_apiConfig";
import { InterviewTrainerWebviewViewProvider } from "./webview/InterviewTrainerWebviewViewProvider";

const IT_E2E_FIXTURE_AUDIO_MAX_BYTES = 256 * 1024;
const IT_E2E_FIXTURE_ANALYZE_COMMAND = "itInterviewTrainer.__test.runFixtureAnalyze";

function it_findFixtureFile(
  fixtureDir: string,
  matcher: (name: string) => boolean,
  label: string,
): string {
  const entries = fs.readdirSync(fixtureDir, { withFileTypes: true });
  const found = entries.find((entry) => entry.isFile() && matcher(entry.name));
  if (!found) {
    throw new Error(`Missing ${label} fixture in ${fixtureDir}`);
  }
  return path.join(fixtureDir, found.name);
}

function it_cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value ?? {})) as T;
}

function it_buildFixtureAnalyzeRequest(workspaceRoot: string): ItAnalyzeRequest {
  const fixtureDir = path.join(workspaceRoot, "testdata");
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }

  const markdownPath = it_findFixtureFile(
    fixtureDir,
    (name) => name.toLowerCase().endsWith(".md"),
    "markdown",
  );
  const audioPath = it_findFixtureFile(
    fixtureDir,
    (name) => /\.(m4a|wav|mp3|aac)$/i.test(name),
    "audio",
  );

  const markdownText = fs.readFileSync(markdownPath, "utf-8").trim();
  const lines = markdownText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const audioRaw = fs.readFileSync(audioPath);
  const audioBuffer = audioRaw.subarray(0, Math.min(audioRaw.length, IT_E2E_FIXTURE_AUDIO_MAX_BYTES));
  const audioExt = path.extname(audioPath).toLowerCase();
  const audioFormat = audioExt === ".wav" ? "wav" : "m4a";

  const questionText = lines[0] || "fixture question";
  const questionList = lines.filter((line) => line.length >= 8).slice(0, 3);

  return {
    audio: {
      format: audioFormat,
      sampleRate: 16000,
      byteLength: audioBuffer.byteLength,
      durationSec: Math.max(1, Math.round(audioBuffer.byteLength / 16000)),
      base64: audioBuffer.toString("base64"),
    },
    questionText,
    questionList: questionList.length ? questionList : [questionText],
    runId: `e2e-fixture-${Date.now()}`,
  };
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

  const sendToWebview = async (messageType: string, data?: any): Promise<boolean> => {
    await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!viewProvider.webviewProtocol.webview) {
      return false;
    }
    viewProvider.webviewProtocol.send(messageType, data);
    return true;
  };

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.open", () => {
      void vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.analyzeAudioFile", async () => {
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
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openSettings", async () => {
      const sent = await sendToWebview("it/showSettings");
      if (!sent) {
        it_ensureConfigFiles(context);
        const configDir = it_getUserConfigDir(context);
        const target = path.join(configDir, "api_config.yaml");
        await vscode.commands.executeCommand("vscode.open", vscode.Uri.file(target));
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("itInterviewTrainer.openHistory", async () => {
      const sent = await sendToWebview("it/showHistory");
      if (!sent) {
        void vscode.window.showInformationMessage("请先打开面试训练助手面板。");
      }
    }),
  );

  if (process.env.IT_E2E_ENABLE_TEST_COMMANDS === "1") {
    context.subscriptions.push(
      vscode.commands.registerCommand(IT_E2E_FIXTURE_ANALYZE_COMMAND, async () => {
        const workspaceRoot =
          vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
          path.resolve(context.extensionPath, "..");
        const request = it_buildFixtureAnalyzeRequest(workspaceRoot);

        const originalBundle = trainer.configService.loadBundle();
        const testBundle = it_cloneJson(originalBundle);
        const env = String(testBundle.api?.active?.environment || "prod");
        const envConfig = {
          ...(testBundle.api?.environments?.[env] || {}),
          llm: {
            ...((testBundle.api?.environments?.[env] || {}).llm || {}),
            api_key: "",
            apiKey: "",
          },
        };

        testBundle.api = {
          ...testBundle.api,
          active: {
            ...(testBundle.api?.active || {}),
            environment: env,
          },
          environments: {
            ...(testBundle.api?.environments || {}),
            [env]: envConfig,
          },
        };
        testBundle.skill = {
          ...(testBundle.skill || {}),
          asr: {
            ...((testBundle.skill || {}).asr || {}),
            provider: "mock",
            mock_text: request.questionList?.join("\n") || request.questionText || "e2e transcript",
            timeout_sec: 10,
            max_retries: 0,
          },
          retrieval: {
            ...((testBundle.skill || {}).retrieval || {}),
            enabled: false,
          },
        };

        trainer.configBundle = testBundle;
        const originalLoadBundle = trainer.configService.loadBundle.bind(trainer.configService);
        trainer.configService.loadBundle = () => it_cloneJson(testBundle);

        try {
          const result = await trainer.handleAnalyze(request);
          return {
            status: "success",
            reportPath: result.reportPath,
            topicDir: result.topicDir,
            questionCount: Array.isArray(result.questionList)
              ? result.questionList.length
              : 0,
            overallScore: result.evaluation?.overallScore ?? null,
          };
        } catch (error) {
          return {
            status: "error",
            error: error instanceof Error ? error.message : String(error),
            stateError: trainer.state.lastError?.reason || "",
          };
        } finally {
          trainer.configService.loadBundle = originalLoadBundle;
          trainer.configBundle = originalBundle;
        }
      }),
    );
  }
}

export function deactivate() {}
