import { on, request } from "../../messenger";
import {
  IT_E2E_WEBVIEW_PROTOCOL_REQUEST,
  IT_E2E_WEBVIEW_PROTOCOL_ACK,
  IT_E2E_MISSING_HANDLER_PROBE_TYPE,
  ItE2EUiStep,
  it_detectPageFromDom,
} from "./it_e2eShared";

export function it_registerProtocolGuardHandler(): () => void {
const disposeProtocolGuard = on(IT_E2E_WEBVIEW_PROTOCOL_REQUEST, (payload) => {
  const runId = String(payload?.runId || "");
  const injectFailureStage = String(payload?.options?.injectFailureStage || "").trim();
  const steps: ItE2EUiStep[] = [];

  const sendAck = async (
    status: "success" | "error",
    error?: string,
    probeResponse?: unknown,
  ) => {
    await request(
      IT_E2E_WEBVIEW_PROTOCOL_ACK,
      {
        runId,
        status,
        error,
        activePage: it_detectPageFromDom(),
        steps,
        probeResponse,
      },
      { timeoutMs: 10_000 },
    );
  };

  void (async () => {
    if (!runId) {
      await sendAck("error", "Missing runId in protocol guard request");
      return;
    }

    try {
      if (injectFailureStage && injectFailureStage === "request-missing-handler") {
        steps.push({
          action: "inject-failure-request-missing-handler",
          ok: true,
          detail: "stage=request-missing-handler",
        });
        throw new Error("Injected protocol failure at request-missing-handler");
      }

      let probeResponse = await request(
        IT_E2E_MISSING_HANDLER_PROBE_TYPE,
        { probe: true, ts: Date.now() },
        { timeoutMs: 8_000 },
      );
      steps.push({
        action: "request-missing-handler",
        ok: true,
        detail: `type=${IT_E2E_MISSING_HANDLER_PROBE_TYPE}`,
      });

      if (injectFailureStage && injectFailureStage === "assert-missing-handler-error") {
        steps.push({
          action: "inject-failure-assert-missing-handler-error",
          ok: true,
          detail: "stage=assert-missing-handler-error",
        });
        probeResponse = {
          status: "success",
          errorCode: "",
          error: "",
        };
      }

      const status = String(probeResponse?.status || "");
      const errorCode = String(probeResponse?.errorCode || "");
      const errorText = String(probeResponse?.error || "");
      const valid = status === "error" && errorCode === "handler_not_found" && Boolean(errorText);
      steps.push({
        action: "assert-missing-handler-error",
        ok: valid,
        detail: `status=${status}, errorCode=${errorCode}`,
      });
      if (!valid) {
        if (injectFailureStage && injectFailureStage === "assert-missing-handler-error") {
          throw new Error("Injected protocol failure at assert-missing-handler-error");
        }
        throw new Error(`Unexpected protocol probe response: ${JSON.stringify(probeResponse)}`);
      }

      await sendAck("success", undefined, probeResponse);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      steps.push({ action: "protocol-guard-flow", ok: false, detail: message });
      await sendAck("error", message);
    }
  })();
});
  return disposeProtocolGuard;
}
