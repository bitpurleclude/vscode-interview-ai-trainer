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

type ItTemplateExecutorTrace = (
  message: string,
  detail?: Record<string, unknown>,
) => void;

type ItHttpLikeError = {
  message?: unknown;
  response?: {
    status?: unknown;
    headers?: unknown;
    data?: unknown;
  };
};

type ItNormalizedTemplateError = {
  error: unknown;
  statusCode?: number;
  providerCode?: string;
  providerMessage?: string;
  requestId?: string;
  responsePreview?: string;
};

type ItStreamLike = {
  on: (event: string, listener: (...args: any[]) => void) => unknown;
  off?: (event: string, listener: (...args: any[]) => void) => unknown;
  once?: (event: string, listener: (...args: any[]) => void) => unknown;
  removeListener?: (event: string, listener: (...args: any[]) => void) => unknown;
  destroy?: () => unknown;
  resume?: () => unknown;
};

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_statusFromError(error: unknown): number | undefined {
  if (error && typeof error === "object") {
    const response = (error as { response?: { status?: unknown } }).response;
    if (response && typeof response.status === "number") {
      return response.status;
    }
  }
  return undefined;
}

function it_isHttpLikeError(error: unknown): error is ItHttpLikeError {
  return Boolean(error && typeof error === "object" && "response" in (error as object));
}

