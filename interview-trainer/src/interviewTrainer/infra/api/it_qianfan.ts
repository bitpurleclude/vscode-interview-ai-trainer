import axios from "axios";

export interface ItQianfanConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  timeoutSec: number;
  maxRetries: number;
}

export interface ItQianfanMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export async function it_callQianfanChat(
  cfg: ItQianfanConfig,
  messages: ItQianfanMessage[],
): Promise<string> {
  const url = `${cfg.baseUrl.replace(/\/$/, "")}/chat/completions`;
  const headers = {
    Authorization: `Bearer ${cfg.apiKey}`,
    "Content-Type": "application/json",
  };
  const payload = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    top_p: cfg.topP,
    extra_body: {
      penalty_score: 1,
      stop: [],
      web_search: {
        enable: false,
        enable_trace: false,
      },
    },
  };

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
      });
      const text =
        response.data?.choices?.[0]?.message?.content ??
        response.data?.choices?.[0]?.text ??
        "";
      return String(text || "");
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Qianfan chat request failed.");
}
