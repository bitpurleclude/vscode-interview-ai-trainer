import path from "path";
import type { ItTemplateRuntime } from "../../infra/api/it_templateExecutor";
import type { ItLlmConfig } from "../../infra/api/it_llmTypes";
import type { ItAnalyzeDeps } from "./flow_types";

export function it_splitFallbackQuestions(text: string): string[] {
  const raw = text.trim();
  if (!raw) {
    return [];
  }
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const numbered: string[] = [];
  for (const line of lines) {
    const match = line.match(/^\d+[\.\、\)\s]+/);
    if (!match) {
      continue;
    }
    const trimmed = line.slice(match[0].length).trim();
    if (trimmed) {
      numbered.push(trimmed);
    }
  }
  if (numbered.length > 1) {
    return numbered;
  }
  const joined = lines.join(" ");
  const parts = joined
    .split(/[?？]/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.length > 1) {
    return parts.map((part) => `${part}？`);
  }
  return [];
}

export function it_normalizeWorkspaceKey(root: string): string {
  const resolved = path.resolve(String(root || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

export function it_buildTemplateRuntime(
  deps: ItAnalyzeDeps,
  template: ItTemplateRuntime["template"] | null,
): ItTemplateRuntime | null {
  if (!template) {
    return null;
  }
  const env = deps.apiConfig.active?.environment || "prod";
  return {
    template,
    environment: env,
    context: deps.context,
  };
}

export function it_buildTemplateLlmConfig(
  runtime: ItTemplateRuntime,
  overrides?: Partial<ItLlmConfig>,
): ItLlmConfig {
  const streamEnabled =
    runtime.template.request?.stream === true ||
    runtime.template.response?.mode === "sse";
  const base: ItLlmConfig = {
    provider: "template",
    apiKey: "",
    baseUrl: "",
    model: "",
    temperature: 0.8,
    topP: 0.8,
    timeoutSec: Number(runtime.template.request?.timeoutSec ?? 60),
    maxRetries: 1,
    antiRepeat: false,
    useResponses: false,
    apiMode: "chat",
    responsesPath: "",
    reasoningEffort: undefined,
    maxOutputTokens: 0,
    reusePrefix: false,
    stream: streamEnabled,
  };
  return {
    ...base,
    ...(overrides || {}),
    template: runtime.template,
    templateEnv: runtime.environment,
    templateContext: runtime.context,
  };
}
