import { on, request } from "../../messenger";
import {
  IT_E2E_WEBVIEW_SETTINGS_REQUEST,
  IT_E2E_WEBVIEW_SETTINGS_ACK,
  IT_E2E_UI_CLICK_DELAY_MS,
  ItE2EUiStep,
  it_clickUiElement,
  it_delay,
  it_detectPageFromDom,
  it_fillInputValue,
  it_selectValue,
  it_setCheckboxValue,
  it_waitForUiCondition,
} from "./it_e2eShared";

export function it_registerSettingsFlowHandler(): () => void {
const disposeSettingsFlow = on(IT_E2E_WEBVIEW_SETTINGS_REQUEST, (payload) => {
  const runId = String(payload?.runId || "");
  const injectFailureStage = String(payload?.options?.injectFailureStage || "").trim();
  const targetEnvName = String(payload?.options?.targetEnvName || "").trim();
  const steps: ItE2EUiStep[] = [];

  const sendAck = async (
    status: "success" | "error",
    error?: string,
    extra?: Record<string, unknown>,
  ) => {
    await request(
      IT_E2E_WEBVIEW_SETTINGS_ACK,
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
      await sendAck("error", "Missing runId in settings flow request");
      return;
    }

    try {
      it_clickUiElement("[data-testid='it-tab-settings']");
      await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
      const settingsPage = it_detectPageFromDom();
      steps.push({
        action: "open-settings-tab",
        ok: settingsPage === "settings",
        detail: `page=${settingsPage}`,
      });
      if (settingsPage !== "settings") {
        throw new Error(`Expected settings page, got ${settingsPage}`);
      }

      const topicModeSelector = "[data-testid='it-settings-topic-mode-select']";
      const topicLenSelector = "[data-testid='it-settings-topic-len-input']";
      const topicSaveButtonSelector = "[data-testid='it-settings-topic-save-button']";
      const topicSaveMessageSelector = "[data-testid='it-settings-topic-save-message']";
      const envSelectSelector = "[data-testid='it-settings-env-select']";
      const envNameInputSelector = "[data-testid='it-settings-env-name-input']";
      const envCreateButtonSelector = "[data-testid='it-settings-env-create-button']";
      const streamEnabledSelector = "[data-testid='it-settings-stream-enabled-checkbox']";
      const streamAutoCollapseSelector =
        "[data-testid='it-settings-stream-autocollapse-checkbox']";
      const streamPreviewSelector = "[data-testid='it-settings-stream-preview-input']";
      const streamSaveButtonSelector = "[data-testid='it-settings-stream-save-button']";
      const streamSaveMessageSelector = "[data-testid='it-settings-stream-save-message']";

      const fetchConfigSnapshot = async () => {
        const resp = await request("it/getConfig", undefined, { timeoutMs: 8_000 });
        const status = String(resp?.status || "");
        if (status !== "success" || !resp?.content) {
          throw new Error(
            `it/getConfig failed: status=${status || "(empty)"}, error=${String(resp?.error || "(none)")}`,
          );
        }
        return resp.content;
      };

      const waitTopicPersisted = async (
        expectedMode: "llm" | "simple",
        expectedLen: number,
        label: string,
      ) => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          try {
            const cfg = await fetchConfigSnapshot();
            const mode = String(cfg?.topics?.titleMode || "llm");
            const len = Number(cfg?.topics?.maxTitleLen ?? 18);
            if (mode === expectedMode && Number.isFinite(len) && Math.trunc(len) === expectedLen) {
              return cfg;
            }
          } catch {
            // ignore transient config fetch failure during polling
          }
          await it_delay(150);
        }
        throw new Error(
          `Timed out waiting for ${label}: mode=${expectedMode}, len=${expectedLen}`,
        );
      };

      const normalizeStreamingPreview = (value: unknown) => {
        const previewRaw = Number(value);
        return Number.isFinite(previewRaw) ? Math.max(50, Math.trunc(previewRaw)) : 200;
      };

      const normalizeStreamingEnabled = (value: unknown) => value !== false;
      const normalizeStreamingAutoCollapse = (value: unknown) => value !== false;

      const waitStreamingPersisted = async (
        expectedStreaming: {
          enabled: boolean;
          autoCollapse: boolean;
          previewChars: number;
        },
        label: string,
      ) => {
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          try {
            const cfg = await fetchConfigSnapshot();
            const observedStreaming = {
              enabled: normalizeStreamingEnabled(cfg?.streaming?.enabled),
              autoCollapse: normalizeStreamingAutoCollapse(cfg?.streaming?.autoCollapse),
              previewChars: normalizeStreamingPreview(cfg?.streaming?.previewChars ?? 200),
            };
            if (
              observedStreaming.enabled === expectedStreaming.enabled &&
              observedStreaming.autoCollapse === expectedStreaming.autoCollapse &&
              observedStreaming.previewChars === expectedStreaming.previewChars
            ) {
              return cfg;
            }
          } catch {
            // ignore transient config fetch failure during polling
          }
          await it_delay(150);
        }
        throw new Error(
          `Timed out waiting for ${label}: enabled=${expectedStreaming.enabled}, autoCollapse=${expectedStreaming.autoCollapse}, previewChars=${expectedStreaming.previewChars}`,
        );
      };

      const waitEnvironmentActive = async (
        expectedEnv: string,
        label: string,
      ) => {
        const deadline = Date.now() + 20_000;
        while (Date.now() < deadline) {
          try {
            const cfg = await fetchConfigSnapshot();
            const activeEnv = String(cfg?.activeEnvironment || "prod");
            const envList = Array.isArray(cfg?.envList)
              ? cfg.envList.map((item: unknown) => String(item || "")).filter(Boolean)
              : [];
            if (activeEnv === expectedEnv && envList.includes(expectedEnv)) {
              return cfg;
            }
          } catch {
            // ignore transient config fetch failure during polling
          }
          await it_delay(150);
        }
        throw new Error(`Timed out waiting for ${label}: activeEnvironment=${expectedEnv}`);
      };

      await it_waitForUiCondition(() => {
        const modeSelect = document.querySelector<HTMLSelectElement>(topicModeSelector);
        const lenInput = document.querySelector<HTMLInputElement>(topicLenSelector);
        const saveButton = document.querySelector<HTMLButtonElement>(topicSaveButtonSelector);
        const envSelect = document.querySelector<HTMLSelectElement>(envSelectSelector);
        const envNameInput = document.querySelector<HTMLInputElement>(envNameInputSelector);
        const envCreateButton = document.querySelector<HTMLButtonElement>(envCreateButtonSelector);
        const streamEnabledCheckbox =
          document.querySelector<HTMLInputElement>(streamEnabledSelector);
        const streamAutoCollapseCheckbox =
          document.querySelector<HTMLInputElement>(streamAutoCollapseSelector);
        const streamPreviewInput =
          document.querySelector<HTMLInputElement>(streamPreviewSelector);
        const streamSaveButton =
          document.querySelector<HTMLButtonElement>(streamSaveButtonSelector);
        return (
          Boolean(modeSelect) &&
          !Boolean(modeSelect?.disabled) &&
          Boolean(lenInput) &&
          !Boolean(lenInput?.disabled) &&
          Boolean(saveButton) &&
          !Boolean(saveButton?.disabled) &&
          Boolean(envSelect) &&
          !Boolean(envSelect?.disabled) &&
          Boolean(envNameInput) &&
          !Boolean(envNameInput?.disabled) &&
          Boolean(envCreateButton) &&
          !Boolean(envCreateButton?.disabled) &&
          Boolean(streamEnabledCheckbox) &&
          !Boolean(streamEnabledCheckbox?.disabled) &&
          Boolean(streamAutoCollapseCheckbox) &&
          !Boolean(streamAutoCollapseCheckbox?.disabled) &&
          Boolean(streamPreviewInput) &&
          !Boolean(streamPreviewInput?.disabled) &&
          Boolean(streamSaveButton) &&
          !Boolean(streamSaveButton?.disabled)
        );
      }, 15_000, "topic settings controls");
      steps.push({ action: "wait-settings-controls", ok: true });

      const beforeConfig = await fetchConfigSnapshot();
      const envBefore = String(beforeConfig?.activeEnvironment || "prod").trim() || "prod";
      const envListBefore = Array.isArray(beforeConfig?.envList)
        ? beforeConfig.envList.map((item: unknown) => String(item || "")).filter(Boolean)
        : [];
      const targetEnv =
        targetEnvName || (envBefore === "it_e2e_env" ? "it_e2e_env_alt" : "it_e2e_env");
      const targetEnvExists = envListBefore.includes(targetEnv);

      if (targetEnvExists) {
        it_selectValue(envSelectSelector, targetEnv);
        steps.push({
          action: "switch-target-environment",
          ok: true,
          detail: `target=${targetEnv}`,
        });
        if (injectFailureStage && injectFailureStage === "switch-target-environment") {
          steps.push({
            action: "inject-failure-switch-target-environment",
            ok: true,
            detail: "stage=switch-target-environment",
          });
          throw new Error("Injected settings failure at switch-target-environment");
        }
      } else {
        it_fillInputValue(envNameInputSelector, targetEnv);
        await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
        const draftValue = String(
          document.querySelector<HTMLInputElement>(envNameInputSelector)?.value || "",
        ).trim();
        steps.push({
          action: "set-target-environment-draft",
          ok: draftValue === targetEnv,
          detail: `draft=${draftValue || "(empty)"}`,
        });
        if (draftValue !== targetEnv) {
          throw new Error(`Failed to set target environment draft: ${targetEnv}`);
        }
        if (injectFailureStage && injectFailureStage === "set-target-environment-draft") {
          steps.push({
            action: "inject-failure-set-target-environment-draft",
            ok: true,
            detail: "stage=set-target-environment-draft",
          });
          throw new Error("Injected settings failure at set-target-environment-draft");
        }
        it_clickUiElement(envCreateButtonSelector);
        steps.push({
          action: "create-target-environment",
          ok: true,
          detail: `target=${targetEnv}`,
        });
        if (injectFailureStage && injectFailureStage === "create-target-environment") {
          steps.push({
            action: "inject-failure-create-target-environment",
            ok: true,
            detail: "stage=create-target-environment",
          });
          throw new Error("Injected settings failure at create-target-environment");
        }
      }

      const targetEnvConfig = await waitEnvironmentActive(targetEnv, "target environment active");
      steps.push({
        action: "assert-target-environment-active",
        ok: true,
        detail: `activeEnvironment=${String(targetEnvConfig?.activeEnvironment || "(empty)")}`,
      });
      if (injectFailureStage && injectFailureStage === "assert-target-environment-active") {
        steps.push({
          action: "inject-failure-assert-target-environment-active",
          ok: true,
          detail: "stage=assert-target-environment-active",
        });
        throw new Error("Injected settings failure at assert-target-environment-active");
      }

      if (envBefore !== targetEnv) {
        it_selectValue(envSelectSelector, envBefore);
        steps.push({
          action: "restore-active-environment",
          ok: true,
          detail: `restore=${envBefore}`,
        });
        if (injectFailureStage && injectFailureStage === "restore-active-environment") {
          steps.push({
            action: "inject-failure-restore-active-environment",
            ok: true,
            detail: "stage=restore-active-environment",
          });
          throw new Error("Injected settings failure at restore-active-environment");
        }
      }
      const restoredEnvConfig = await waitEnvironmentActive(
        envBefore,
        "restore environment active",
      );
      steps.push({
        action: "assert-active-environment-restored",
        ok: true,
        detail: `activeEnvironment=${String(restoredEnvConfig?.activeEnvironment || "(empty)")}`,
      });
      if (injectFailureStage && injectFailureStage === "assert-active-environment-restored") {
        steps.push({
          action: "inject-failure-assert-active-environment-restored",
          ok: true,
          detail: "stage=assert-active-environment-restored",
        });
        throw new Error("Injected settings failure at assert-active-environment-restored");
      }

      const beforeModeRaw = String(beforeConfig?.topics?.titleMode || "llm");
      const beforeMode: "llm" | "simple" = beforeModeRaw === "simple" ? "simple" : "llm";
      const beforeLenRaw = Number(beforeConfig?.topics?.maxTitleLen ?? 18);
      const beforeLen = Number.isFinite(beforeLenRaw)
        ? Math.max(4, Math.min(18, Math.trunc(beforeLenRaw)))
        : 18;
      const updatedMode: "llm" | "simple" = beforeMode === "llm" ? "simple" : "llm";
      const updatedLen = beforeLen >= 18 ? 17 : beforeLen + 1;
      const beforeStreamingEnabled = normalizeStreamingEnabled(
        beforeConfig?.streaming?.enabled,
      );
      const beforeStreamingAutoCollapse = normalizeStreamingAutoCollapse(
        beforeConfig?.streaming?.autoCollapse,
      );
      const beforeStreamingPreview = normalizeStreamingPreview(
        beforeConfig?.streaming?.previewChars ?? 200,
      );
      const updatedStreamingEnabled = !beforeStreamingEnabled;
      const updatedStreamingAutoCollapse = !beforeStreamingAutoCollapse;
      const updatedStreamingPreview =
        beforeStreamingPreview >= 500 ? beforeStreamingPreview - 50 : beforeStreamingPreview + 50;

      const persistTopicSettings = async (
        mode: "llm" | "simple",
        len: number,
        stepPrefix: "update-topic-settings" | "restore-topic-settings",
      ) => {
        await it_waitForUiCondition(() => {
          const saveButton = document.querySelector<HTMLButtonElement>(topicSaveButtonSelector);
          return Boolean(saveButton) && !Boolean(saveButton?.disabled);
        }, 10_000, `${stepPrefix} save button enabled`);

        it_selectValue(topicModeSelector, mode);
        it_fillInputValue(topicLenSelector, String(len));
        await it_delay(IT_E2E_UI_CLICK_DELAY_MS);

        const selectedMode = String(
          document.querySelector<HTMLSelectElement>(topicModeSelector)?.value || "",
        );
        const selectedLen = Number(
          document.querySelector<HTMLInputElement>(topicLenSelector)?.value || 0,
        );
        const inputOk = selectedMode === mode && selectedLen === len;
        steps.push({
          action: `${stepPrefix}-set-inputs`,
          ok: inputOk,
          detail: `mode=${selectedMode || "(empty)"}, len=${selectedLen}`,
        });
        if (!inputOk) {
          throw new Error(
            `Failed to set topic settings inputs: mode=${selectedMode}, len=${selectedLen}`,
          );
        }

        if (injectFailureStage && injectFailureStage === stepPrefix) {
          steps.push({
            action: `inject-failure-${stepPrefix}`,
            ok: true,
            detail: `stage=${stepPrefix}`,
          });
          throw new Error(`Injected settings failure at ${stepPrefix}`);
        }

        const beforeMessage = (
          document.querySelector<HTMLElement>(topicSaveMessageSelector)?.textContent || ""
        ).trim();
        it_clickUiElement(topicSaveButtonSelector);
        steps.push({ action: `${stepPrefix}-click-save`, ok: true });

        await it_waitForUiCondition(() => {
          const saveMessage = (
            document.querySelector<HTMLElement>(topicSaveMessageSelector)?.textContent || ""
          ).trim();
          return Boolean(saveMessage) || Boolean(beforeMessage);
        }, 10_000, `${stepPrefix} save feedback`);
        const saveMessage = (
          document.querySelector<HTMLElement>(topicSaveMessageSelector)?.textContent || ""
        ).trim();
        steps.push({
          action: `${stepPrefix}-assert-message`,
          ok: Boolean(saveMessage) || Boolean(beforeMessage),
          detail: saveMessage || beforeMessage || "(empty)",
        });

        const persistedConfig = await waitTopicPersisted(mode, len, stepPrefix);
        const observedModeRaw = String(persistedConfig?.topics?.titleMode || "llm");
        const observedMode: "llm" | "simple" =
          observedModeRaw === "simple" ? "simple" : "llm";
        const observedLenRaw = Number(persistedConfig?.topics?.maxTitleLen ?? 18);
        const observedLen = Number.isFinite(observedLenRaw)
          ? Math.max(4, Math.min(18, Math.trunc(observedLenRaw)))
          : 18;
        steps.push({
          action: `${stepPrefix}-assert-persisted`,
          ok: true,
          detail: `mode=${observedMode}, len=${observedLen}`,
        });

        return {
          observedMode,
          observedLen,
        };
      };

      const persistStreamingSettings = async (
        settings: {
          enabled: boolean;
          autoCollapse: boolean;
          previewChars: number;
        },
        stepPrefix: "update-stream-settings" | "restore-stream-settings",
      ) => {
        await it_waitForUiCondition(() => {
          const saveButton = document.querySelector<HTMLButtonElement>(streamSaveButtonSelector);
          const enabledCheckbox =
            document.querySelector<HTMLInputElement>(streamEnabledSelector);
          const autoCollapseCheckbox =
            document.querySelector<HTMLInputElement>(streamAutoCollapseSelector);
          const previewInput = document.querySelector<HTMLInputElement>(streamPreviewSelector);
          return (
            Boolean(saveButton) &&
            !Boolean(saveButton?.disabled) &&
            Boolean(enabledCheckbox) &&
            !Boolean(enabledCheckbox?.disabled) &&
            Boolean(autoCollapseCheckbox) &&
            !Boolean(autoCollapseCheckbox?.disabled) &&
            Boolean(previewInput) &&
            !Boolean(previewInput?.disabled)
          );
        }, 10_000, `${stepPrefix} save button enabled`);

        it_setCheckboxValue(streamEnabledSelector, settings.enabled);
        it_setCheckboxValue(streamAutoCollapseSelector, settings.autoCollapse);
        it_fillInputValue(streamPreviewSelector, String(settings.previewChars));
        await it_delay(IT_E2E_UI_CLICK_DELAY_MS);

        const selectedEnabled = Boolean(
          document.querySelector<HTMLInputElement>(streamEnabledSelector)?.checked,
        );
        const selectedAutoCollapse = Boolean(
          document.querySelector<HTMLInputElement>(streamAutoCollapseSelector)?.checked,
        );
        const selectedPreview = Number(
          document.querySelector<HTMLInputElement>(streamPreviewSelector)?.value || 0,
        );
        const inputOk =
          selectedEnabled === settings.enabled &&
          selectedAutoCollapse === settings.autoCollapse &&
          selectedPreview === settings.previewChars;
        steps.push({
          action: `${stepPrefix}-set-input`,
          ok: inputOk,
          detail: `enabled=${selectedEnabled}, autoCollapse=${selectedAutoCollapse}, previewChars=${selectedPreview}`,
        });
        if (!inputOk) {
          throw new Error(
            `Failed to set streaming settings input: enabled=${selectedEnabled}, autoCollapse=${selectedAutoCollapse}, previewChars=${selectedPreview}`,
          );
        }

        if (injectFailureStage && injectFailureStage === stepPrefix) {
          steps.push({
            action: `inject-failure-${stepPrefix}`,
            ok: true,
            detail: `stage=${stepPrefix}`,
          });
          throw new Error(`Injected settings failure at ${stepPrefix}`);
        }

        const beforeMessage = (
          document.querySelector<HTMLElement>(streamSaveMessageSelector)?.textContent || ""
        ).trim();
        it_clickUiElement(streamSaveButtonSelector);
        steps.push({ action: `${stepPrefix}-click-save`, ok: true });

        await it_waitForUiCondition(() => {
          const saveMessage = (
            document.querySelector<HTMLElement>(streamSaveMessageSelector)?.textContent || ""
          ).trim();
          return Boolean(saveMessage) || Boolean(beforeMessage);
        }, 10_000, `${stepPrefix} save feedback`);
        const saveMessage = (
          document.querySelector<HTMLElement>(streamSaveMessageSelector)?.textContent || ""
        ).trim();
        steps.push({
          action: `${stepPrefix}-assert-message`,
          ok: Boolean(saveMessage) || Boolean(beforeMessage),
          detail: saveMessage || beforeMessage || "(empty)",
        });

        const persistedConfig = await waitStreamingPersisted(settings, stepPrefix);
        const observedEnabled = normalizeStreamingEnabled(persistedConfig?.streaming?.enabled);
        const observedAutoCollapse = normalizeStreamingAutoCollapse(
          persistedConfig?.streaming?.autoCollapse,
        );
        const observedPreview = normalizeStreamingPreview(persistedConfig?.streaming?.previewChars ?? 200);
        steps.push({
          action: `${stepPrefix}-assert-persisted`,
          ok: true,
          detail: `enabled=${observedEnabled}, autoCollapse=${observedAutoCollapse}, previewChars=${observedPreview}`,
        });

        return {
          observedEnabled,
          observedAutoCollapse,
          observedPreview,
        };
      };

      const updatedObserved = await persistTopicSettings(
        updatedMode,
        updatedLen,
        "update-topic-settings",
      );
      const restoredObserved = await persistTopicSettings(
        beforeMode,
        beforeLen,
        "restore-topic-settings",
      );
      const updatedStreamingObserved = await persistStreamingSettings(
        {
          enabled: updatedStreamingEnabled,
          autoCollapse: updatedStreamingAutoCollapse,
          previewChars: updatedStreamingPreview,
        },
        "update-stream-settings",
      );
      const restoredStreamingObserved = await persistStreamingSettings(
        {
          enabled: beforeStreamingEnabled,
          autoCollapse: beforeStreamingAutoCollapse,
          previewChars: beforeStreamingPreview,
        },
        "restore-stream-settings",
      );

      const traceButtonSelector = "[data-testid='it-settings-enable-trace-logs-button']";
      await it_waitForUiCondition(() => {
        const traceButton = document.querySelector<HTMLButtonElement>(traceButtonSelector);
        return Boolean(traceButton);
      }, 15_000, "trace-log settings control");

      if (injectFailureStage && injectFailureStage === "trace-logs") {
        steps.push({
          action: "inject-failure-trace-logs",
          ok: true,
          detail: "stage=trace-logs",
        });
        throw new Error("Injected settings failure at trace-logs");
      }

      const traceButtonBeforeClick = document.querySelector<HTMLButtonElement>(traceButtonSelector);
      const traceAlreadyEnabled = Boolean(traceButtonBeforeClick?.disabled);
      if (traceAlreadyEnabled) {
        steps.push({
          action: "skip-enable-trace-logs-already-enabled",
          ok: true,
          detail: "trace logs already enabled before click",
        });
      } else {
        it_clickUiElement(traceButtonSelector);
        steps.push({ action: "click-enable-trace-logs", ok: true });

        await it_waitForUiCondition(() => {
          const traceButton = document.querySelector<HTMLButtonElement>(traceButtonSelector);
          return Boolean(traceButton?.disabled);
        }, 15_000, "trace-log enabled state");
      }
      steps.push({
        action: "assert-trace-logs-enabled",
        ok: true,
        detail: traceAlreadyEnabled
          ? "trace logs button already disabled"
          : "trace logs button disabled after enable",
      });

      let traceResp = await request("it/enableTraceLogs", {}, { timeoutMs: 8_000 });
      if (injectFailureStage && injectFailureStage === "trace-handler-response") {
        steps.push({
          action: "inject-failure-trace-handler-response",
          ok: true,
          detail: "stage=trace-handler-response",
        });
        traceResp = {
          status: "error",
          error: "Injected settings failure at trace-handler-response",
        };
      }
      const traceStatus = String(traceResp?.status || "");
      const traceEnabled = traceStatus === "success";
      steps.push({
        action: "assert-trace-logs-handler-response",
        ok: traceEnabled,
        detail: `status=${traceStatus || "(empty)"}`,
      });
      if (!traceEnabled) {
        throw new Error(
          `enableTraceLogs request failed: ${String(traceResp?.error || "unknown_error")}`,
        );
      }

      it_clickUiElement("[data-testid='it-tab-practice']");
      await it_delay(IT_E2E_UI_CLICK_DELAY_MS);
      const practicePage = it_detectPageFromDom();
      steps.push({
        action: "return-practice-tab",
        ok: practicePage === "practice",
        detail: `page=${practicePage}`,
      });
      if (practicePage !== "practice") {
        throw new Error(`Expected practice page, got ${practicePage}`);
      }

      await sendAck("success", undefined, {
        traceLogsEnabled: true,
        topicModeBefore: beforeMode,
        topicModeUpdated: updatedMode,
        topicModeRestored: beforeMode,
        topicModeObservedAfterUpdate: updatedObserved.observedMode,
        topicModeObservedAfterRestore: restoredObserved.observedMode,
        topicTitleLenBefore: beforeLen,
        topicTitleLenUpdated: updatedLen,
        topicTitleLenRestored: beforeLen,
        topicTitleLenObservedAfterUpdate: updatedObserved.observedLen,
        topicTitleLenObservedAfterRestore: restoredObserved.observedLen,
        streamingEnabledBefore: beforeStreamingEnabled,
        streamingEnabledUpdated: updatedStreamingEnabled,
        streamingEnabledRestored: beforeStreamingEnabled,
        streamingEnabledObservedAfterUpdate: updatedStreamingObserved.observedEnabled,
        streamingEnabledObservedAfterRestore: restoredStreamingObserved.observedEnabled,
        streamingAutoCollapseBefore: beforeStreamingAutoCollapse,
        streamingAutoCollapseUpdated: updatedStreamingAutoCollapse,
        streamingAutoCollapseRestored: beforeStreamingAutoCollapse,
        streamingAutoCollapseObservedAfterUpdate:
          updatedStreamingObserved.observedAutoCollapse,
        streamingAutoCollapseObservedAfterRestore:
          restoredStreamingObserved.observedAutoCollapse,
        streamingPreviewBefore: beforeStreamingPreview,
        streamingPreviewUpdated: updatedStreamingPreview,
        streamingPreviewRestored: beforeStreamingPreview,
        streamingPreviewObservedAfterUpdate: updatedStreamingObserved.observedPreview,
        streamingPreviewObservedAfterRestore: restoredStreamingObserved.observedPreview,
        envBefore,
        envTarget: targetEnv,
        envTargetCreated: !targetEnvExists,
        envTargetObserved: String(targetEnvConfig?.activeEnvironment || ""),
        envRestoredObserved: String(restoredEnvConfig?.activeEnvironment || ""),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ action: "settings-flow", ok: false, detail: message });
      await sendAck("error", message);
    }
  })();
});
  return disposeSettingsFlow;
}
