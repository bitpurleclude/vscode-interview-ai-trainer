import type * as vscode from "vscode";
import type { ItApiTemplate } from "../../../protocol/interviewTrainer";

export const IT_TEMPLATE_VAR_PATTERN = /\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g;
export const IT_TEMPLATE_VAR_FULL = /^\s*\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}\s*$/;

export type ItTemplateRuntimeLike = {
  template: ItApiTemplate;
  environment: string;
  context: vscode.ExtensionContext;
};

export type ItTemplateRenderContext = {
  variables: Record<string, unknown>;
  missing: Set<string>;
};

export function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

export function it_collectTemplateVars(template: ItApiTemplate): string[] {
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

export async function it_injectTemplateSecrets(
  runtime: ItTemplateRuntimeLike,
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

export function it_maskTemplateSecrets(variables: Record<string, unknown>): void {
  if (variables.apiKey !== undefined) {
    variables.apiKey = "***";
  }
  if (variables.secretKey !== undefined) {
    variables.secretKey = "***";
  }
  if (it_isPlainObject(variables.secrets)) {
    const masked: Record<string, unknown> = {
      ...(variables.secrets as Record<string, unknown>),
    };
    Object.keys(masked).forEach((key) => {
      masked[key] = "***";
    });
    variables.secrets = masked;
  }
  if (it_isPlainObject(variables.tokens)) {
    const masked: Record<string, unknown> = {
      ...(variables.tokens as Record<string, unknown>),
    };
    Object.keys(masked).forEach((key) => {
      masked[key] = "***";
    });
    variables.tokens = masked;
  }
}

export function it_resolveVar(
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

export function it_formatTemplateValue(value: unknown): string {
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

export async function it_renderTemplateValue(
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
      const renderedKey =
        typeof key === "string" ? await it_renderTemplateValue(key, ctx) : key;
      rendered[String(renderedKey)] = await it_renderTemplateValue(entry, ctx);
    }
    return rendered;
  }
  return value;
}
