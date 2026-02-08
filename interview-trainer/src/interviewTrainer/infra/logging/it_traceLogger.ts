import type { ItApiTemplate } from "../../../protocol/interviewTrainer";
import type { ItLlmConfig, ItLlmMessage } from "../api/it_llmTypes";
import {
  it_renderTemplateRequest,
  type ItTemplateRuntime,
} from "../api/it_templateExecutor";

export type ItTraceSink = (message: string, detail?: Record<string, unknown>) => void;

type ItTraceTemplateInfo = {
  id: string;
  name?: string;
  category?: string;
};

type ItTraceRequest = {
  method?: string;
  url?: string;
  headers?: Record<string, string>;
  query?: Record<string, unknown>;
  body?: unknown;
  stream?: boolean;
  timeoutSec?: number;
  missing?: string[];
};

function it_buildTemplateInfo(template?: ItApiTemplate | null): ItTraceTemplateInfo | undefined {
  if (!template) {
    return undefined;
  }
  return {
    id: template.id,
    name: template.name,
    category: template.category,
  };
}

function it_sanitizeString(value: string, key?: string): string {
  const lower = String(key || "").toLowerCase();
  if (lower.includes("authorization")) {
    return "***";
  }
  if (lower.includes("audiofile") || lower.includes("speech")) {
    return `[base64 len=${value.length}]`;
  }
  if (value.length > 500) {
    return `${value.slice(0, 500)}...(len=${value.length})`;
  }
  return value;
}

function it_sanitizeValue(value: unknown, key?: string): unknown {
  if (value === null || value === undefined) {
    return value;
  }
  if (typeof value === "string") {
    return it_sanitizeString(value, key);
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    if (key === "messages") {
      return value.map((msg) => {
        if (!msg || typeof msg !== "object") {
          return msg;
        }
        const role = (msg as { role?: string }).role;
        const content = (msg as { content?: unknown }).content;
        return {
          role,
          content: typeof content === "string" ? it_sanitizeString(content, "content") : content,
        };
      });
    }
    return value.map((item) => it_sanitizeValue(item));
  }
  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => {
      output[k] = it_sanitizeValue(v, k);
    });
    return output;
  }
  return value;
}

function it_buildLlmVariables(
  cfg: ItLlmConfig,
  messages: ItLlmMessage[],
  streamEnabled: boolean,
): Record<string, unknown> {
  const instructions: string[] = [];
  const input: any[] = [];
  messages.forEach((msg) => {
    if (msg.role === "system") {
      instructions.push(String(msg.content || ""));
      return;
    }
    input.push({
      type: "message",
      role: msg.role,
      content: [
        {
          type: "input_text",
          text: msg.content,
        },
      ],
    });
  });
  const joined = instructions.map((item) => item.trim()).filter(Boolean).join("\n\n");
  return {
    messages,
    input,
    instructions: joined || undefined,
    temperature: cfg.temperature,
    topP: cfg.topP,
    reasoningEffort: cfg.reasoningEffort,
    maxOutputTokens: cfg.maxOutputTokens,
    reusePrefix: cfg.reusePrefix,
    stream: streamEnabled,
    ...(cfg.templateVars || {}),
  };
}

async function it_buildTemplateRequest(
  runtime: ItTemplateRuntime,
  variables: Record<string, unknown>,
  stream?: boolean,
  timeoutSec?: number,
): Promise<ItTraceRequest> {
  const rendered = await it_renderTemplateRequest({
    runtime,
    variables,
    stream,
    timeoutSec,
    maskSecrets: true,
  });
  return {
    method: rendered.method,
    url: rendered.url,
    headers: rendered.headers,
    query: rendered.query,
    body: rendered.body,
    stream: rendered.stream,
    timeoutSec: rendered.timeoutSec,
    missing: rendered.missing,
  };
}

export function it_createTraceLogger(sink?: ItTraceSink) {
  const emit = (message: string, detail?: Record<string, unknown>) => {
    if (!sink) {
      return;
    }
    sink(message, detail ? (it_sanitizeValue(detail) as Record<string, unknown>) : undefined);
  };

  return {
    logTemplateRequest: async (
      stage: string,
      runtime: ItTemplateRuntime,
      variables: Record<string, unknown>,
      options?: { stream?: boolean; timeoutSec?: number },
    ) => {
      const request = await it_buildTemplateRequest(runtime, variables, options?.stream, options?.timeoutSec);
      emit(`${stage} request`, {
        event: "template.request",
        stage,
        type: "request",
        template: it_buildTemplateInfo(runtime.template),
        env: runtime.environment,
        request,
      });
    },
    logTemplateResponse: (
      stage: string,
      runtime: ItTemplateRuntime,
      response: {
        text?: string;
        value?: unknown;
        status?: number;
        headers?: Record<string, string>;
        raw?: unknown;
      },
    ) => {
      emit(`${stage} response`, {
        event: "template.response",
        stage,
        type: "response",
        template: it_buildTemplateInfo(runtime.template),
        env: runtime.environment,
        response,
      });
    },
    logTemplateError: (
      stage: string,
      runtime: ItTemplateRuntime | null,
      error: unknown,
      detail?: Record<string, unknown>,
    ) => {
      emit(`${stage} error`, {
        event: "template.error",
        stage,
        type: "error",
        template: it_buildTemplateInfo(runtime?.template || undefined),
        env: runtime?.environment,
        error: error instanceof Error ? error.message : String(error),
        ...(detail || {}),
      });
    },
    logLlmTemplateRequest: async (
      stage: string,
      cfg: ItLlmConfig,
      messages: ItLlmMessage[],
      streamEnabled?: boolean,
    ) => {
      if (!cfg.template || !cfg.templateContext || !cfg.templateEnv) {
        return;
      }
      const runtime: ItTemplateRuntime = {
        template: cfg.template,
        environment: cfg.templateEnv,
        context: cfg.templateContext,
      };
      const variables = it_buildLlmVariables(cfg, messages, streamEnabled ?? cfg.stream ?? true);
      const request = await it_buildTemplateRequest(runtime, variables, streamEnabled ?? cfg.stream, cfg.timeoutSec);
      emit(`${stage} request`, {
        event: "llm.template.request",
        stage,
        type: "request",
        template: it_buildTemplateInfo(runtime.template),
        env: runtime.environment,
        request,
      });
    },
    logLlmTemplateResponse: (stage: string, cfg: ItLlmConfig, responseText: string) => {
      if (!cfg.template || !cfg.templateEnv) {
        return;
      }
      emit(`${stage} response`, {
        event: "llm.template.response",
        stage,
        type: "response",
        template: it_buildTemplateInfo(cfg.template),
        env: cfg.templateEnv,
        response: { text: responseText },
      });
    },
    logLlmTemplateError: (stage: string, cfg: ItLlmConfig | null | undefined, error: unknown) => {
      if (!cfg?.template || !cfg.templateEnv) {
        return;
      }
      emit(`${stage} error`, {
        event: "llm.template.error",
        stage,
        type: "error",
        template: it_buildTemplateInfo(cfg.template),
        env: cfg.templateEnv,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  };
}
