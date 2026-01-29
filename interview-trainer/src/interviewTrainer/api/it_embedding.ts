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

function it_buildEmbeddingUrl(cfg: ItEmbeddingConfig): string {
  const base = (cfg.baseUrl || "").replace(/\/$/, "");
  if (cfg.provider === "volc_doubao") {
    return `${base}/api/v3/embeddings`;
  }
  return `${base}/embeddings`;
}

export async function it_callEmbedding(
  cfg: ItEmbeddingConfig,
  inputs: string[],
): Promise<number[][]> {
  if (!inputs.length) {
    return [];
  }
  const url = it_buildEmbeddingUrl(cfg);
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = {
    model: cfg.model,
    input: inputs.length === 1 ? inputs[0] : inputs,
  };

  let lastError: unknown = undefined;
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
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Embedding request failed.");
}
