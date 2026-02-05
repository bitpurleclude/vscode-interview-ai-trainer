import axios from "axios";
import type * as vscode from "vscode";
import type { ItApiTemplate, ItTemplateCategory } from "../../../protocol/interviewTrainer";
import type { ItTemplatesConfig } from "./it_apiConfig";
import type { ItLlmMessage } from "./it_llmTypes";
import {
  it_appendQuery,
  it_consumeTemplateSse,
  it_extractResponseValue,
} from "./it_templateHttp";
import { it_splitResponsesMessages } from "./it_templateLlm";
import {
  ItTemplateRenderContext,
  it_formatTemplateValue,
  it_injectTemplateSecrets,
  it_isPlainObject,
  it_maskTemplateSecrets,
  it_renderTemplateValue,
} from "./it_templateVars";

export { it_readPath } from "./it_templatePath";

export type ItTemplateRuntime = {
  template: ItApiTemplate;
  environment: string;
  context: vscode.ExtensionContext;
};

export type ItTemplateExecutionOptions = {
  runtime: ItTemplateRuntime;
  variables?: Record<string, unknown>;
  maxRetries?: number;
  timeoutSec?: number;
  stream?: boolean;
  onDelta?: (delta: string, full: string) => void;
  abortSignal?: { aborted: boolean };
};

export type ItTemplateExecutionResult = {
  raw: any;
  value?: any;
  text?: string;
  status?: number;
  headers?: Record<string, string>;
};

export type ItTemplateRenderResult = {
  method: string;
  url: string;
  headers: Record<string, string>;
  query: Record<string, unknown>;
  body: unknown;
  stream: boolean;
  timeoutSec?: number;
  missing: string[];
};

export function it_resolveTemplateById(
  templatesConfig: ItTemplatesConfig,
  environment: string,
  templateId?: string,
): ItApiTemplate | null {
  if (!templateId) {
    return null;
  }
  const envConfig = templatesConfig.environments?.[environment] || {};
  const template = envConfig.templates?.[templateId];
  if (!template) {
    return null;
  }
  return {
    ...template,
    id: template.id || templateId,
  };
}

export function it_resolveBindingTemplate(
  templatesConfig: ItTemplatesConfig,
  environment: string,
  category: ItTemplateCategory,
  bindingKey: string,
): ItApiTemplate | null {
  const envConfig = templatesConfig.environments?.[environment] || {};
  const bindings = envConfig.bindings || {};
  const categoryBindings = bindings[category] || {};
  const templateId = categoryBindings[bindingKey];
  return it_resolveTemplateById(templatesConfig, environment, templateId);
}

export async function it_renderTemplateRequest(options: {
  runtime: ItTemplateRuntime;
  variables?: Record<string, unknown>;
  stream?: boolean;
  timeoutSec?: number;
  maskSecrets?: boolean;
}): Promise<ItTemplateRenderResult> {
  const { runtime } = options;
  const variables = { ...(options.variables || {}) };
  await it_injectTemplateSecrets(runtime, variables);
  if (options.maskSecrets) {
    it_maskTemplateSecrets(variables);
  }
  const ctx: ItTemplateRenderContext = {
    variables,
    missing: new Set<string>(),
  };
  const request = runtime.template.request || { method: "POST", url: "" };
  const streamEnabled =
    typeof options.stream === "boolean"
      ? options.stream
      : typeof request.stream === "boolean"
        ? request.stream
        : false;
  if (variables.stream === undefined) {
    variables.stream = streamEnabled;
  }
  if (variables.timeoutSec === undefined && request.timeoutSec !== undefined) {
    variables.timeoutSec = request.timeoutSec;
  }
  const renderedUrl = await it_renderTemplateValue(request.url, ctx);
  const renderedHeaders = await it_renderTemplateValue(request.headers || {}, ctx);
  const renderedQuery = await it_renderTemplateValue(request.query || {}, ctx);
  const renderedBody = await it_renderTemplateValue(request.body, ctx);

  const query = it_isPlainObject(renderedQuery) ? renderedQuery : {};
  const url = it_appendQuery(String(renderedUrl || ""), query);
  const headers: Record<string, string> = {};
  if (it_isPlainObject(renderedHeaders)) {
    Object.entries(renderedHeaders).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      headers[key] = it_formatTemplateValue(value);
    });
  }
  const timeoutSec = Number(
    options.timeoutSec ?? request.timeoutSec ?? variables.timeoutSec ?? 0,
  );

  return {
    method: String(request.method || "POST").toUpperCase(),
    url,
    headers,
    query,
    body: renderedBody,
    stream: streamEnabled,
    timeoutSec: Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : undefined,
    missing: Array.from(ctx.missing),
  };
}

