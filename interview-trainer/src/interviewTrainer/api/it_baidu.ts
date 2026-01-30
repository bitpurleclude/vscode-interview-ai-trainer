import axios from "axios";

export interface ItBaiduToken {
  accessToken: string;
  expiresAt: number;
}

export interface ItBaiduAsrConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
  devPid: number;
  language: string;
  timeoutSec: number;
  maxRetries: number;
}

export interface ItBaiduAsrRequest {
  format: "pcm" | "wav" | "m4a";
  rate: number;
  channel: number;
  cuid: string;
  speech: string;
  len: number;
}

const tokenCache = new Map<string, ItBaiduToken>();

function it_tokenCacheKey(apiKey: string, secretKey: string): string {
  return `${apiKey}::${secretKey}`;
}

async function it_fetchBaiduToken(
  apiKey: string,
  secretKey: string,
): Promise<ItBaiduToken> {
  const url = "https://aip.baidubce.com/oauth/2.0/token";
  const params = {
    grant_type: "client_credentials",
    client_id: apiKey,
    client_secret: secretKey,
  };
  const response = await axios.post(url, undefined, { params });
  const accessToken = response.data?.access_token;
  const expiresIn = Number(response.data?.expires_in || 0);
  if (!accessToken) {
    throw new Error("Baidu ASR token response missing access_token.");
  }
  return {
    accessToken,
    expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
  };
}

export async function it_getBaiduAccessToken(
  apiKey: string,
  secretKey: string,
): Promise<string> {
  const key = it_tokenCacheKey(apiKey, secretKey);
  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  const token = await it_fetchBaiduToken(apiKey, secretKey);
  tokenCache.set(key, token);
  return token.accessToken;
}

export async function it_callBaiduAsr(
  cfg: ItBaiduAsrConfig,
  req: ItBaiduAsrRequest,
): Promise<string> {
  const token = await it_getBaiduAccessToken(cfg.apiKey, cfg.secretKey);
  const payload = {
    format: req.format,
    rate: req.rate,
    channel: req.channel,
    cuid: req.cuid,
    dev_pid: cfg.devPid,
    speech: req.speech,
    len: req.len,
    token,
  };
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  let lastError: unknown = undefined;
  for (let attempt = 0; attempt <= cfg.maxRetries; attempt += 1) {
    try {
      const response = await axios.post(cfg.baseUrl, payload, {
        headers,
        timeout: cfg.timeoutSec * 1000,
      });
      const data = response.data;
      if (data?.err_no && data.err_no !== 0) {
        const error = new Error(
          `Baidu ASR error ${data.err_no}: ${data.err_msg || "unknown"}`,
        );
        (error as any).itDebug = {
          response: data,
          status: response.status,
        };
        throw error;
      }
      const result = Array.isArray(data?.result) ? data.result.join("") : "";
      return result;
    } catch (err) {
      const axiosError = err as any;
      if (axiosError?.response) {
        axiosError.itDebug = {
          response: axiosError.response?.data,
          status: axiosError.response?.status,
        };
      }
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Baidu ASR failed.");
}

