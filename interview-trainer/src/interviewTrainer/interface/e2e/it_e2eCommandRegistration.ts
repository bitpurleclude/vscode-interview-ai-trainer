import * as vscode from "vscode";

import type { ItAnalyzeRequest } from "../../../protocol/interviewTrainer";
import { InterviewTrainerExtension } from "../../InterviewTrainerExtension";
import { InterviewTrainerWebviewViewProvider } from "../../../webview/InterviewTrainerWebviewViewProvider";
import {
  IT_E2E_FIXTURE_ANALYZE_COMMAND,
  IT_E2E_WEBVIEW_UI_FLOW_COMMAND,
  IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND,
  IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND,
  IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND,
  IT_E2E_WEBVIEW_PROTOCOL_FLOW_COMMAND,
  IT_E2E_WEBVIEW_SETTINGS_FLOW_COMMAND,
  IT_E2E_WEBVIEW_UI_REQUEST,
  IT_E2E_WEBVIEW_UI_ACK,
  IT_E2E_WEBVIEW_UI_READY,
  IT_E2E_WEBVIEW_ANALYZE_REQUEST,
  IT_E2E_WEBVIEW_ANALYZE_ACK,
  IT_E2E_WEBVIEW_PROTOCOL_REQUEST,
  IT_E2E_WEBVIEW_PROTOCOL_ACK,
  IT_E2E_WEBVIEW_SETTINGS_REQUEST,
  IT_E2E_WEBVIEW_SETTINGS_ACK,
  IT_E2E_WEBVIEW_UI_TIMEOUT_MS,
  IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS,
  IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS,
  IT_E2E_WEBVIEW_SETTINGS_TIMEOUT_MS,
  it_applyE2ETestConfigBundle,
  it_buildFixtureAnalyzeRequest,
  it_buildFixtureWebviewAnalyzePayload,
  it_resolveE2EWorkspaceRoot,
  it_toE2EErrorPayload,
  type ItE2EAnalyzeFlowCommandOptions,
  type ItE2EAnalyzeScenario,
  type ItE2EProtocolFlowCommandOptions,
  type ItE2ESettingsFlowCommandOptions,
  type ItE2EUiAutomationResult,
  type ItE2EUiFlowCommandOptions,
  type ItE2EUiPending,
} from "./it_e2eShared";

type ItBridgeLogLevel = "debug" | "info" | "warn" | "error";

type ItRegisterE2ECommandsInput = {
  context: vscode.ExtensionContext;
  trainer: InterviewTrainerExtension;
  viewProvider: InterviewTrainerWebviewViewProvider;
  sendToWebview: (messageType: string, data?: any) => Promise<boolean>;
  logWebviewBridge: (
    action: string,
    status: string,
    detail?: Record<string, unknown>,
    level?: ItBridgeLogLevel,
  ) => void;
};

