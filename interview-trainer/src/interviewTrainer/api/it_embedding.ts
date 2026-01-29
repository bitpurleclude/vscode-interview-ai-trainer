import axios from "axios";

export type ItEmbeddingProvider = "baidu_qianfan" | "volc_doubao" | "openai_compatible" | string;

export interface ItEmbeddingConfig {
  provider: ItEmbeddingProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutSec: number;
  maxRetries: number;
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
        const embedding = response.data?.data?.[0]?.embedding;
        if (!Array.isArray(embedding)) {
          throw new Error("Embedding response missing data");
        }
        results.push(embedding as number[]);
        lastError = undefined;
        lastDebug = undefined;
        break;
      } catch (err) {
        lastError = err;
        lastDebug = {
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
  if (it_isDoubaoMultimodalModel(cfg)) {
    return it_callDoubaoMultimodal(cfg, inputs);
  }
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
      const data = response.data?.data;
      if (!Array.isArray(data)) {
        throw new Error("Embedding response missing data");
      }
      const vectors = data.map((item: any) => item?.embedding).filter(Boolean);
      return vectors as number[][];
    } catch (err) {
      lastError = err;
      lastDebug = {
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
  const error =
    lastError instanceof Error ? lastError : new Error("Embedding request failed.");
  if (lastDebug) {
    (error as Error & { itDebug?: ItEmbeddingDebugInfo }).itDebug = lastDebug;
  }
  throw error;
}
