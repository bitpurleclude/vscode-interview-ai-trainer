import { on, request } from "../../messenger";
import {
  IT_E2E_WEBVIEW_UI_REQUEST,
  IT_E2E_WEBVIEW_UI_ACK,
  ItE2EUiStep,
  it_clickUiElement,
  it_delay,
  it_detectPageFromDom,
  IT_E2E_UI_CLICK_DELAY_MS,
} from "./it_e2eShared";

export function it_registerUiAutomationHandler(): () => void {
const disposeUiAutomation = on(IT_E2E_WEBVIEW_UI_REQUEST, (payload) => {
  const runId = String(payload?.runId || "");
  const injectFailureStage = String(payload?.options?.injectFailureStage || "").trim();
  const steps: ItE2EUiStep[] = [];

  const sendAck = async (status: "success" | "error", error?: string) => {
    await request(
      IT_E2E_WEBVIEW_UI_ACK,
      {
        runId,
        status,
        error,
        activePage: it_detectPageFromDom(),
        steps,
      },
      { timeoutMs: 10_000 },
    );
  };

  void (async () => {
    if (!runId) {
      await sendAck("error", "Missing runId in UI automation request");
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
        throw new Error(`Injected ui-click failure at ${stage}`);
      };

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
      injectFailure("open-settings-tab");

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
      injectFailure("return-practice-tab");

      it_clickUiElement("[data-testid='it-action-history']");
      steps.push({ action: "click-history-button", ok: true });
      injectFailure("click-history-button");

      await sendAck("success");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ action: "ui-click-flow", ok: false, detail: message });
      await sendAck("error", message);
    }
  })();
});
  return disposeUiAutomation;
}
