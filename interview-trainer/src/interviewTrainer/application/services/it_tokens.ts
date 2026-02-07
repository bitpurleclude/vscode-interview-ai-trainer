import type * as vscode from "vscode";
import type {
  ItApiTemplate,
  ItConfigSnapshot,
  ItTokenState,
  ItTokenStoreSnapshot,
} from "../../../protocol/interviewTrainer";
import type { ItApiConfig, ItConfigBundle } from "../../infra/api/it_apiConfig";
import { it_executeTemplate, it_readPath } from "../../infra/api/it_templateExecutor";
import type { ItWebviewPort } from "./it_webviewPort";

type ItTokenServiceHost = {
  context: vscode.ExtensionContext;
  webviewProtocol: ItWebviewPort;
  configBundle: ItConfigBundle;
  configSnapshot: ItConfigSnapshot;
  buildConfigSnapshot: (apiConfig: ItApiConfig) => ItConfigSnapshot;
};

type ItTokenTemplateMeta = {
  name: string;
  template: ItApiTemplate;
};

type ItTokenParsed = {
  value?: string;
  expiresAt?: string;
  expiresInSec?: number;
  rawExpiresAt?: unknown;
  rawExpiresIn?: unknown;
};

const TOKEN_STATUS_IDLE: ItTokenState["status"] = "idle";
const TOKEN_STATUS_REFRESHING: ItTokenState["status"] = "refreshing";
const TOKEN_STATUS_OK: ItTokenState["status"] = "ok";
const TOKEN_STATUS_ERROR: ItTokenState["status"] = "error";

const DEFAULT_REFRESH_BEFORE_SEC = 300;
const DEFAULT_ERROR_RETRY_SEC = 60;
const MAX_TIMER_DELAY_MS = 2_147_483_647;

function it_isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function it_normalizeTokenName(raw: string): string {
  return String(raw || "").trim();
}

function it_parseEpoch(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      return numeric > 1e12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(trimmed);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return undefined;
}

export function it_extractTokenInfo(
  template: ItApiTemplate,
  result: { raw: any; value?: any; text?: string },
  nowMs = Date.now(),
): ItTokenParsed {
  const tokenCfg = template.token;
  const raw = result.raw ?? result.value ?? result.text;
  let tokenValue: unknown;
  if (tokenCfg?.valuePath && raw !== undefined) {
    tokenValue = it_readPath(raw, tokenCfg.valuePath);
  } else if (typeof result.value === "string") {
    tokenValue = result.value;
  } else if (typeof result.text === "string") {
    tokenValue = result.text;
  } else {
    tokenValue = raw;
  }
  const value =
    tokenValue === undefined || tokenValue === null ? undefined : String(tokenValue);

  let expiresAtMs: number | undefined;
  let expiresInSec: number | undefined;
  let rawExpiresAt: unknown;
  let rawExpiresIn: unknown;
  if (tokenCfg?.expiresAtPath && raw !== undefined) {
    rawExpiresAt = it_readPath(raw, tokenCfg.expiresAtPath);
    expiresAtMs = it_parseEpoch(rawExpiresAt);
  }
  if (!expiresAtMs && tokenCfg?.expiresInPath && raw !== undefined) {
    rawExpiresIn = it_readPath(raw, tokenCfg.expiresInPath);
    const sec = Number(rawExpiresIn);
    if (Number.isFinite(sec) && sec > 0) {
      expiresInSec = sec;
      expiresAtMs = nowMs + sec * 1000;
    }
  }
  return {
    value,
    expiresAt: expiresAtMs ? new Date(expiresAtMs).toISOString() : undefined,
    expiresInSec,
    rawExpiresAt,
    rawExpiresIn,
  };
}

export class ItTokenService {
  private host: ItTokenServiceHost;
  private states = new Map<string, ItTokenState>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private inFlight = new Set<string>();
  private autoRefreshByEnv = new Map<string, boolean>();

  constructor(host: ItTokenServiceHost) {
    this.host = host;
  }

  public getSnapshot(env: string): ItTokenStoreSnapshot {
    const tokenTemplates = this.getTokenTemplates(env);
    const tokens = tokenTemplates.map((item) => {
      const key = this.buildKey(env, item.name);
      const state = this.states.get(key);
      return {
        name: item.name,
        templateId: item.template.id,
        status: state?.status ?? TOKEN_STATUS_IDLE,
        updatedAt: state?.updatedAt,
        expiresAt: state?.expiresAt,
        lastError: state?.lastError,
      };
    });
    return {
      tokens,
      autoRefresh: this.autoRefreshByEnv.get(env) !== false,
    };
  }

  public sync(): void {
    const env = this.host.configBundle.api?.active?.environment || "prod";
    const templateEnv = this.host.configBundle.templates?.environments?.[env] || {};
    const autoRefresh = templateEnv.token_options?.auto_refresh !== false;
    this.autoRefreshByEnv.set(env, autoRefresh);
    const tokenTemplates = this.getTokenTemplates(env);
    const activeKeys = new Set(tokenTemplates.map((item) => this.buildKey(env, item.name)));
    Array.from(this.states.keys()).forEach((key) => {
      if (!activeKeys.has(key)) {
        this.states.delete(key);
        this.clearTimer(key);
      }
    });
    tokenTemplates.forEach((item) => {
      const key = this.buildKey(env, item.name);
      if (!this.states.has(key)) {
        this.states.set(key, {
          name: item.name,
          templateId: item.template.id,
          status: TOKEN_STATUS_IDLE,
        });
      } else {
        const state = this.states.get(key);
        if (state && state.templateId !== item.template.id) {
          this.states.set(key, { ...state, templateId: item.template.id });
        }
      }
      if (autoRefresh && item.template.token?.enabled !== false) {
        this.scheduleRefresh(env, item);
      } else {
        this.clearTimer(key);
      }
    });
  }