export function it_registerE2ETestCommands({
  context,
  trainer,
  viewProvider,
  sendToWebview,
  logWebviewBridge,
}: ItRegisterE2ECommandsInput): void {
  if (process.env.IT_E2E_ENABLE_TEST_COMMANDS !== "1") {
    return;
  }

  const pendingUiRuns = new Map<string, ItE2EUiPending>();
  const pendingAnalyzeRuns = new Map<string, ItE2EUiPending>();
  const pendingProtocolRuns = new Map<string, ItE2EUiPending>();
  const pendingSettingsRuns = new Map<string, ItE2EUiPending>();
  let webviewUiBridgeReady = false;

  const ensureWebviewUiBridgeReady = async (): Promise<{ ready: boolean; reason?: string }> => {
    const timeoutMs = 15_000;
    const startedAt = Date.now();
    const readyDeadline = startedAt + timeoutMs;
    let focusAttempts = 0;
    logWebviewBridge(
      "automation_ready",
      "start",
      { timeoutMs },
      "debug",
    );
    while (!webviewUiBridgeReady && Date.now() < readyDeadline) {
      focusAttempts += 1;
      await vscode.commands.executeCommand("itInterviewTrainer.mainView.focus");
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    const waitMs = Date.now() - startedAt;
    if (!webviewUiBridgeReady) {
      logWebviewBridge(
        "automation_ready",
        "timeout",
        {
          timeoutMs,
          waitMs,
          focusAttempts,
          reason: "bridge_ready_not_received",
        },
        "warn",
      );
      return {
        ready: false,
        reason: "Webview UI automation bridge is not ready",
      };
    }
    logWebviewBridge(
      "automation_ready",
      "success",
      {
        waitMs,
        focusAttempts,
      },
      "debug",
    );
    return { ready: true };
  };

  viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_READY, () => {
    webviewUiBridgeReady = true;
    logWebviewBridge(
      "ready_signal",
      "success",
      { messageType: IT_E2E_WEBVIEW_UI_READY },
      "debug",
    );
    return { received: true };
  });

  viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_UI_ACK, (message) => {
    webviewUiBridgeReady = true;
    const runId = String(message.data?.runId || "");
    if (!runId) {
      logWebviewBridge(
        "ui_ack",
        "invalid",
        {
          reason: "missing_run_id",
          messageType: IT_E2E_WEBVIEW_UI_ACK,
        },
        "warn",
      );
      return { received: false, reason: "missing runId" };
    }
    const pending = pendingUiRuns.get(runId);
    if (!pending) {
      logWebviewBridge(
        "ui_ack",
        "invalid",
        {
          reason: "not_pending",
          messageType: IT_E2E_WEBVIEW_UI_ACK,
          runId,
          pendingCount: pendingUiRuns.size,
        },
        "warn",
      );
      return { received: false, reason: "not pending" };
    }
    clearTimeout(pending.timeout);
    pendingUiRuns.delete(runId);
    pending.resolve(message.data as ItE2EUiAutomationResult);
    logWebviewBridge(
      "ui_ack",
      "success",
      {
        messageType: IT_E2E_WEBVIEW_UI_ACK,
        runId,
        pendingCount: pendingUiRuns.size,
      },
      "debug",
    );
    return { received: true };
  });

  viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_ANALYZE_ACK, (message) => {
    webviewUiBridgeReady = true;
    const runId = String(message.data?.runId || "");
    if (!runId) {
      logWebviewBridge(
        "analyze_ack",
        "invalid",
        {
          reason: "missing_run_id",
          messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
        },
        "warn",
      );
      return { received: false, reason: "missing runId" };
    }
    const pending = pendingAnalyzeRuns.get(runId);
    if (!pending) {
      logWebviewBridge(
        "analyze_ack",
        "invalid",
        {
          reason: "not_pending",
          messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
          runId,
          pendingCount: pendingAnalyzeRuns.size,
        },
        "warn",
      );
      return { received: false, reason: "not pending" };
    }
    clearTimeout(pending.timeout);
    pendingAnalyzeRuns.delete(runId);
    pending.resolve(message.data as ItE2EUiAutomationResult);
    logWebviewBridge(
      "analyze_ack",
      "success",
      {
        messageType: IT_E2E_WEBVIEW_ANALYZE_ACK,
        runId,
        pendingCount: pendingAnalyzeRuns.size,
      },
      "debug",
    );
    return { received: true };
  });

  viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_PROTOCOL_ACK, (message) => {
    webviewUiBridgeReady = true;
    const runId = String(message.data?.runId || "");
    if (!runId) {
      logWebviewBridge(
        "protocol_ack",
        "invalid",
        {
          reason: "missing_run_id",
          messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
        },
        "warn",
      );
      return { received: false, reason: "missing runId" };
    }
    const pending = pendingProtocolRuns.get(runId);
    if (!pending) {
      logWebviewBridge(
        "protocol_ack",
        "invalid",
        {
          reason: "not_pending",
          messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
          runId,
          pendingCount: pendingProtocolRuns.size,
        },
        "warn",
      );
      return { received: false, reason: "not pending" };
    }
    clearTimeout(pending.timeout);
    pendingProtocolRuns.delete(runId);
    pending.resolve(message.data as ItE2EUiAutomationResult);
    logWebviewBridge(
      "protocol_ack",
      "success",
      {
        messageType: IT_E2E_WEBVIEW_PROTOCOL_ACK,
        runId,
        pendingCount: pendingProtocolRuns.size,
      },
      "debug",
    );
    return { received: true };
  });

  viewProvider.webviewProtocol.on(IT_E2E_WEBVIEW_SETTINGS_ACK, (message) => {
    webviewUiBridgeReady = true;
    const runId = String(message.data?.runId || "");
    if (!runId) {
      logWebviewBridge(
        "settings_ack",
        "invalid",
        {
          reason: "missing_run_id",
          messageType: IT_E2E_WEBVIEW_SETTINGS_ACK,
        },
        "warn",
      );
      return { received: false, reason: "missing runId" };
    }
    const pending = pendingSettingsRuns.get(runId);
    if (!pending) {
      logWebviewBridge(
        "settings_ack",
        "invalid",
        {
          reason: "not_pending",
          messageType: IT_E2E_WEBVIEW_SETTINGS_ACK,
          runId,
          pendingCount: pendingSettingsRuns.size,
        },
        "warn",
      );
      return { received: false, reason: "not pending" };
    }
    clearTimeout(pending.timeout);
    pendingSettingsRuns.delete(runId);
    pending.resolve(message.data as ItE2EUiAutomationResult);
    logWebviewBridge(
      "settings_ack",
      "success",
      {
        messageType: IT_E2E_WEBVIEW_SETTINGS_ACK,
        runId,
        pendingCount: pendingSettingsRuns.size,
      },
      "debug",
    );
    return { received: true };
  });

  context.subscriptions.push(
    vscode.commands.registerCommand(IT_E2E_WEBVIEW_UI_FLOW_COMMAND, async (rawOptions?: unknown) => {
      const runId = `e2e-ui-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const options = ((): ItE2EUiFlowCommandOptions | undefined => {
        if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
          return undefined;
        }
        const record = rawOptions as Record<string, unknown>;
        const injectFailureStage = String(record.injectFailureStage || "").trim();
        if (!injectFailureStage) {
          return undefined;
        }
        return { injectFailureStage };
      })();

      const readyState = await ensureWebviewUiBridgeReady();
      if (!readyState.ready) {
        return {
          runId,
          status: "error",
          error: readyState.reason || "Webview bridge not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingUiRuns.delete(runId);
          reject(new Error(`Webview UI automation timed out after ${IT_E2E_WEBVIEW_UI_TIMEOUT_MS}ms`));
        }, IT_E2E_WEBVIEW_UI_TIMEOUT_MS);
        pendingUiRuns.set(runId, { resolve, timeout });
      });

      const sent = await sendToWebview(IT_E2E_WEBVIEW_UI_REQUEST, {
        runId,
        ...(options ? { options } : {}),
      });
      if (!sent) {
        const pending = pendingUiRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingUiRuns.delete(runId);
        }
        return {
          runId,
          status: "error",
          error: "Webview is not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      try {
        return await waitForResult;
      } catch (error) {
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          runId,
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
        } satisfies ItE2EUiAutomationResult;
      } finally {
        const pending = pendingUiRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingUiRuns.delete(runId);
        }
      }
    }),
  );

  const runWebviewAnalyzeFlowScenario = async (
    scenario: ItE2EAnalyzeScenario,
    rawOptions?: unknown,
  ): Promise<ItE2EUiAutomationResult> => {
    const runId = `e2e-webview-${scenario}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const options = ((): ItE2EAnalyzeFlowCommandOptions | undefined => {
      if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
        return undefined;
      }
      const record = rawOptions as Record<string, unknown>;
      const injectFailureStage = String(record.injectFailureStage || "").trim();
      if (!injectFailureStage) {
        return undefined;
      }
      return { injectFailureStage };
    })();

    const readyState = await ensureWebviewUiBridgeReady();
    if (!readyState.ready) {
      return {
        runId,
        status: "error",
        error: readyState.reason || "Webview bridge not ready",
      } satisfies ItE2EUiAutomationResult;
    }

    let fixtureRequest: ItAnalyzeRequest;
    let webviewPayload: ReturnType<typeof it_buildFixtureWebviewAnalyzePayload>;
    try {
      const workspaceRoot = it_resolveE2EWorkspaceRoot(context);
      fixtureRequest = it_buildFixtureAnalyzeRequest(workspaceRoot, runId);
      webviewPayload = it_buildFixtureWebviewAnalyzePayload(workspaceRoot, runId);
    } catch (error) {
      const errorPayload = it_toE2EErrorPayload(error);
      return {
        runId,
        status: "error",
        error: errorPayload.message,
        errorCode: errorPayload.errorCode,
        userMessage: errorPayload.userMessage,
      } satisfies ItE2EUiAutomationResult;
    }
    const restoreConfig = it_applyE2ETestConfigBundle(
      trainer,
      fixtureRequest.questionList?.join("\n") || fixtureRequest.questionText || "e2e transcript",
    );

    try {
      const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingAnalyzeRuns.delete(runId);
          reject(
            new Error(`Webview ${scenario} flow timed out after ${IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS}ms`),
          );
        }, IT_E2E_WEBVIEW_ANALYZE_TIMEOUT_MS);
        pendingAnalyzeRuns.set(runId, { resolve, timeout });
      });

      const sent = await sendToWebview(IT_E2E_WEBVIEW_ANALYZE_REQUEST, {
        runId,
        mode: scenario,
        questionText: webviewPayload.questionText,
        questionList: webviewPayload.questionList,
        audio: webviewPayload.audio,
        ...(options ? { options } : {}),
      });
      if (!sent) {
        const pending = pendingAnalyzeRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingAnalyzeRuns.delete(runId);
        }
        return {
          runId,
          status: "error",
          error: "Webview is not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      return await waitForResult;
    } catch (error) {
      const errorPayload = it_toE2EErrorPayload(error);
      return {
        runId,
        status: "error",
        error: errorPayload.message,
        errorCode: errorPayload.errorCode,
        userMessage: errorPayload.userMessage,
      } satisfies ItE2EUiAutomationResult;
    } finally {
      const pending = pendingAnalyzeRuns.get(runId);
      if (pending) {
        clearTimeout(pending.timeout);
        pendingAnalyzeRuns.delete(runId);
      }
      restoreConfig();
    }
  };

  context.subscriptions.push(
    vscode.commands.registerCommand(IT_E2E_WEBVIEW_ANALYZE_FLOW_COMMAND, async (rawOptions?: unknown) =>
      runWebviewAnalyzeFlowScenario("analyze", rawOptions),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(IT_E2E_WEBVIEW_CANCEL_FLOW_COMMAND, async (rawOptions?: unknown) =>
      runWebviewAnalyzeFlowScenario("cancel", rawOptions),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(IT_E2E_WEBVIEW_SAVE_FLOW_COMMAND, async (rawOptions?: unknown) =>
      runWebviewAnalyzeFlowScenario("save", rawOptions),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      IT_E2E_WEBVIEW_PROTOCOL_FLOW_COMMAND,
      async (rawOptions?: unknown) => {
      const runId = `e2e-webview-protocol-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const options = ((): ItE2EProtocolFlowCommandOptions | undefined => {
        if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
          return undefined;
        }
        const record = rawOptions as Record<string, unknown>;
        const injectFailureStage = String(record.injectFailureStage || "").trim();
        if (!injectFailureStage) {
          return undefined;
        }
        return { injectFailureStage };
      })();

      const readyState = await ensureWebviewUiBridgeReady();
      if (!readyState.ready) {
        return {
          runId,
          status: "error",
          error: readyState.reason || "Webview bridge not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingProtocolRuns.delete(runId);
          reject(
            new Error(
              `Webview protocol guard flow timed out after ${IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS}ms`,
            ),
          );
        }, IT_E2E_WEBVIEW_PROTOCOL_TIMEOUT_MS);
        pendingProtocolRuns.set(runId, { resolve, timeout });
      });

      const sent = await sendToWebview(IT_E2E_WEBVIEW_PROTOCOL_REQUEST, {
        runId,
        ...(options ? { options } : {}),
      });
      if (!sent) {
        const pending = pendingProtocolRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingProtocolRuns.delete(runId);
        }
        return {
          runId,
          status: "error",
          error: "Webview is not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      try {
        return await waitForResult;
      } catch (error) {
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          runId,
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
        } satisfies ItE2EUiAutomationResult;
      } finally {
        const pending = pendingProtocolRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingProtocolRuns.delete(runId);
        }
      }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      IT_E2E_WEBVIEW_SETTINGS_FLOW_COMMAND,
      async (rawOptions?: unknown) => {
      const runId = `e2e-webview-settings-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const options = ((): ItE2ESettingsFlowCommandOptions | undefined => {
        if (!rawOptions || typeof rawOptions !== "object" || Array.isArray(rawOptions)) {
          return undefined;
        }
        const record = rawOptions as Record<string, unknown>;
        const injectFailureStage = String(record.injectFailureStage || "").trim();
        const targetEnvName = String(record.targetEnvName || "").trim();
        if (!injectFailureStage && !targetEnvName) {
          return undefined;
        }
        return {
          ...(injectFailureStage ? { injectFailureStage } : {}),
          ...(targetEnvName ? { targetEnvName } : {}),
        };
      })();

      const readyState = await ensureWebviewUiBridgeReady();
      if (!readyState.ready) {
        return {
          runId,
          status: "error",
          error: readyState.reason || "Webview bridge not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      const waitForResult = new Promise<ItE2EUiAutomationResult>((resolve, reject) => {
        const timeout = setTimeout(() => {
          pendingSettingsRuns.delete(runId);
          reject(
            new Error(
              `Webview settings flow timed out after ${IT_E2E_WEBVIEW_SETTINGS_TIMEOUT_MS}ms`,
            ),
          );
        }, IT_E2E_WEBVIEW_SETTINGS_TIMEOUT_MS);
        pendingSettingsRuns.set(runId, { resolve, timeout });
      });

      const sent = await sendToWebview(IT_E2E_WEBVIEW_SETTINGS_REQUEST, {
        runId,
        ...(options ? { options } : {}),
      });
      if (!sent) {
        const pending = pendingSettingsRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingSettingsRuns.delete(runId);
        }
        return {
          runId,
          status: "error",
          error: "Webview is not ready",
        } satisfies ItE2EUiAutomationResult;
      }

      try {
        return await waitForResult;
      } catch (error) {
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          runId,
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
        } satisfies ItE2EUiAutomationResult;
      } finally {
        const pending = pendingSettingsRuns.get(runId);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingSettingsRuns.delete(runId);
        }
      }
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(IT_E2E_FIXTURE_ANALYZE_COMMAND, async () => {
      const runId = `e2e-fixture-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let request: ItAnalyzeRequest;
      try {
        const workspaceRoot = it_resolveE2EWorkspaceRoot(context);
        request = it_buildFixtureAnalyzeRequest(workspaceRoot, runId);
      } catch (error) {
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
          stateError: trainer.state.lastError?.reason || "",
        };
      }

      const restoreConfig = it_applyE2ETestConfigBundle(
        trainer,
        request.questionList?.join("\n") || request.questionText || "e2e transcript",
      );

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
        const errorPayload = it_toE2EErrorPayload(error);
        return {
          status: "error",
          error: errorPayload.message,
          errorCode: errorPayload.errorCode,
          userMessage: errorPayload.userMessage,
          stateError: trainer.state.lastError?.reason || "",
        };
      } finally {
        restoreConfig();
      }
    }),
  );
}
