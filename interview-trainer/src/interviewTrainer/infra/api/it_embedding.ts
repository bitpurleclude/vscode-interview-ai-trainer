import axios from "axios";
import type * as vscode from "vscode";
import type { ItApiTemplate } from "../../../protocol/interviewTrainer";
import { it_executeTemplate } from "./it_templateExecutor";

export type ItEmbeddingProvider = "baidu_qianfan" | "volc_doubao" | "openai_compatible" | string;

export interface ItEmbeddingConfig {
  provider: ItEmbeddingProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSec: number;
  maxRetries: number;
  template?: ItApiTemplate;
  templateEnv?: string;
  templateContext?: vscode.ExtensionContext;
  templateVars?: Record<string, unknown>;
  templateMaxRetries?: number;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
}

export interface ItEmbeddingDebugRequest {
  provider: ItEmbeddingProvider;
  url: string;
  method: "POST";
  headers: Record<string, string>;
  payload: unknown;
}

export interface ItEmbeddingDebugError {
  message: string;
  code?: string;
  status?: number;
  response?: unknown;
}

export interface ItEmbeddingDebugInfo {
  request: ItEmbeddingDebugRequest;
  error?: ItEmbeddingDebugError;
}

function it_redactKey(value: string): string {
  if (!value) {
    return "";
  }
  if (value.length <= 8) {
    return `${value.slice(0, 2)}***`;
  }
  return `${value.slice(0, 4)}***${value.slice(-4)}(len=${value.length})`;
}

