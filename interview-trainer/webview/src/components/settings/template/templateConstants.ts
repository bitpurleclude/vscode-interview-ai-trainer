import type { ItTemplateCategory } from "../../../types";

export const TEMPLATE_CATEGORY_TABS: Array<{
  key: ItTemplateCategory;
  label: string;
  enabled: boolean;
}> = [
  { key: "llm", label: "LLM", enabled: true },
  { key: "asr", label: "ASR", enabled: true },
  { key: "embedding", label: "Embedding", enabled: true },
  { key: "token", label: "Token", enabled: true },
  { key: "tts", label: "TTS", enabled: false },
  { key: "vision", label: "Vision", enabled: false },
];

export const TEMPLATE_METHODS = ["POST", "GET", "PUT", "PATCH", "DELETE"];

export const TEMPLATE_RESPONSE_MODES = [
  { value: "json", label: "JSON" },
  { value: "sse", label: "SSE" },
  { value: "ndjson", label: "NDJSON" },
  { value: "websocket", label: "WebSocket" },
  { value: "binary", label: "Binary" },
];

export const TEMPLATE_LOW_PRIORITY_VARS = new Set([
  "apiKey",
  "secretKey",
  "timeoutSec",
  "stream",
]);
