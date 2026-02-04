import axios from "axios";
import type * as vscode from "vscode";
import type {
  ItApiTemplate,
  ItTemplateCategory,
  ItTemplateResponse,
  ItTemplateStreaming,
} from "../../protocol/interviewTrainer";
import type { ItTemplatesConfig } from "./it_apiConfig";
import type { ItLlmMessage } from "./it_llmTypes";

const IT_TEMPLATE_VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
const IT_TEMPLATE_VAR_FULL = /^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/;

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

type ItTemplateRenderContext = {
  variables: Record<string, unknown>;
  missing: Set<string>;
};

type ItPathToken = string | number | "*";

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

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_collectTemplateVars(template: ItApiTemplate): string[] {
  const raw = JSON.stringify({
    request: template.request,
    response: template.response,
    streaming: template.streaming,
  });
  const matches = raw.matchAll(IT_TEMPLATE_VAR_PATTERN);
  const vars = new Set<string>();
  for (const match of matches) {
    if (match[1]) {
      vars.add(match[1]);
    }
  }
  return Array.from(vars);
}

async function it_injectTemplateSecrets(
  runtime: ItTemplateRuntime,
  variables: Record<string, unknown>,
): Promise<void> {
  if (variables.apiKey === undefined) {
    variables.apiKey = await runtime.context.secrets.get(
      `interviewTrainer.${runtime.environment}.template.${runtime.template.id}.apiKey`,
    );
  }
  if (variables.secretKey === undefined) {
    variables.secretKey = await runtime.context.secrets.get(
      `interviewTrainer.${runtime.environment}.template.${runtime.template.id}.secretKey`,
    );
  }
  const secrets = it_isPlainObject(variables.secrets)
    ? { ...(variables.secrets as Record<string, unknown>) }
    : {};
  const secretNames = it_collectTemplateVars(runtime.template)
    .filter((item) => item.startsWith("secrets."))
    .map((item) => item.slice("secrets.".length))
    .filter(Boolean);
  for (const name of secretNames) {
    if (secrets[name] !== undefined) {
      continue;
    }
    secrets[name] = await runtime.context.secrets.get(
      `interviewTrainer.${runtime.environment}.secret.${name}`,
    );
  }
  if (secretNames.length) {
    variables.secrets = secrets;
  }

  const tokens = it_isPlainObject(variables.tokens)
    ? { ...(variables.tokens as Record<string, unknown>) }
    : {};
  const tokenNames = it_collectTemplateVars(runtime.template)
    .filter((item) => item.startsWith("tokens."))
    .map((item) => item.slice("tokens.".length))
    .filter(Boolean);
  for (const name of tokenNames) {
    if (tokens[name] !== undefined) {
      continue;
    }
    tokens[name] = await runtime.context.secrets.get(
      `interviewTrainer.${runtime.environment}.token.${name}`,
    );
  }
  if (tokenNames.length) {
    variables.tokens = tokens;
  }
}

function it_maskTemplateSecrets(variables: Record<string, unknown>): void {
  if (variables.apiKey !== undefined) {
    variables.apiKey = "***";
  }
  if (variables.secretKey !== undefined) {
    variables.secretKey = "***";
  }
  if (it_isPlainObject(variables.secrets)) {
    const masked: Record<string, unknown> = { ...(variables.secrets as Record<string, unknown>) };
    Object.keys(masked).forEach((key) => {
      masked[key] = "***";
    });
    variables.secrets = masked;
  }
  if (it_isPlainObject(variables.tokens)) {
    const masked: Record<string, unknown> = { ...(variables.tokens as Record<string, unknown>) };
    Object.keys(masked).forEach((key) => {
      masked[key] = "***";
    });
    variables.tokens = masked;
  }
}

