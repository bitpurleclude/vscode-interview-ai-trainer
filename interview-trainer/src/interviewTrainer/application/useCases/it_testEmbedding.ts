import { it_callEmbedding } from "../services/it_embeddingGateway";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export async function it_testEmbedding(params: {
  payload: unknown;
  onFailure?: (error: unknown) => void;
}): Promise<{ ok: true; length: number }> {
  const payload = it_asRecord(params.payload);
  const embedForm = it_asRecord(payload.embedding);
  const provider = String(embedForm.provider || "volc_doubao");
  const cfg = {
    provider,
    apiKey: String(embedForm.apiKey || ""),
    baseUrl: String(embedForm.baseUrl || ""),
    model: String(embedForm.model || ""),
    timeoutSec: Number(embedForm.timeoutSec ?? 30),
    maxRetries: Number(embedForm.maxRetries ?? 0),
  };

  if (!cfg.apiKey) {
    throw new Error("Missing Embedding API key.");
  }
  if (!cfg.baseUrl || !cfg.model) {
    throw new Error("Embedding baseUrl/model is required.");
  }

  try {
    const vectors = await it_callEmbedding(cfg, ["embedding test"]);
    const length = vectors?.[0]?.length || 0;
    return { ok: true, length };
  } catch (error) {
    params.onFailure?.(error);
    throw error;
  }
}