function it_trimText(value: unknown): string {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function it_compactText(value: string, maxChars = 280): string {
  const normalized = String(value || "").trim().replace(/\s+/g, " ");
  if (!normalized) {
    return "";
  }
  return normalized.length <= maxChars
    ? normalized
    : `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}

function it_toStringOrNumber(value: unknown): string {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
}

function it_pickProviderCode(record: Record<string, unknown>): string | undefined {
  const code = it_toStringOrNumber(
    record.code ??
      record.error_code ??
      record.errorCode ??
      record.status_code ??
      record.statusCode ??
      record.type,
  );
  return code || undefined;
}

function it_pickProviderMessage(record: Record<string, unknown>): string | undefined {
  const message = it_trimText(
    record.message ??
      record.msg ??
      record.error_msg ??
      record.errorMessage ??
      record.detail ??
      record.error_description ??
      record.description,
  );
  return message ? it_compactText(message) : undefined;
}

function it_extractProviderErrorData(data: unknown): {
  code?: string;
  message?: string;
} {
  if (typeof data === "string") {
    const trimmed = data.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        return it_extractProviderErrorData(JSON.parse(trimmed));
      } catch {
        // ignore malformed JSON strings
      }
    }
    const message = it_compactText(trimmed);
    return message ? { message } : {};
  }
  if (!it_isPlainObject(data)) {
    return {};
  }
  const directCode = it_pickProviderCode(data);
  let directMessage = it_pickProviderMessage(data);
  const nestedError = data.error;
  if (!directMessage && typeof nestedError === "string") {
    directMessage = it_compactText(nestedError);
  }
  const nestedCandidates: unknown[] = [nestedError, data.status, data.result, data.data];
  for (const candidate of nestedCandidates) {
    if (!it_isPlainObject(candidate)) {
      continue;
    }
    if (!directMessage) {
      directMessage = it_pickProviderMessage(candidate);
    }
    if (!directCode) {
      const nestedCode = it_pickProviderCode(candidate);
      if (nestedCode) {
        return {
          code: nestedCode,
          message: directMessage || undefined,
        };
      }
    }
  }
  return {
    code: directCode || undefined,
    message: directMessage || undefined,
  };
}

function it_extractRequestId(headers: unknown): string | undefined {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  const record = headers as Record<string, unknown>;
  const keys = Object.keys(record);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (
      lower !== "x-request-id" &&
      lower !== "request-id" &&
      lower !== "x-trace-id" &&
      lower !== "trace-id" &&
      lower !== "x-sf-request-id"
    ) {
      continue;
    }
    const rawValue = record[key];
    if (Array.isArray(rawValue) && rawValue.length) {
      const first = String(rawValue[0] || "").trim();
      if (first) {
        return first;
      }
      continue;
    }
    const value = String(rawValue || "").trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function it_previewResponseData(data: unknown): string | undefined {
  if (data === undefined || data === null) {
    return undefined;
  }
  if (typeof data === "string") {
    return it_compactText(data, 500);
  }
  try {
    return it_compactText(JSON.stringify(data), 500);
  } catch {
    return it_compactText(String(data), 500);
  }
}

function it_isStreamLike(value: unknown): value is ItStreamLike {
  if (!value || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return typeof record.on === "function" && (typeof record.resume === "function" || typeof record.destroy === "function");
}

function it_removeStreamListener(
  stream: ItStreamLike,
  event: string,
  listener: (...args: any[]) => void,
): void {
  if (typeof stream.off === "function") {
    stream.off(event, listener);
    return;
  }
  if (typeof stream.removeListener === "function") {
    stream.removeListener(event, listener);
  }
}

function it_bufferFromChunk(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) {
    return chunk;
  }
  if (chunk instanceof Uint8Array) {
    return Buffer.from(chunk);
  }
  if (typeof chunk === "string") {
    return Buffer.from(chunk);
  }
  return Buffer.from(String(chunk ?? ""));
}

async function it_readStreamPreview(
  stream: ItStreamLike,
  options?: { maxBytes?: number; timeoutMs?: number },
): Promise<string | undefined> {
  const maxBytes = Math.max(256, Number(options?.maxBytes ?? 8192));
  const timeoutMs = Math.max(100, Number(options?.timeoutMs ?? 1200));
  return await new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let finished = false;
    let timer: ReturnType<typeof setTimeout> | undefined = undefined;

    const cleanup = () => {
      if (timer) {
        clearTimeout(timer);
      }
      it_removeStreamListener(stream, "data", onData);
      it_removeStreamListener(stream, "end", onEnd);
      it_removeStreamListener(stream, "error", onError);
      it_removeStreamListener(stream, "close", onClose);
    };

    const finish = () => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      if (!chunks.length) {
        resolve(undefined);
        return;
      }
      const text = Buffer.concat(chunks).toString("utf8");
      resolve(it_compactText(text, 500));
    };

    const onData = (chunk: unknown) => {
      if (finished) {
        return;
      }
      const buffer = it_bufferFromChunk(chunk);
      if (!buffer.length) {
        return;
      }
      const remain = maxBytes - size;
      if (remain <= 0) {
        finish();
        return;
      }
      if (buffer.length > remain) {
        chunks.push(buffer.subarray(0, remain));
        size += remain;
        finish();
        return;
      }
      chunks.push(buffer);
      size += buffer.length;
      if (size >= maxBytes) {
        finish();
      }
    };

    const onEnd = () => finish();
    const onClose = () => finish();
    const onError = () => finish();

    stream.on("data", onData);
    stream.on("end", onEnd);
    stream.on("close", onClose);
    stream.on("error", onError);
    if (typeof stream.resume === "function") {
      stream.resume();
    }
    timer = setTimeout(() => finish(), timeoutMs);
  });
}

async function it_resolveResponseErrorData(data: unknown): Promise<{
  data: unknown;
  responsePreview?: string;
}> {
  if (!it_isStreamLike(data)) {
    return {
      data,
      responsePreview: it_previewResponseData(data),
    };
  }
  const streamPreview = await it_readStreamPreview(data);
  if (!streamPreview) {
    return {
      data,
      responsePreview: "[stream body unavailable]",
    };
  }
  const trimmed = streamPreview.trim();
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return {
        data: JSON.parse(trimmed),
        responsePreview: streamPreview,
      };
    } catch {
      // keep plain-text preview when json parsing fails
    }
  }
  return {
    data: streamPreview,
    responsePreview: streamPreview,
  };
}

function it_buildHttpErrorMessage(params: {
  baseMessage: string;
  statusCode?: number;
  providerCode?: string;
  providerMessage?: string;
  requestId?: string;
}): string {
  const statusText = params.statusCode ? `HTTP ${params.statusCode}` : "";
  let message = statusText || params.baseMessage || "Template request failed.";
  if (params.providerCode) {
    message += ` (${params.providerCode})`;
  }
  if (params.providerMessage) {
    message += `: ${params.providerMessage}`;
  }
  if (params.requestId) {
    message += ` [request_id=${params.requestId}]`;
  }
  return message;
}

async function it_normalizeTemplateError(error: unknown): Promise<ItNormalizedTemplateError> {
  if (!it_isHttpLikeError(error)) {
    return { error };
  }
  const response = error.response || {};
  const statusCode =
    typeof response.status === "number" ? response.status : undefined;
  const resolvedData = await it_resolveResponseErrorData(response.data);
  const { code: providerCode, message: providerMessage } = it_extractProviderErrorData(
    resolvedData.data,
  );
  const requestId = it_extractRequestId(response.headers);
  const responsePreview = resolvedData.responsePreview;
  const baseMessage =
    error instanceof Error ? error.message : it_trimText(error.message);
  const nextMessage = it_buildHttpErrorMessage({
    baseMessage,
    statusCode,
    providerCode,
    providerMessage,
    requestId,
  });
  let normalizedError: unknown = error;
  if (!(error instanceof Error) || error.message !== nextMessage) {
    normalizedError = new Error(nextMessage);
  }
  return {
    error: normalizedError,
    statusCode,
    providerCode,
    providerMessage,
    requestId,
    responsePreview,
  };
}

function it_traceTemplateExecutor(
  onTrace: ItTemplateExecutorTrace | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.("template_executor " + action + " " + status, {
    event: "infra.template_executor." + action,
    layer: "infra",
    module: "it_templateExecutor",
    status,
    ...(detail || {}),
  });
}

export type ItTemplateExecutionOptions = {
  runtime: ItTemplateRuntime;
  variables?: Record<string, unknown>;
  maxRetries?: number;
  timeoutSec?: number;
  stream?: boolean;
  onDelta?: (delta: string, full: string) => void;
  onTrace?: ItTemplateExecutorTrace;
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
  onTrace?: ItTemplateExecutorTrace;
}): Promise<ItTemplateRenderResult> {
  const { runtime } = options;
  const variables = { ...(options.variables || {}) };
  const startedAt = Date.now();
  it_traceTemplateExecutor(options.onTrace, "render_request", "start", {
    templateId: runtime.template.id,
    templateCategory: runtime.template.category,
    environment: runtime.environment,
  });

  try {
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

    const result = {
      method: String(request.method || "POST").toUpperCase(),
      url,
      headers,
      query,
      body: renderedBody,
      stream: streamEnabled,
      timeoutSec: Number.isFinite(timeoutSec) && timeoutSec > 0 ? timeoutSec : undefined,
      missing: Array.from(ctx.missing),
    };

    it_traceTemplateExecutor(options.onTrace, "render_request", "success", {
      templateId: runtime.template.id,
      environment: runtime.environment,
      missingCount: result.missing.length,
      stream: result.stream,
      durationMs: Date.now() - startedAt,
    });

    return result;
  } catch (error) {
    it_traceTemplateExecutor(options.onTrace, "render_request", "error", {
      templateId: runtime.template.id,
      environment: runtime.environment,
      error: it_errorMessage(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

export async function it_executeTemplate(
  options: ItTemplateExecutionOptions,
): Promise<ItTemplateExecutionResult> {
  const { runtime } = options;
  const variables = { ...(options.variables || {}) };
  const startedAt = Date.now();
  it_traceTemplateExecutor(options.onTrace, "run", "start", {
    templateId: runtime.template.id,
    templateCategory: runtime.template.category,
    environment: runtime.environment,
  });

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
    const missing = Array.from(ctx.missing);
    it_traceTemplateExecutor(options.onTrace, "run", "error", {
      templateId: runtime.template.id,
      environment: runtime.environment,
      error: "missing_template_variables",
      missingCount: missing.length,
      durationMs: Date.now() - startedAt,
    });
    throw new Error(`模板变量缺失: ${missing.join(", ")}`);
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
  const expectStream = responseMode === "sse" && streamEnabled;

  let lastError: unknown = undefined;
  let lastErrorDetail: ItNormalizedTemplateError | undefined = undefined;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (options.abortSignal?.aborted) {
      it_traceTemplateExecutor(options.onTrace, "run", "aborted", {
        templateId: runtime.template.id,
        environment: runtime.environment,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        durationMs: Date.now() - startedAt,
      });
      throw new Error("request aborted");
    }

    const attemptStart = Date.now();
    it_traceTemplateExecutor(options.onTrace, "attempt", "start", {
      templateId: runtime.template.id,
      environment: runtime.environment,
      attempt: attempt + 1,
      maxAttempts: maxRetries + 1,
      expectStream,
    });

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
        const streamText = await it_consumeTemplateSse(
          response.data,
          runtime.template.streaming,
          runtime.template.response,
          options.onDelta,
          options.abortSignal,
        );
        it_traceTemplateExecutor(options.onTrace, "attempt", "success", {
          templateId: runtime.template.id,
          environment: runtime.environment,
          attempt: attempt + 1,
          statusCode: response.status,
          durationMs: Date.now() - attemptStart,
        });
        it_traceTemplateExecutor(options.onTrace, "run", "success", {
          templateId: runtime.template.id,
          environment: runtime.environment,
          attempt: attempt + 1,
          statusCode: response.status,
          durationMs: Date.now() - startedAt,
        });
        return {
          raw: streamText,
          text: streamText,
          value: streamText,
          status: response.status,
          headers: response.headers as Record<string, string>,
        };
      }

      const data = response.data;
      const value = it_extractResponseValue(data, runtime.template.response);
      const resolvedText = typeof value === "string" ? value : undefined;
      it_traceTemplateExecutor(options.onTrace, "attempt", "success", {
        templateId: runtime.template.id,
        environment: runtime.environment,
        attempt: attempt + 1,
        statusCode: response.status,
        durationMs: Date.now() - attemptStart,
      });
      it_traceTemplateExecutor(options.onTrace, "run", "success", {
        templateId: runtime.template.id,
        environment: runtime.environment,
        attempt: attempt + 1,
        statusCode: response.status,
        durationMs: Date.now() - startedAt,
      });
      return {
        raw: data,
        value,
        text: resolvedText,
        status: response.status,
        headers: response.headers as Record<string, string>,
      };
    } catch (error) {
      const normalized = await it_normalizeTemplateError(error);
      lastError = normalized.error;
      lastErrorDetail = normalized;
      it_traceTemplateExecutor(options.onTrace, "attempt", "error", {
        templateId: runtime.template.id,
        environment: runtime.environment,
        attempt: attempt + 1,
        maxAttempts: maxRetries + 1,
        statusCode: normalized.statusCode ?? it_statusFromError(normalized.error),
        error: it_errorMessage(normalized.error),
        providerCode: normalized.providerCode,
        providerMessage: normalized.providerMessage,
        requestId: normalized.requestId,
        responsePreview: normalized.responsePreview,
        durationMs: Date.now() - attemptStart,
      });
    }
  }

  it_traceTemplateExecutor(options.onTrace, "run", "error", {
    templateId: runtime.template.id,
    environment: runtime.environment,
    maxAttempts: maxRetries + 1,
    statusCode: lastErrorDetail?.statusCode ?? it_statusFromError(lastError),
    error: it_errorMessage(lastError),
    providerCode: lastErrorDetail?.providerCode,
    providerMessage: lastErrorDetail?.providerMessage,
    requestId: lastErrorDetail?.requestId,
    responsePreview: lastErrorDetail?.responsePreview,
    durationMs: Date.now() - startedAt,
  });
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
    onTrace?: ItTemplateExecutorTrace;
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
    onTrace: options?.onTrace,
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
