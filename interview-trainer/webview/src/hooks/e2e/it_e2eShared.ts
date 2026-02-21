import type { ChangeEvent } from "react";
import type { ItAnalyzeRequest } from "../../types";

export const IT_E2E_WEBVIEW_UI_REQUEST = "it/test/webviewUiAutomationRequest";
export const IT_E2E_WEBVIEW_UI_ACK = "it/test/webviewUiAutomationAck";
export const IT_E2E_WEBVIEW_UI_READY = "it/test/webviewUiAutomationReady";
export const IT_E2E_WEBVIEW_ANALYZE_REQUEST = "it/test/webviewAnalyzeFlowRequest";
export const IT_E2E_WEBVIEW_ANALYZE_ACK = "it/test/webviewAnalyzeFlowAck";
export const IT_E2E_WEBVIEW_PROTOCOL_REQUEST = "it/test/webviewProtocolGuardRequest";
export const IT_E2E_WEBVIEW_PROTOCOL_ACK = "it/test/webviewProtocolGuardAck";
export const IT_E2E_WEBVIEW_SETTINGS_REQUEST = "it/test/webviewSettingsFlowRequest";
export const IT_E2E_WEBVIEW_SETTINGS_ACK = "it/test/webviewSettingsFlowAck";
export const IT_E2E_MISSING_HANDLER_PROBE_TYPE = "it/test/missingHandlerProbe";
export const IT_E2E_UI_CLICK_DELAY_MS = 80;
export const IT_E2E_UI_WAIT_POLL_MS = 30;
export const IT_E2E_UI_ANALYZE_TIMEOUT_MS = 45_000;

export type ItE2EUiStep = {
  action: string;
  ok: boolean;
  detail?: string;
};

export type ItE2EAnalyzeAudioPayload = {
  base64: string;
  filename?: string;
  mimeType?: string;
};

export type ItE2EAnalyzeMode = "analyze" | "cancel" | "save";

export function it_isE2ETestModeEnabled(): boolean {
  return Boolean((window as any).__itE2ETestMode);
}

export function it_delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function it_detectPageFromDom(): "practice" | "settings" | "unknown" {
  if (document.querySelector(".it-settings")) {
    return "settings";
  }
  if (document.querySelector(".it-flow")) {
    return "practice";
  }
  return "unknown";
}

export function it_clickUiElement(selector: string): void {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  const disabled = "disabled" in element && Boolean((element as HTMLButtonElement).disabled);
  if (disabled) {
    throw new Error(`Element is disabled: ${selector}`);
  }
  if (typeof element.click === "function") {
    element.click();
    return;
  }
  element.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
}

export function it_setReactElementValue(
  element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLSelectElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (descriptor?.set) {
    descriptor.set.call(element, value);
    return;
  }
  (element as { value: string }).value = value;
}

export function it_fillInputValue(selector: string, value: string): void {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  const disabled = "disabled" in element && Boolean(element.disabled);
  if (disabled) {
    throw new Error(`Element is disabled: ${selector}`);
  }
  element.focus();
  it_setReactElementValue(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

export function it_selectValue(selector: string, value: string): void {
  const element = document.querySelector<HTMLSelectElement>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  if (element.disabled) {
    throw new Error(`Element is disabled: ${selector}`);
  }
  element.focus();
  it_setReactElementValue(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
  element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
}

export function it_setCheckboxValue(selector: string, checked: boolean): void {
  const element = document.querySelector<HTMLInputElement>(selector);
  if (!element) {
    throw new Error(`Element not found: ${selector}`);
  }
  if (element.disabled) {
    throw new Error(`Element is disabled: ${selector}`);
  }
  if (element.type !== "checkbox") {
    throw new Error(`Element is not checkbox: ${selector}`);
  }
  element.focus();
  if (element.checked !== checked) {
    element.click();
  }
  const observed = Boolean(
    document.querySelector<HTMLInputElement>(selector)?.checked,
  );
  if (observed !== checked) {
    throw new Error(`Failed to set checkbox value: ${selector} expected=${checked} actual=${observed}`);
  }
}

export async function it_waitForUiCondition(
  check: () => boolean,
  timeoutMs: number,
  label: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) {
      return;
    }
    await it_delay(IT_E2E_UI_WAIT_POLL_MS);
  }
  throw new Error(`Timed out waiting for ${label} after ${timeoutMs}ms`);
}

export function it_base64ToBytes(base64: string): Uint8Array {
  const normalized = String(base64 || "").replace(/\s+/g, "");
  if (!normalized) {
    return new Uint8Array();
  }
  const binary = window.atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export type UseE2ETestBridgeOptions = {
  setQuestionText: (value: string) => void;
  setQuestionList: (value: string) => void;
  handleImportAudio: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
  setAudioPayloadForTest: (audio: ItAnalyzeRequest['audio'] | null) => void;
};
