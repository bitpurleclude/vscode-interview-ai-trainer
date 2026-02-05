import type { ItWebviewHandlersHost } from "./it_webviewHandlers";
import type { ItApiTemplate } from "../../../protocol/interviewTrainer";
import {
  IT_SAMPLE_AUDIO_BASE64,
  IT_SAMPLE_AUDIO_BYTE_LENGTH,
  IT_SAMPLE_AUDIO_CHANNEL,
  IT_SAMPLE_AUDIO_FORMAT,
  IT_SAMPLE_AUDIO_SAMPLE_RATE,
} from "../../constants/it_sampleAudio";

export function it_maskHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = { ...headers };
  Object.keys(masked).forEach((key) => {
    const lower = key.toLowerCase();
    if (lower === "authorization") {
      const value = masked[key] || "";
      masked[key] = value.startsWith("Bearer ") ? "Bearer ***" : "***";
      return;
    }
    if (lower === "x-api-key" || lower === "x-goog-api-key" || lower === "api-key") {
      masked[key] = "***";
    }
  });
  return masked;
}

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

const DEFAULT_TEST_INSTRUCTIONS = "你是一个测试助手。";

function it_mergeDeep(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...base };
  Object.entries(patch).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }
    const current = next[key];
    if (it_isPlainObject(current) && it_isPlainObject(value)) {
      next[key] = it_mergeDeep(
        current as Record<string, unknown>,
        value as Record<string, unknown>,
      );
      return;
    }
    next[key] = value;
  });
  return next;
}

export function it_buildTemplateTestDefaults(
  host: ItWebviewHandlersHost,
  template: ItApiTemplate,
): Record<string, unknown> {
  const snapshot = host.configSnapshot;
  const defaults: Record<string, unknown> = {};
  if (template.category === "llm") {
    defaults.model = snapshot.llm?.model;
    defaults.temperature = snapshot.llm?.temperature;
    defaults.topP = snapshot.llm?.topP;
    defaults.reasoningEffort = snapshot.llm?.reasoningEffort;
    defaults.maxOutputTokens = snapshot.llm?.maxOutputTokens;
    defaults.reusePrefix = snapshot.llm?.reusePrefix;
    defaults.stream = snapshot.llm?.stream;
  } else if (template.category === "embedding") {
    defaults.model = snapshot.retrieval?.vector?.model;
    defaults.embeddingInput = "embedding test";
    defaults.embeddingInputs = [{ type: "text", text: "embedding test" }];
  } else if (template.category === "asr") {
    defaults.audioFile = IT_SAMPLE_AUDIO_BASE64;
    defaults.audio = {
      format: IT_SAMPLE_AUDIO_FORMAT,
      sampleRate: IT_SAMPLE_AUDIO_SAMPLE_RATE,
      channel: IT_SAMPLE_AUDIO_CHANNEL,
      byteLength: IT_SAMPLE_AUDIO_BYTE_LENGTH,
    };
    defaults.asr = {
      lang: snapshot.asr?.language || "zh",
      dev_pid: snapshot.asr?.devPid ?? 1537,
    };
  }
  return defaults;
}

export function it_buildTemplateTestVariables(
  payload: any,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const inputText = String(payload?.inputText || "");
  const base: Record<string, unknown> = {};
  if (inputText) {
    base.input = inputText;
    base.embeddingInput = inputText;
    base.embeddingInputs = [{ type: "text", text: inputText }];
    base.instructions = DEFAULT_TEST_INSTRUCTIONS;
    base.messages = [
      { role: "system", content: DEFAULT_TEST_INSTRUCTIONS },
      { role: "user", content: inputText },
    ];
  }
  if (typeof payload?.stream === "boolean") {
    base.stream = payload.stream;
  }
  const extra = it_isPlainObject(payload?.variables) ? payload.variables : {};
  const merged = it_mergeDeep(it_mergeDeep(base, defaults), extra);
  if (inputText) {
    merged.embeddingInput = inputText;
    merged.embeddingInputs = [{ type: "text", text: inputText }];
  }
  if (merged.embeddingInputs === undefined && merged.embeddingInput !== undefined) {
    const rawInput = merged.embeddingInput as unknown;
    if (Array.isArray(rawInput)) {
      merged.embeddingInputs = rawInput.map((text) => ({
        type: "text",
        text: String(text),
      }));
    } else {
      merged.embeddingInputs = [{ type: "text", text: String(rawInput) }];
    }
  }
  return { ...merged };
}

export function it_emitLlmTestRequest(
  host: ItWebviewHandlersHost,
  detail: Record<string, unknown>,
): void {
  const stamp = new Date().toISOString();
  host.outputChannel.appendLine(`[${stamp}] LLM test request`);
  try {
    host.outputChannel.appendLine(JSON.stringify(detail, null, 2));
  } catch {
    host.outputChannel.appendLine(String(detail));
  }
  host.outputChannel.show(true);
}