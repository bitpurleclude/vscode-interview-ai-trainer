import axios from "axios";
import { v4 as uuidv4 } from "uuid";

export type ItVolcAsrMode = "flash" | "standard";

export interface ItVolcAsrConfig {
  appKey: string;
  accessKey: string;
  baseUrl: string;
  resourceId: string;
  modelName: string;
  enablePunc: boolean;
  userId: string;
  mode: ItVolcAsrMode;
  timeoutSec: number;
  maxRetries: number;
  pollIntervalSec: number;
  maxPollSec: number;
}

export interface ItVolcAsrAudioPayload {
  url?: string;
  data?: string;
  format?: string;
  codec?: string;
  rate?: number;
  bits?: number;
  channel?: number;
}

interface ItVolcAsrResponse {
  code?: number | string;
  message?: string;
  status?: string;
  result?: {
    text?: string;
    utterances?: Array<{ text?: string; result?: string }>;
    status?: string;
    id?: string;
  };
  text?: string;
  [key: string]: any;
}

const IT_VOLC_DEFAULT_BASE = "https://openspeech.bytedance.com";
const IT_VOLC_DEFAULT_MODEL = "bigmodel";

function it_normalizeBaseUrl(baseUrl: string): string {
  return (baseUrl || IT_VOLC_DEFAULT_BASE).replace(/\/$/, "");
}

function it_buildHeaders(cfg: ItVolcAsrConfig): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-Api-App-Key": cfg.appKey,
    "X-Api-Access-Key": cfg.accessKey,
    "X-Api-Resource-Id": cfg.resourceId,
    "X-Api-Request-Id": uuidv4(),
    "X-Api-Sequence": "-1",
  };
}

function it_extractVolcText(data: ItVolcAsrResponse | null | undefined): string {
  if (!data) {
    return "";
  }
  const direct = data.result?.text ?? data.text;
  if (typeof direct === "string" && direct.trim()) {
    return direct.trim();
  }
  const utterances = data.result?.utterances;
  if (Array.isArray(utterances) && utterances.length) {
    const parts = utterances
      .map((item) => item.text || item.result || "")
      .map((item) => String(item).trim())
      .filter(Boolean);
    if (parts.length) {
      return parts.join("");
    }
  }
  return "";
}

function it_parseVolcCode(data: ItVolcAsrResponse | null | undefined): number {
  if (!data || data.code === undefined || data.code === null) {
    return 0;
  }
  const num = Number(data.code);
  if (Number.isFinite(num)) {
    return num;
  }
  const raw = String(data.code || "").trim();
  if (!raw) {
    return 0;
  }
  return Number(raw) || 0;
}

function it_parseVolcStatus(data: ItVolcAsrResponse | null | undefined): string {
  const status = data?.status || data?.result?.status;
  return String(status || "").toLowerCase();
}

async function it_postWithRetries(
  url: string,
  payload: unknown,
  cfg: ItVolcAsrConfig,
): Promise<ItVolcAsrResponse> {
  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(url, payload, {
        headers: it_buildHeaders(cfg),
        timeout: Math.max(1, cfg.timeoutSec) * 1000,
      });
      return response.data as ItVolcAsrResponse;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Volcengine ASR request failed.");
}

function it_buildVolcPayload(
  cfg: ItVolcAsrConfig,
  audio: ItVolcAsrAudioPayload,
): Record<string, any> {
  return {
    user: {
      uid: cfg.userId || "it-user",
    },
    audio,
    request: {
      model_name: cfg.modelName || IT_VOLC_DEFAULT_MODEL,
      enable_punc: cfg.enablePunc !== false,
    },
  };
}

export async function it_callVolcAsrFlash(
  cfg: ItVolcAsrConfig,
  audio: ItVolcAsrAudioPayload,
): Promise<string> {
  const base = it_normalizeBaseUrl(cfg.baseUrl);
  const url = `${base}/api/v3/auc/bigmodel/recognize/flash`;
  if (!audio.data && !audio.url) {
    throw new Error("Volcengine ASR flash requires audio data or url.");
  }
  const payload = it_buildVolcPayload(cfg, audio);
  const data = await it_postWithRetries(url, payload, cfg);
  const code = it_parseVolcCode(data);
  if (code !== 0) {
    const error = new Error(
      `Volcengine ASR flash error ${code}: ${data.message || "unknown"}`,
    );
    (error as any).itDebug = {
      response: data,
    };
    throw error;
  }
  return it_extractVolcText(data);
}

export async function it_callVolcAsrStandard(
  cfg: ItVolcAsrConfig,
  audio: ItVolcAsrAudioPayload,
): Promise<string> {
  const base = it_normalizeBaseUrl(cfg.baseUrl);
  const submitUrl = `${base}/api/v3/auc/bigmodel/submit`;
  const queryUrl = `${base}/api/v3/auc/bigmodel/query`;
  if (!audio.url && !audio.data) {
    throw new Error("Volcengine ASR standard requires audio url.");
  }

  const submitPayload = it_buildVolcPayload(cfg, audio);
  const submitResp = await it_postWithRetries(submitUrl, submitPayload, cfg);
  const submitCode = it_parseVolcCode(submitResp);
  if (submitCode !== 0) {
    const error = new Error(
      `Volcengine ASR submit error ${submitCode}: ${submitResp.message || "unknown"}`,
    );
    (error as any).itDebug = {
      response: submitResp,
    };
    throw error;
  }

  const taskId =
    submitResp.id ||
    submitResp.task_id ||
    submitResp.taskId ||
    submitResp.result?.id;
  if (!taskId) {
    throw new Error("Volcengine ASR submit response missing task id.");
  }

  const startedAt = Date.now();
  const pollIntervalMs = Math.max(200, cfg.pollIntervalSec * 1000);
  const maxPollMs = Math.max(1, cfg.maxPollSec) * 1000;

  while (Date.now() - startedAt < maxPollMs) {
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    const queryResp = await it_postWithRetries(queryUrl, { id: taskId }, cfg);
    const queryCode = it_parseVolcCode(queryResp);
    if (queryCode !== 0) {
      const error = new Error(
        `Volcengine ASR query error ${queryCode}: ${queryResp.message || "unknown"}`,
      );
      (error as any).itDebug = {
        response: queryResp,
      };
      throw error;
    }
    const text = it_extractVolcText(queryResp);
    if (text) {
      return text;
    }
    const status = it_parseVolcStatus(queryResp);
    if (["success", "finished", "done", "completed"].includes(status)) {
      return "";
    }
    if (["error", "failed", "fail", "abort"].includes(status)) {
      const error = new Error(
        `Volcengine ASR failed: ${queryResp.message || status || "unknown"}`,
      );
      (error as any).itDebug = {
        response: queryResp,
      };
      throw error;
    }
  }

  throw new Error("Volcengine ASR query timed out.");
}

export async function it_callVolcAsr(
  cfg: ItVolcAsrConfig,
  audio: ItVolcAsrAudioPayload,
): Promise<string> {
  const mode = cfg.mode || "flash";
  if (mode === "standard") {
    return it_callVolcAsrStandard(cfg, audio);
  }
  return it_callVolcAsrFlash(cfg, audio);
}
