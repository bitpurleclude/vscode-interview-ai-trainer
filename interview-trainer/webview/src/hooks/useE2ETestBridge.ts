import { useEffect } from "react";
import { request } from "../messenger";
import {
  IT_E2E_WEBVIEW_UI_READY,
  UseE2ETestBridgeOptions,
  it_isE2ETestModeEnabled,
} from "./e2e/it_e2eShared";
import { it_registerUiAutomationHandler } from "./e2e/it_uiAutomationHandler";
import { it_registerAnalyzeFlowHandler } from "./e2e/it_analyzeFlowHandler";
import { it_registerSettingsFlowHandler } from "./e2e/it_settingsFlowHandler";
import { it_registerProtocolGuardHandler } from "./e2e/it_protocolGuardHandler";

export function useE2ETestBridge({
  setQuestionText,
  setQuestionList,
  handleImportAudio,
  setAudioPayloadForTest,
}: UseE2ETestBridgeOptions): void {
  useEffect(() => {
    if (!it_isE2ETestModeEnabled()) {
      return;
    }

    const sendReady = () => {
      void request(
        IT_E2E_WEBVIEW_UI_READY,
        { ready: true, ts: Date.now() },
        { timeoutMs: 5_000 },
      );
    };

    sendReady();
    const readyTimer = window.setInterval(sendReady, 3_000);

    const disposeUiAutomation = it_registerUiAutomationHandler();
    const disposeAnalyzeFlow = it_registerAnalyzeFlowHandler({
      setQuestionText,
      setQuestionList,
      handleImportAudio,
      setAudioPayloadForTest,
    });
    const disposeSettingsFlow = it_registerSettingsFlowHandler();
    const disposeProtocolGuard = it_registerProtocolGuardHandler();

    return () => {
      window.clearInterval(readyTimer);
      disposeUiAutomation();
      disposeAnalyzeFlow();
      disposeSettingsFlow();
      disposeProtocolGuard();
    };
  }, []);
}