export async function it_executeTemplate(
  options: ItTemplateExecutionOptions,
): Promise<ItTemplateExecutionResult> {
  const { runtime } = options;
  const variables = { ...(options.variables || {}) };
  await it_injectTemplateSecrets(runtime, variables);

  const ctx: ItTemplateRenderContext = {
    variables,
    missing: new Set<string>(),
  };
  const request = runtime.template.request || { method: "POST", url: "" };
  const streamEnabled =
    typeof options.stream === "boolean"
      ? options.stream
      : typeof request.stream === "boolean"
        ? request.stream
        : false;
  if (variables.stream === undefined) {
    variables.stream = streamEnabled;
  }
  if (variables.timeoutSec === undefined && request.timeoutSec !== undefined) {
    variables.timeoutSec = request.timeoutSec;
  }
  const renderedUrl = await it_renderTemplateValue(request.url, ctx);
  const renderedHeaders = await it_renderTemplateValue(request.headers || {}, ctx);
  const renderedQuery = await it_renderTemplateValue(request.query || {}, ctx);
  const renderedBody = await it_renderTemplateValue(request.body, ctx);

  if (ctx.missing.size) {
    throw new Error(`模板变量缺失: ${Array.from(ctx.missing).join(", ")}`);
  }
  const url = it_appendQuery(String(renderedUrl || ""), renderedQuery || {});
  const headers: Record<string, string> = {};
  if (it_isPlainObject(renderedHeaders)) {
    Object.entries(renderedHeaders).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      headers[key] = it_formatTemplateValue(value);
    });
  }
  const timeoutSec = Number(
    options.timeoutSec ?? request.timeoutSec ?? variables.timeoutSec ?? 0,
  );
  const maxRetries = Math.max(0, Number(options.maxRetries ?? 0));
  const responseMode =
    runtime.template.response?.mode || (runtime.template.streaming ? "sse" : "json");
  const expectStream = responseMode === "sse";

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.abortSignal?.aborted) {
      throw new Error("request aborted");
    }
    try {
      const response = await axios.request({
        method: String(request.method || "POST").toUpperCase(),
        url,
        headers,
        data: renderedBody,
        timeout: timeoutSec > 0 ? timeoutSec * 1000 : undefined,
        responseType: expectStream ? "stream" : "json",
      });
      if (expectStream) {
        const text = await it_consumeTemplateSse(
          response.data,
          runtime.template.streaming,
          runtime.template.response,
          options.onDelta,
          options.abortSignal,
        );
        return {
          raw: text,
          text,
          value: text,
          status: response.status,
          headers: response.headers as Record<string, string>,
        };
      }
      const data = response.data;
      const value = it_extractResponseValue(data, runtime.template.response);
      const text = typeof value === "string" ? value : undefined;
      return {
        raw: data,
        value,
        text,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Template request failed.");
}

export async function it_executeLlmTemplate(
  runtime: ItTemplateRuntime,
  messages: ItLlmMessage[],
  options?: {
    variables?: Record<string, unknown>;
    maxRetries?: number;
    timeoutSec?: number;
    stream?: boolean;
    onDelta?: (delta: string, full: string) => void;
    abortSignal?: { aborted: boolean };
  },
): Promise<string> {
  const { input, instructions } = it_splitResponsesMessages(messages);
  const variables = {
    messages,
    input,
    instructions,
    ...(options?.variables || {}),
  };
  const result = await it_executeTemplate({
    runtime,
    variables,
    maxRetries: options?.maxRetries,
    timeoutSec: options?.timeoutSec,
    stream: options?.stream,
    onDelta: options?.onDelta,
    abortSignal: options?.abortSignal,
  });
  if (typeof result.text === "string") {
    return result.text;
  }
  if (typeof result.value === "string") {
    return result.value;
  }
  if (result.value !== undefined && result.value !== null) {
    return it_formatTemplateValue(result.value);
  }
  return "";
}
