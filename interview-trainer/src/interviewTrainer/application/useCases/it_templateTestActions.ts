import type * as vscode from "vscode";
import type { ItApiTemplate, ItConfigSnapshot } from "../../../protocol/interviewTrainer";
import {
  IT_SAMPLE_AUDIO_BASE64,
  IT_SAMPLE_AUDIO_BYTE_LENGTH,
  IT_SAMPLE_AUDIO_CHANNEL,
  IT_SAMPLE_AUDIO_FORMAT,
  IT_SAMPLE_AUDIO_SAMPLE_RATE,
} from "../../constants/it_sampleAudio";
import type { ItConfigService } from "../services/it_configGateway";
import { it_extractTokenInfo } from "../services/it_tokens";
import {
  it_executeTemplate,
  it_renderTemplateRequest,
  it_resolveTemplateById,
} from "../services/it_templateGateway";

export type ItTemplateTestUseCaseContext = {
  extensionContext: vscode.ExtensionContext;
  configService: ItConfigService;
  configSnapshot: ItConfigSnapshot;
  emitTemplateTestDelta?: (payload: { runId: string; delta: string; full: string }) => void;
};

type ItTemplateTestRuntime = {
  template: ItApiTemplate;
  runtime: {
    template: ItApiTemplate;
    environment: string;
    context: vscode.ExtensionContext;
  };
};

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

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

function it_maskHeaders(headers: Record<string, string>): Record<string, string> {
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

function it_resolveTemplateTestRuntime(
  context: ItTemplateTestUseCaseContext,
  payload: Record<string, unknown>,
): ItTemplateTestRuntime {
  const templateId = String(payload.templateId || "").trim();
  if (!templateId) {
    throw new Error("missing template id");
  }

  const configBundle = context.configService.loadBundle();
  const templatesConfig = configBundle.templates || { version: 1, environments: {} };
  const environment =
    String(payload.environment || "").trim() ||
    configBundle.api?.active?.environment ||
    "prod";
  const template = it_resolveTemplateById(templatesConfig, environment, templateId);
  if (!template) {
    throw new Error("template not found or unavailable");
  }

  return {
    template,
    runtime: {
      template,
      environment,
      context: context.extensionContext,
    },
  };
}

const DEFAULT_TEST_INSTRUCTIONS = "You are a template test assistant.";

function it_buildTemplateTestDefaults(
  configSnapshot: ItConfigSnapshot,
  template: ItApiTemplate,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  if (template.category === "llm") {
    defaults.model = configSnapshot.llm?.model;
    defaults.temperature = configSnapshot.llm?.temperature;
    defaults.topP = configSnapshot.llm?.topP;
    defaults.reasoningEffort = configSnapshot.llm?.reasoningEffort;
    defaults.maxOutputTokens = configSnapshot.llm?.maxOutputTokens;
    defaults.reusePrefix = configSnapshot.llm?.reusePrefix;
    defaults.stream = configSnapshot.llm?.stream;
  } else if (template.category === "embedding") {
    defaults.model = configSnapshot.retrieval?.vector?.model;
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
      lang: configSnapshot.asr?.language || "zh",
      dev_pid: configSnapshot.asr?.devPid ?? 1537,
    };
  }
  return defaults;
}

function it_buildTemplateTestVariables(
  payload: Record<string, unknown>,
  defaults: Record<string, unknown>,
): Record<string, unknown> {
  const inputText = String(payload.inputText || "");
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

  if (typeof payload.stream === "boolean") {
    base.stream = payload.stream;
  }

  const extra = it_isPlainObject(payload.variables) ? payload.variables : {};
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

export async function it_testTemplateDryRun(params: {
  context: ItTemplateTestUseCaseContext;
  payload: unknown;
}): Promise<{
  request: Awaited<ReturnType<typeof it_renderTemplateRequest>>;
  missing: string[];
}> {
  const payload = it_asRecord(params.payload);
  const resolved = it_resolveTemplateTestRuntime(params.context, payload);
  const defaults = it_buildTemplateTestDefaults(params.context.configSnapshot, resolved.template);
  const variables = it_buildTemplateTestVariables(payload, defaults);

  const requestPreview = await it_renderTemplateRequest({
    runtime: resolved.runtime,
    variables,
    maskSecrets: true,
  });

  return {
    request: {
      ...requestPreview,
      headers: it_maskHeaders(requestPreview.headers),
    },
    missing: requestPreview.missing,
  };
}

export async function it_testTemplateLive(params: {
  context: ItTemplateTestUseCaseContext;
  payload: unknown;
}): Promise<{
  runId: string;
  result: Awaited<ReturnType<typeof it_executeTemplate>>;
  tokenInfo?: ReturnType<typeof it_extractTokenInfo>;
}> {
  const payload = it_asRecord(params.payload);
  const resolved = it_resolveTemplateTestRuntime(params.context, payload);
  const defaults = it_buildTemplateTestDefaults(params.context.configSnapshot, resolved.template);
  const variables = it_buildTemplateTestVariables(payload, defaults);

  const preview = await it_renderTemplateRequest({
    runtime: resolved.runtime,
    variables,
  });
  if (preview.missing.length) {
    throw new Error(`missing template variables: ${preview.missing.join(", ")}`);
  }

  const runId = String(payload.runId || "");
  const result = await it_executeTemplate({
    runtime: resolved.runtime,
    variables,
    onDelta: (delta, full) => {
      params.context.emitTemplateTestDelta?.({ runId, delta, full });
    },
  });
  const tokenInfo =
    resolved.template.category === "token"
      ? it_extractTokenInfo(resolved.template, result)
      : undefined;

  return {
    runId,
    result,
    tokenInfo,
  };
}