function it_buildDebugHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${it_redactKey(apiKey)}`,
    "Content-Type": "application/json",
  };
}

function it_extractDebugError(error: unknown): ItEmbeddingDebugError {
  if (axios.isAxiosError(error)) {
    return {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      response: error.response?.data,
    };
  }
  if (error instanceof Error) {
    return { message: error.message };
  }
  return { message: String(error) };
}

function it_parseEmbeddingResponse(
  responseData: any,
  expectedCount: number,
): number[][] {
  const data = responseData?.data;
  if (Array.isArray(data)) {
    const vectors = data
      .map((item: any) => item?.embedding)
      .filter((item: unknown) => Array.isArray(item)) as number[][];
    if (vectors.length) {
      return vectors;
    }
  }
  const single =
    (data && Array.isArray(data.embedding) ? data.embedding : null) ??
    (Array.isArray(responseData?.embedding) ? responseData.embedding : null);
  if (Array.isArray(single)) {
    if (expectedCount > 1) {
      throw new Error(
        "Embedding response contains a single vector for multiple inputs.",
      );
    }
    return [single as number[]];
  }
  return [];
}

function it_buildEmbeddingUrl(cfg: ItEmbeddingConfig, useMultimodal: boolean): string {
  const base = (cfg.baseUrl || "").trim().replace(/\/$/, "");
  const lower = base.toLowerCase();
  if (cfg.provider === "volc_doubao") {
    if (
      lower.includes("/api/v3/embeddings/multimodal") ||
      lower.endsWith("/embeddings/multimodal")
    ) {
      return base;
    }
    if (lower.endsWith("/api/v3/embeddings") || lower.endsWith("/embeddings")) {
      return useMultimodal ? `${base}/multimodal` : base;
    }
    return useMultimodal
      ? `${base}/api/v3/embeddings/multimodal`
      : `${base}/api/v3/embeddings`;
  }
  if (lower.endsWith("/embeddings")) {
    return base;
  }
  return `${base}/embeddings`;
}

function it_isDoubaoMultimodalModel(cfg: ItEmbeddingConfig): boolean {
  if (cfg.provider !== "volc_doubao") {
    return false;
  }
  const model = String(cfg.model || "").toLowerCase();
  return model.includes("vision") || model.includes("multimodal");
}


function it_traceEmbedding(
  cfg: ItEmbeddingConfig,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  cfg.onTrace?.(`embedding ${action} ${status}`, {
    event: `infra.embedding.${action}`,
    status,
    provider: cfg.provider,
    model: cfg.model,
    ...(detail || {}),
  });
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

async function it_callDoubaoMultimodal(
  cfg: ItEmbeddingConfig,
  inputs: string[],
): Promise<number[][]> {
  const url = it_buildEmbeddingUrl(cfg, true);
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const debugHeaders = it_buildDebugHeaders(cfg.apiKey);
  const results: number[][] = [];
  for (const text of inputs) {
    const payload = {
      model: cfg.model,
      input: [
        {
          type: "text",
          text,
        },
      ],
    };
    let lastError: unknown = undefined;
    let lastDebug: ItEmbeddingDebugInfo | undefined;
    for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
      try {
        const response = await axios.post(url, payload, {
          headers,
          timeout: cfg.timeoutSec * 1000,
        });
        const vectors = it_parseEmbeddingResponse(response.data, 1);
        if (!vectors.length) {
          const error = new Error("Embedding response missing data");
          (error as Error & { itDebug?: ItEmbeddingDebugInfo }).itDebug = {
            request: {
              provider: cfg.provider,
              url,
              method: "POST",
              headers: debugHeaders,
              payload,
            },
            error: {
              message: error.message,
              status: response.status,
              response: response.data,
            },
          };
          throw error;
        }
        results.push(vectors[0]);
        lastError = undefined;
        lastDebug = undefined;
        break;
      } catch (err) {
        lastError = err;
        const debug = (err as { itDebug?: ItEmbeddingDebugInfo })?.itDebug;
        lastDebug =
          debug ??
          {
            request: {
              provider: cfg.provider,
              url,
              method: "POST",
              headers: debugHeaders,
              payload,
            },
            error: it_extractDebugError(err),
          };
      }
    }
    if (lastError) {
      const error =
        lastError instanceof Error
          ? lastError
          : new Error("Embedding request failed.");
      if (lastDebug) {
        (error as Error & { itDebug?: ItEmbeddingDebugInfo }).itDebug = lastDebug;
      }
      throw error;
    }
  }
  return results;
}

export async function it_callEmbedding(
  cfg: ItEmbeddingConfig,
  inputs: string[],
): Promise<number[][]> {
  if (!inputs.length) {
    return [];
  }

  const startedAt = Date.now();
  const viaTemplate = Boolean(cfg.template && cfg.templateContext && cfg.templateEnv);
  const useMultimodal = it_isDoubaoMultimodalModel(cfg);
  it_traceEmbedding(cfg, "request", "start", {
    inputCount: inputs.length,
    timeoutSec: cfg.timeoutSec,
    maxRetries: cfg.maxRetries,
    viaTemplate,
    useMultimodal,
  });

  try {
    let vectors: number[][] = [];

    if (viaTemplate) {
      const template = cfg.template as ItApiTemplate;
      const templateContext = cfg.templateContext as vscode.ExtensionContext;
      const templateEnv = cfg.templateEnv || "prod";
      const embeddingInput = inputs.length === 1 ? inputs[0] : inputs;
      const embeddingInputs = inputs.map((text) => ({
        type: "text",
        text,
      }));
      const result = await it_executeTemplate({
        runtime: {
          template,
          environment: templateEnv,
          context: templateContext,
        },
        variables: {
          embeddingInput,
          embeddingInputs,
          model: cfg.model,
          ...(cfg.templateVars || {}),
        },
        maxRetries: cfg.templateMaxRetries ?? cfg.maxRetries,
        timeoutSec: cfg.timeoutSec,
        stream: false,
      });
      const value = result.value ?? result.raw;
      if (Array.isArray(value)) {
        if (value.length && Array.isArray(value[0])) {
          vectors = value as number[][];
        } else if (value.length && value.every((item) => typeof item === "number")) {
          vectors = [value as number[]];
        }
      }
      if (!vectors.length) {
        vectors = it_parseEmbeddingResponse(result.raw, inputs.length);
      }
      if (!vectors.length) {
        throw new Error("Embedding response missing data");
      }
    } else if (useMultimodal) {
      vectors = await it_callDoubaoMultimodal(cfg, inputs);
    } else {
      const url = it_buildEmbeddingUrl(cfg, false);
      const headers = {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      };
      const debugHeaders = it_buildDebugHeaders(cfg.apiKey);
      const payload = {
        model: cfg.model,
        input: inputs.length === 1 ? inputs[0] : inputs,
      };

      let lastError: unknown = undefined;
      let lastDebug: ItEmbeddingDebugInfo | undefined;
      for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
        try {
          const response = await axios.post(url, payload, {
            headers,
            timeout: cfg.timeoutSec * 1000,
          });
          vectors = it_parseEmbeddingResponse(response.data, inputs.length);
          if (!vectors.length) {
            const error = new Error("Embedding response missing data");
            (error as Error & { itDebug?: ItEmbeddingDebugInfo }).itDebug = {
              request: {
                provider: cfg.provider,
                url,
                method: "POST",
                headers: debugHeaders,
                payload,
              },
              error: {
                message: error.message,
                status: response.status,
                response: response.data,
              },
            };
            throw error;
          }
          lastError = undefined;
          lastDebug = undefined;
          break;
        } catch (err) {
          lastError = err;
          const debug = (err as { itDebug?: ItEmbeddingDebugInfo })?.itDebug;
          lastDebug =
            debug ??
            {
              request: {
                provider: cfg.provider,
                url,
                method: "POST",
                headers: debugHeaders,
                payload,
              },
              error: it_extractDebugError(err),
            };
        }
      }
      if (lastError || !vectors.length) {
        const error =
          lastError instanceof Error ? lastError : new Error("Embedding request failed.");
        if (lastDebug) {
          (error as Error & { itDebug?: ItEmbeddingDebugInfo }).itDebug = lastDebug;
        }
        throw error;
      }
    }

    it_traceEmbedding(cfg, "request", "success", {
      inputCount: inputs.length,
      vectorCount: vectors.length,
      dimension: vectors[0]?.length || 0,
      durationMs: Date.now() - startedAt,
    });
    return vectors;
  } catch (error) {
    it_traceEmbedding(cfg, "request", "error", {
      inputCount: inputs.length,
      durationMs: Date.now() - startedAt,
      error: it_errorMessage(error),
    });
    throw error;
  }
}
