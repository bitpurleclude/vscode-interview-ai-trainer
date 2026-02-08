import { it_callEmbedding } from "../services/it_embeddingGateway";

function it_asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function it_errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

function it_traceEmbedding(
  onTrace: ((message: string, detail?: Record<string, unknown>) => void) | undefined,
  action: string,
  status: string,
  detail?: Record<string, unknown>,
): void {
  onTrace?.(`test_embedding ${action} ${status}`, {
    event: `application.test_embedding.${action}`,
    status,
    ...(detail || {}),
  });
}

export async function it_testEmbedding(params: {
  payload: unknown;
  onFailure?: (error: unknown) => void;
  onTrace?: (message: string, detail?: Record<string, unknown>) => void;
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
  const start = Date.now();

  it_traceEmbedding(params.onTrace, "run", "start", {
    provider: cfg.provider,
    hasBaseUrl: Boolean(cfg.baseUrl),
    hasModel: Boolean(cfg.model),
  });

  if (!cfg.apiKey) {
    throw new Error("Missing Embedding API key.");
  }
  if (!cfg.baseUrl || !cfg.model) {
    throw new Error("Embedding baseUrl/model is required.");
  }

  try {
    const vectors = await it_callEmbedding(cfg, ["embedding test"]);
    const length = vectors?.[0]?.length || 0;
    it_traceEmbedding(params.onTrace, "run", "success", {
      provider: cfg.provider,
      length,
      durationMs: Date.now() - start,
    });
    return { ok: true, length };
  } catch (error) {
    params.onFailure?.(error);
    it_traceEmbedding(params.onTrace, "run", "error", {
      provider: cfg.provider,
      error: it_errorMessage(error),
      durationMs: Date.now() - start,
    });
    throw error;
  }
}