  public async refreshAll(env?: string): Promise<void> {
    const targetEnv = env || this.host.configBundle.api?.active?.environment || "prod";
    const tokenTemplates = this.getTokenTemplates(targetEnv);
    for (const item of tokenTemplates) {
      await this.refreshToken(targetEnv, item);
    }
  }

  public async refreshTokenByName(name: string, env?: string): Promise<void> {
    const targetEnv = env || this.host.configBundle.api?.active?.environment || "prod";
    const tokenName = it_normalizeTokenName(name);
    if (!tokenName) {
      return;
    }
    const tokenTemplates = this.getTokenTemplates(targetEnv);
    const target = tokenTemplates.find((item) => item.name === tokenName);
    if (target) {
      await this.refreshToken(targetEnv, target);
    }
  }

  private getTokenTemplates(env: string): ItTokenTemplateMeta[] {
    const templateEnv = this.host.configBundle.templates?.environments?.[env] || {};
    const templates = templateEnv.templates || {};
    return Object.keys(templates)
      .map((id) => {
        const template = templates[id] as ItApiTemplate;
        return {
          template: {
            ...template,
            id: template.id || id,
          },
          name: it_normalizeTokenName(template.token?.name || ""),
        };
      })
      .filter((item) => item.template.category === "token" && item.name);
  }

  private buildKey(env: string, name: string): string {
    return `${env}::${name}`;
  }

  private clearTimer(key: string): void {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  private scheduleRefresh(env: string, item: ItTokenTemplateMeta): void {
    const key = this.buildKey(env, item.name);
    this.clearTimer(key);
    const state = this.states.get(key);
    let delayMs = 5000;
    if (!state?.expiresAt) {
      if (state?.status === TOKEN_STATUS_OK) {
        return;
      }
      delayMs =
        state?.status === TOKEN_STATUS_ERROR
          ? DEFAULT_ERROR_RETRY_SEC * 1000
          : delayMs;
    } else {
      const expiresAtMs = Date.parse(state.expiresAt);
      if (!Number.isNaN(expiresAtMs)) {
        const nowMs = Date.now();
        const remainingSec = Math.max(0, Math.floor((expiresAtMs - nowMs) / 1000));
        let refreshBeforeSec = Number(
          item.template.token?.refreshBeforeSec ?? DEFAULT_REFRESH_BEFORE_SEC,
        );
        if (!Number.isFinite(refreshBeforeSec) || refreshBeforeSec < 0) {
          refreshBeforeSec = DEFAULT_REFRESH_BEFORE_SEC;
        }
        if (remainingSec > 0 && refreshBeforeSec >= remainingSec) {
          refreshBeforeSec = Math.max(0, remainingSec - 1);
        }
        const refreshAt = expiresAtMs - refreshBeforeSec * 1000;
        delayMs = Math.max(1000, refreshAt - nowMs);
      }
    }
    const shouldRecalculate = delayMs > MAX_TIMER_DELAY_MS;
    const timer = setTimeout(() => {
      if (shouldRecalculate) {
        this.scheduleRefresh(env, item);
      } else {
        void this.refreshToken(env, item);
      }
    }, Math.min(delayMs, MAX_TIMER_DELAY_MS));
    this.timers.set(key, timer);
  }

  private async refreshToken(env: string, item: ItTokenTemplateMeta): Promise<void> {
    const key = this.buildKey(env, item.name);
    if (this.inFlight.has(key)) {
      return;
    }
    this.inFlight.add(key);
    const tokenCfg = (item.template.token || {}) as NonNullable<ItApiTemplate["token"]>;
    const nextState: ItTokenState = {
      name: item.name,
      templateId: item.template.id,
      status: TOKEN_STATUS_REFRESHING,
      updatedAt: new Date().toISOString(),
    };
    this.states.set(key, { ...(this.states.get(key) || nextState), ...nextState });
    this.notifyUpdate();
    try {
      const runtime = {
        template: item.template,
        environment: env,
        context: this.host.context,
      };
      const result = await it_executeTemplate({
        runtime,
        maxRetries: Number(tokenCfg.maxRetries ?? 0),
        stream: false,
      });
      const parsed = it_extractTokenInfo(item.template, result);
      if (!parsed.value) {
        throw new Error("Token 模板未解析到 token 值");
      }
      await this.host.context.secrets.store(
        `interviewTrainer.${env}.token.${item.name}`,
        parsed.value,
      );
      const okState: ItTokenState = {
        name: item.name,
        templateId: item.template.id,
        status: TOKEN_STATUS_OK,
        updatedAt: new Date().toISOString(),
        expiresAt: parsed.expiresAt,
      };
      this.states.set(key, okState);
      this.notifyUpdate();
      if (this.autoRefreshByEnv.get(env) !== false && tokenCfg.enabled !== false) {
        this.scheduleRefresh(env, item);
      } else {
        this.clearTimer(key);
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const errorState: ItTokenState = {
        name: item.name,
        templateId: item.template.id,
        status: TOKEN_STATUS_ERROR,
        updatedAt: new Date().toISOString(),
        lastError: errorMessage,
      };
      this.states.set(key, errorState);
      this.notifyUpdate();
      if (this.autoRefreshByEnv.get(env) !== false && tokenCfg.enabled !== false) {
        this.scheduleRefresh(env, item);
      }
    } finally {
      this.inFlight.delete(key);
    }
  }

  private notifyUpdate(): void {
    const apiConfig = this.host.configBundle.api;
    this.host.configSnapshot = this.host.buildConfigSnapshot(apiConfig);
    this.host.webviewProtocol.send("it/configUpdate", this.host.configSnapshot);
  }
}