function it_parsePath(path: string): ItPathToken[] {
  let raw = String(path || "").trim();
  if (!raw) {
    return [];
  }
  if (raw.startsWith("$.")) {
    raw = raw.slice(2);
  } else if (raw.startsWith("$")) {
    raw = raw.slice(1);
  }
  if (raw.startsWith(".")) {
    raw = raw.slice(1);
  }
  const tokens: ItPathToken[] = [];
  let buffer = "";
  let i = 0;
  const flushBuffer = () => {
    if (buffer) {
      tokens.push(buffer);
      buffer = "";
    }
  };
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === ".") {
      flushBuffer();
      i += 1;
      continue;
    }
    if (ch === "[") {
      flushBuffer();
      const end = raw.indexOf("]", i);
      if (end === -1) {
        break;
      }
      const content = raw.slice(i + 1, end).trim();
      if (content === "*") {
        tokens.push("*");
      } else if (content) {
        const num = Number(content);
        tokens.push(Number.isFinite(num) ? num : content.replace(/^['"]|['"]$/g, ""));
      }
      i = end + 1;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flushBuffer();
  return tokens;
}

export function it_readPath(obj: any, path: string | undefined): any {
  if (!path) {
    return undefined;
  }
  const tokens = it_parsePath(path);
  if (!tokens.length) {
    return undefined;
  }
  const walk = (current: any, index: number): any => {
    if (index >= tokens.length) {
      return current;
    }
    const token = tokens[index];
    if (token === "*") {
      if (!Array.isArray(current)) {
        return undefined;
      }
      const next = current
        .map((item) => walk(item, index + 1))
        .filter((item) => item !== undefined);
      return next;
    }
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof token === "number") {
      if (!Array.isArray(current) || token < 0 || token >= current.length) {
        return undefined;
      }
      return walk(current[token], index + 1);
    }
    return walk(current[token], index + 1);
  };
  return walk(obj, 0);
}

function it_resolveVar(
  path: string,
  variables: Record<string, unknown>,
): { found: boolean; value: any } {
  if (Object.prototype.hasOwnProperty.call(variables, path)) {
    return { found: true, value: (variables as Record<string, unknown>)[path] };
  }
  const parts = path.split(".");
  let current: any = variables;
  for (const part of parts) {
    if (!it_isPlainObject(current) || !(part in current)) {
      return { found: false, value: undefined };
    }
    current = (current as Record<string, unknown>)[part];
  }
  return { found: true, value: current };
}

function it_formatTemplateValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function it_renderTemplateValue(
  value: any,
  ctx: ItTemplateRenderContext,
): Promise<any> {
  if (typeof value === "string") {
    const match = value.match(IT_TEMPLATE_VAR_FULL);
    if (match && match[1]) {
      const resolved = it_resolveVar(match[1], ctx.variables);
      if (!resolved.found || resolved.value === undefined) {
        ctx.missing.add(match[1]);
        return undefined;
      }
      return resolved.value;
    }
    return value.replace(IT_TEMPLATE_VAR_PATTERN, (_raw, name) => {
      const resolved = it_resolveVar(name, ctx.variables);
      if (!resolved.found || resolved.value === undefined) {
        ctx.missing.add(name);
        return "";
      }
      return it_formatTemplateValue(resolved.value);
    });
  }
  if (Array.isArray(value)) {
    const rendered = [];
    for (const item of value) {
      rendered.push(await it_renderTemplateValue(item, ctx));
    }
    return rendered;
  }
  if (it_isPlainObject(value)) {
    const rendered: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      const renderedKey = typeof key === "string"
        ? (await it_renderTemplateValue(key, ctx))
        : key;
      rendered[String(renderedKey)] = await it_renderTemplateValue(entry, ctx);
    }
    return rendered;
  }
  return value;
}

function it_buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) {
          return;
        }
        params.append(key, it_formatTemplateValue(item));
      });
      return;
    }
    params.append(key, it_formatTemplateValue(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

function it_appendQuery(url: string, query: Record<string, unknown>): string {
  if (!query || !Object.keys(query).length) {
    return url;
  }
  try {
    const base = new URL(url);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null) {
            return;
          }
          base.searchParams.append(key, it_formatTemplateValue(item));
        });
        return;
      }
      base.searchParams.append(key, it_formatTemplateValue(value));
    });
    return base.toString();
  } catch {
    const suffix = it_buildQueryString(query);
    if (!suffix) {
      return url;
    }
    return url.includes("?") ? `${url}&${suffix.slice(1)}` : `${url}${suffix}`;
  }
}

