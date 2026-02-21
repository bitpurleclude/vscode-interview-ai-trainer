import type { ChangeEvent } from "react";
import { on, request } from "../../messenger";
import {
  IT_E2E_WEBVIEW_ANALYZE_REQUEST,
  IT_E2E_WEBVIEW_ANALYZE_ACK,
  IT_E2E_UI_ANALYZE_TIMEOUT_MS,
  IT_E2E_UI_CLICK_DELAY_MS,
  ItE2EAnalyzeAudioPayload,
  ItE2EAnalyzeMode,
  ItE2EUiStep,
  UseE2ETestBridgeOptions,
  it_base64ToBytes,
  it_clickUiElement,
  it_delay,
  it_detectPageFromDom,
  it_waitForUiCondition,
} from "./it_e2eShared";

export function it_registerAnalyzeFlowHandler({
  setQuestionText,
  setQuestionList,
  handleImportAudio,
  setAudioPayloadForTest,
}: UseE2ETestBridgeOptions): () => void {
const disposeAnalyzeFlow = on(IT_E2E_WEBVIEW_ANALYZE_REQUEST, (payload) => {
  const runId = String(payload?.runId || "");
  const injectFailureStage = String(payload?.options?.injectFailureStage || "").trim();
  const steps: ItE2EUiStep[] = [];

  const sendAck = async (
    status: "success" | "error",
    error?: string,
    extra?: Record<string, unknown>,
  ) => {
    await request(
      IT_E2E_WEBVIEW_ANALYZE_ACK,
      {
        runId,
        status,
        error,
        activePage: it_detectPageFromDom(),
        steps,
        ...(extra || {}),
      },
      { timeoutMs: 10_000 },
    );
  };

  void (async () => {
    if (!runId) {
      await sendAck("error", "Missing runId in analyze flow request");
      return;
    }

    try {
      const injectFailure = (stage: string) => {
        if (!injectFailureStage || injectFailureStage !== stage) {
          return;
        }
        steps.push({
          action: `inject-failure-${stage}`,
          ok: true,
          detail: `stage=${stage}`,
        });
        throw new Error(`Injected analyze failure at ${stage}`);
      };

      const modeRaw = String(payload?.mode || "analyze").toLowerCase();
      const mode: ItE2EAnalyzeMode =
        modeRaw === "cancel" || modeRaw === "save" ? modeRaw : "analyze";
      steps.push({ action: "set-flow-mode", ok: true, detail: mode });

      const questionText = String(payload?.questionText || "").trim();
      const questionList = Array.isArray(payload?.questionList)
        ? payload.questionList
            .map((item: unknown) => String(item || "").trim())
            .filter(Boolean)
        : [];
      const audio = (payload?.audio || {}) as ItE2EAnalyzeAudioPayload;
      const audioBytes = it_base64ToBytes(String(audio.base64 || ""));

      if (!audioBytes.length) {
        throw new Error("Analyze flow payload missing audio bytes");
      }

      const finalQuestionText = questionText || questionList[0] || "fixture question";
      const finalQuestionList = questionList.join("\n");
      setQuestionText(finalQuestionText);
      setQuestionList(finalQuestionList);
      await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
      steps.push({
        action: "fill-question-state",
        ok: true,
        detail: `chars=${finalQuestionText.length}, count=${questionList.length}`,
      });
      injectFailure("fill-question-state");

      const filename = String(audio.filename || "fixture.m4a");
      const mimeType = String(audio.mimeType || "audio/mp4");
      const audioFile = new File([audioBytes], filename, { type: mimeType });
      const syntheticTarget = {
        files: [audioFile],
        value: filename,
      } as unknown as HTMLInputElement;
      await handleImportAudio({
        target: syntheticTarget,
      } as ChangeEvent<HTMLInputElement>);
      steps.push({
        action: "import-audio-file",
        ok: true,
        detail: `bytes=${audioBytes.byteLength}, name=${filename}`,
      });
      injectFailure("import-audio-file");

      await it_waitForUiCondition(
        () => Boolean(document.querySelector(".it-audio-summary")),
        8_000,
        "audio summary after import",
      );
      steps.push({ action: "wait-audio-summary", ok: true });

      await it_waitForUiCondition(() => {
        const analyzeButton = document.querySelector<HTMLButtonElement>(
          "[data-testid='it-action-analyze']",
        );
        return (
          Boolean(analyzeButton) &&
          !Boolean(analyzeButton?.disabled) &&
          !analyzeButton?.classList.contains("it-button--danger")
        );
      }, 45_000, "analyze button enabled");
      steps.push({ action: "wait-analyze-enabled", ok: true });
      injectFailure("wait-analyze-enabled");

      if (mode === "cancel") {
        setAudioPayloadForTest({
          format: "wav",
          sampleRate: 16_000,
          byteLength: audioBytes.byteLength,
          durationSec: 4,
          base64: String(audio.base64 || ""),
        });
        await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
        steps.push({
          action: "set-cancel-audio-payload",
          ok: true,
          detail: `bytes=${audioBytes.byteLength}`,
        });
      }

      injectFailure("click-analyze-button");
      it_clickUiElement("[data-testid='it-action-analyze']");
      steps.push({ action: "click-analyze-button", ok: true });

      if (mode === "cancel") {
        try {
          await it_waitForUiCondition(() => {
            const analyzeButton = document.querySelector<HTMLButtonElement>(
              "[data-testid='it-action-analyze']",
            );
            const hasDangerButton = Boolean(analyzeButton?.classList.contains("it-button--danger"));
            const hasRunningStep = Boolean(document.querySelector(".it-step--running"));
            return hasDangerButton || hasRunningStep;
          }, 10_000, "analyze running state");
        } catch (error) {
          const statusText = (
            document.querySelector(".it-status")?.textContent || ""
          ).trim();
          const errorText = (
            document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent || ""
          ).trim();
          const runningStepCount = document.querySelectorAll(".it-step--running").length;
          const detailText = [
            error instanceof Error ? error.message : String(error),
            `status=${statusText || "(empty)"}`,
            `error=${errorText || "(empty)"}`,
            `runningSteps=${runningStepCount}`,
          ].join(" | ");
          throw new Error(detailText);
        }
        steps.push({ action: "wait-analyze-running", ok: true });

        const cancelResp = await request("it/cancelAnalyze", undefined, {
          timeoutMs: 10_000,
        });
        const cancelStatus = String(cancelResp?.status || "");
        steps.push({
          action: "send-cancel-request",
          ok: cancelStatus === "success",
          detail: `status=${cancelStatus || "(empty)"}`,
        });
        if (cancelStatus !== "success") {
          throw new Error(
            `Cancel request failed: ${String(cancelResp?.error || "unknown_error")}`,
          );
        }
        injectFailure("send-cancel-request");
        const cancelPayload =
          cancelResp && typeof cancelResp === "object" && cancelResp.content
            ? cancelResp.content
            : cancelResp;
        const canceled = Boolean((cancelPayload as { cancelled?: unknown })?.cancelled);
        const runningStepCount = Number(
          (cancelPayload as { runningStepCount?: unknown })?.runningStepCount || 0,
        );
        const cancelAccepted = canceled && runningStepCount > 0;
        steps.push({
          action: "assert-cancel-running-steps",
          ok: cancelAccepted,
          detail: `cancelled=${canceled}, runningSteps=${runningStepCount}`,
        });
        if (!cancelAccepted) {
          throw new Error(
            `Cancel request did not observe running analysis: cancelled=${canceled}, runningSteps=${runningStepCount}`,
          );
        }

        await it_waitForUiCondition(() => {
          const analyzeButton = document.querySelector<HTMLButtonElement>(
            "[data-testid='it-action-analyze']",
          );
          return Boolean(analyzeButton) && !analyzeButton.classList.contains("it-button--danger");
        }, 30_000, "cancel completion");
        steps.push({ action: "wait-cancel-complete", ok: true });

        await sendAck("success", undefined, { mode, canceled: true, runningStepCount });
        return;
      }

      if (mode === "save") {
        await it_waitForUiCondition(() => {
          const analyzeButton = document.querySelector<HTMLButtonElement>(
            "[data-testid='it-action-analyze']",
          );
          return Boolean(analyzeButton) && !analyzeButton.classList.contains("it-button--danger");
        }, IT_E2E_UI_ANALYZE_TIMEOUT_MS, "analyze completion before save");
        steps.push({ action: "wait-analyze-finished", ok: true });

        const beforeSaveMessage = (
          document.querySelector<HTMLElement>("[data-testid='it-save-result-message']")
            ?.textContent || ""
        ).trim();
        const beforeStatusError = (
          document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent || ""
        ).trim();

        it_clickUiElement("[data-testid='it-action-save-result']");
        steps.push({ action: "click-save-result-button", ok: true });
        injectFailure("click-save-result-button");

        await it_waitForUiCondition(() => {
          const saveMessage = (
            document.querySelector<HTMLElement>("[data-testid='it-save-result-message']")
              ?.textContent || ""
          ).trim();
          const statusError = (
            document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent || ""
          ).trim();
          const saveMessageChanged = Boolean(saveMessage) && saveMessage !== beforeSaveMessage;
          const statusErrorChanged = Boolean(statusError) && statusError !== beforeStatusError;
          return saveMessageChanged || statusErrorChanged;
        }, 10_000, "save result feedback");
        const saveMessage = (
          document.querySelector<HTMLElement>("[data-testid='it-save-result-message']")
            ?.textContent || ""
        ).trim();
        const statusError = (
          document.querySelector<HTMLElement>("[data-testid='it-status-error']")?.textContent || ""
        ).trim();
        const saveMessageChanged = Boolean(saveMessage) && saveMessage !== beforeSaveMessage;
        const statusErrorChanged = Boolean(statusError) && statusError !== beforeStatusError;
        const saveSucceeded = saveMessageChanged && !statusErrorChanged;
        steps.push({
          action: "assert-save-feedback",
          ok: saveSucceeded,
          detail: saveSucceeded
            ? `save=${saveMessage}`
            : `save=${saveMessage || "(empty)"}, error=${statusError || "(empty)"}`,
        });
        if (!saveSucceeded) {
          await sendAck("error", statusError || "save result did not report success", {
            mode,
            saveSucceeded,
            saveMessage,
            statusError,
          });
          return;
        }
        await sendAck("success", undefined, {
          mode,
          saveSucceeded,
          saveMessage,
          statusError,
        });
        return;
      }

      await it_delay(IT_E2E_UI_CLICK_DELAY_MS);

      it_clickUiElement("[data-testid='it-result-tab-evaluation']");
      await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
      steps.push({ action: "open-evaluation-tab", ok: true });
      injectFailure("open-evaluation-tab");

      await it_waitForUiCondition(
        () => {
          const valueNode = document.querySelector("[data-testid='it-evaluation-overall-value']");
          return Boolean(valueNode);
        },
        IT_E2E_UI_ANALYZE_TIMEOUT_MS,
        "evaluation panel",
      );
      steps.push({ action: "wait-evaluation-panel", ok: true });
      const overallScoreText = (
        document.querySelector<HTMLElement>("[data-testid='it-evaluation-overall-value']")
          ?.textContent || ""
      ).trim();
      steps.push({
        action: "assert-evaluation-overall",
        ok: Boolean(overallScoreText),
        detail: overallScoreText || "(empty)",
      });

      await sendAck("success", undefined, { overallScoreText, mode });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ action: "analyze-flow", ok: false, detail: message });
      await sendAck("error", message);
    }
  })();
});
  return disposeAnalyzeFlow;
}
