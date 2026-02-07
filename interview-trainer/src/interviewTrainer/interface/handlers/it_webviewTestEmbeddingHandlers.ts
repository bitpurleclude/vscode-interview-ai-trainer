import { it_callEmbedding } from "../../application/services/it_infraBridge";
import type { ItWebviewHandlersHost } from "./it_webviewHandlers";

export function it_registerEmbeddingTestHandler(host: ItWebviewHandlersHost): void {
  host.webviewProtocol.on("it/testEmbedding", async (msg) => {
    const embedForm = msg.data?.embedding || {};
    const provider = embedForm.provider || "volc_doubao";
    const cfg = {
      provider,
      apiKey: embedForm.apiKey || "",
      baseUrl: embedForm.baseUrl || "",
      model: embedForm.model || "",
      timeoutSec: Number(embedForm.timeoutSec ?? 30),
      maxRetries: Number(embedForm.maxRetries ?? 0),
    };
    if (!cfg.apiKey) {
      throw new Error("缺少 Embedding API Key");
    }
    if (!cfg.baseUrl || !cfg.model) {
      throw new Error("请填写 Embedding Base URL 与模型");
    }
    try {
      const vectors = await it_callEmbedding(cfg, ["embedding test"]);
      const length = vectors?.[0]?.length || 0;
      return { ok: true, length };
    } catch (error) {
      host.logEmbeddingTestFailure(error);
      throw error;
    }
  });
}