function it_extractResponseValue(data: any, response?: ItTemplateResponse): any {
  const path = response?.jsonPath || response?.textPath;
  const fromPath = path ? it_readPath(data, path) : undefined;
  if (fromPath !== undefined) {
    return fromPath;
  }
  const direct = data?.output_text ?? data?.outputText ?? data?.text;
  if (direct !== undefined) {
    return direct;
  }
  const outputs = Array.isArray(data?.output) ? data.output : [];
  if (outputs.length) {
    const chunks: string[] = [];
    outputs.forEach((item: any) => {
      if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
      const content = Array.isArray(item?.content) ? item.content : [];
      content.forEach((part: any) => {
        if (part?.text) {
          chunks.push(String(part.text));
        }
      });
    });
    if (chunks.length) {
      return chunks.join("");
    }
  }
  const chatLike =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    data?.choices?.[0]?.text ??
    undefined;
  return chatLike;
}

function it_extractStreamDelta(
  payload: any,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
): string {
  const path = streaming?.deltaPath || response?.textPath || response?.jsonPath;
  if (path) {
    const value = it_readPath(payload, path);
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => (typeof item === "string" ? item : it_formatTemplateValue(item)))
        .join("");
      return joined;
    }
    if (typeof value === "string") {
      return value;
    }
    if (value !== undefined && value !== null) {
      return it_formatTemplateValue(value);
    }
  }
  const delta =
    payload?.delta ??
    payload?.output_text?.delta ??
    payload?.choices?.[0]?.delta?.content ??
    payload?.choices?.[0]?.message?.content ??
    payload?.choices?.[0]?.text ??
    payload?.output_text ??
    payload?.text ??
    "";
  return typeof delta === "string" ? delta : "";
}

async function it_consumeTemplateSse(
  stream: NodeJS.ReadableStream,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
  onDelta?: (delta: string, full: string) => void,
  abortSignal?: { aborted: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";
    const delimiter = streaming?.eventDelimiter || "\n\n";
    const dataPrefix = streaming?.dataPrefix || "data:";
    const doneSignals = new Set<string>([
      ...(streaming?.doneSignals || []),
      ...(response?.doneSignal ? [response.doneSignal] : []),
      "[DONE]",
    ]);
    const heartbeat =
      streaming?.heartbeatPattern ? new RegExp(streaming.heartbeatPattern) : null;
    const flush = (delta: string) => {
      if (!delta) {
        return;
      }
      fullText += delta;
      onDelta?.(delta, fullText);
    };
    const handleEvent = (chunk: string) => {
      if (abortSignal?.aborted) {
        reject(new Error("stream aborted"));
        return true;
      }
      const lines = chunk.split(/\r?\n/);
      const dataLines = lines
        .map((line) => line.trim())
        .filter((line) => line && line.startsWith(dataPrefix));
      if (!dataLines.length) {
        return false;
      }
      const data = dataLines
        .map((line) => line.slice(dataPrefix.length).trim())
        .join("\n");
      if (!data) {
        return false;
      }
      if (doneSignals.has(data)) {
        resolve(fullText);
        return true;
      }
      if (heartbeat && heartbeat.test(data)) {
        return false;
      }
      let payload: any = data;
      if ((data.startsWith("{") && data.endsWith("}")) || (data.startsWith("[") && data.endsWith("]"))) {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = data;
        }
      }
      const delta = it_extractStreamDelta(payload, streaming, response);
      flush(delta);
      return false;
    };
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      let idx = buffer.indexOf(delimiter);
      while (idx !== -1) {
        const piece = buffer.slice(0, idx);
        buffer = buffer.slice(idx + delimiter.length);
        if (handleEvent(piece)) {
          return;
        }
        idx = buffer.indexOf(delimiter);
      }
    });
    stream.on("end", () => {
      if (buffer.trim()) {
        handleEvent(buffer);
      }
      resolve(fullText);
    });
    stream.on("error", (err) => reject(err));
  });
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

function it_splitResponsesMessages(messages: ItLlmMessage[]): {
  instructions?: string;
  input: any[];
} {
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
    instructions: joined || undefined,
    input,
  };
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
