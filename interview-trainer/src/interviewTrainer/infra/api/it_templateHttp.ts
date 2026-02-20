import type {
  ItTemplateResponse,
  ItTemplateStreaming,
} from "../../../protocol/interviewTrainer";
import { it_readPath } from "./it_templatePath";
import { it_formatTemplateValue } from "./it_templateVars";

export function it_buildQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => {
        if (item === undefined || item === null) {
          return;
        }
        params.append(key, it_formatTemplateValue(item));
      });
      return;
    }
    params.append(key, it_formatTemplateValue(value));
  });
  const text = params.toString();
  return text ? `?${text}` : "";
}

export function it_appendQuery(url: string, query: Record<string, unknown>): string {
  if (!query || !Object.keys(query).length) {
    return url;
  }
  try {
    const base = new URL(url);
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null) {
        return;
      }
      if (Array.isArray(value)) {
        value.forEach((item) => {
          if (item === undefined || item === null) {
            return;
          }
          base.searchParams.append(key, it_formatTemplateValue(item));
        });
        return;
      }
      base.searchParams.append(key, it_formatTemplateValue(value));
    });
    return base.toString();
  } catch {
    const suffix = it_buildQueryString(query);
    if (!suffix) {
      return url;
    }
    return url.includes("?") ? `${url}&${suffix.slice(1)}` : `${url}${suffix}`;
  }
}

export function it_extractResponseValue(
  data: any,
  response?: ItTemplateResponse,
): any {
  const path = response?.jsonPath || response?.textPath;
  const fromPath = path ? it_readPath(data, path) : undefined;
  if (fromPath !== undefined) {
    return fromPath;
  }
  const direct = data?.output_text ?? data?.outputText ?? data?.text;
  if (direct !== undefined) {
    return direct;
  }
  const outputs = Array.isArray(data?.output) ? data.output : [];
  if (outputs.length) {
    const chunks: string[] = [];
    outputs.forEach((item: any) => {
      if (typeof item?.text === "string") {
        chunks.push(item.text);
      }
      const content = Array.isArray(item?.content) ? item.content : [];
      content.forEach((part: any) => {
        if (part?.text) {
          chunks.push(String(part.text));
        }
      });
    });
    if (chunks.length) {
      return chunks.join("");
    }
  }
  const chatLike =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.delta?.content ??
    data?.choices?.[0]?.text ??
    undefined;
  return chatLike;
}

export function it_extractStreamDelta(
  payload: any,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
): string {
  const path = streaming?.deltaPath || response?.textPath || response?.jsonPath;
  if (path) {
    const value = it_readPath(payload, path);
    if (Array.isArray(value)) {
      const joined = value
        .map((item) => (typeof item === "string" ? item : it_formatTemplateValue(item)))
        .join("");
      return joined;
    }
    if (typeof value === "string") {
      return value;
    }
    if (value !== undefined && value !== null) {
      return it_formatTemplateValue(value);
    }
  }
  const delta =
    payload?.delta ??
    payload?.output_text?.delta ??
    payload?.choices?.[0]?.delta?.content ??
    payload?.choices?.[0]?.message?.content ??
    payload?.choices?.[0]?.text ??
    payload?.output_text ??
    payload?.text ??
    "";
  return typeof delta === "string" ? delta : "";
}

function it_tryParseJsonPayload(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) {
    return undefined;
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function it_resolveNonSseFallback(
  raw: string,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
): string {
  const trimmed = String(raw || "").trim();
  if (!trimmed) {
    return "";
  }

  const parsed = it_tryParseJsonPayload(trimmed);
  if (parsed !== undefined) {
    const streamDelta = it_extractStreamDelta(parsed, streaming, response);
    if (streamDelta) {
      return streamDelta;
    }
    const structured = it_extractResponseValue(parsed, response);
    if (typeof structured === "string") {
      return structured;
    }
    if (structured !== undefined && structured !== null) {
      return it_formatTemplateValue(structured);
    }
  }

  return trimmed;
}

function it_resolvePayloadText(
  payload: unknown,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
): string {
  const delta = it_extractStreamDelta(payload, streaming, response);
  if (delta) {
    return delta;
  }
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) {
      return "";
    }
    // Keep malformed JSON fragments from polluting stream output.
    const startsLikeJson = trimmed.startsWith("{") || trimmed.startsWith("[");
    const endsLikeJson = trimmed.endsWith("}") || trimmed.endsWith("]");
    if (startsLikeJson && !endsLikeJson) {
      return "";
    }
    return trimmed;
  }
  const structured = it_extractResponseValue(payload, response);
  if (typeof structured === "string") {
    return structured;
  }
  if (structured !== undefined && structured !== null) {
    return it_formatTemplateValue(structured);
  }
  return "";
}

export async function it_consumeTemplateSse(
  stream: NodeJS.ReadableStream,
  streaming?: ItTemplateStreaming,
  response?: ItTemplateResponse,
  onDelta?: (delta: string, full: string) => void,
  abortSignal?: { aborted: boolean },
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";
    let rawText = "";
    let sawSseData = false;
    const delimiter = streaming?.eventDelimiter || "\n\n";
    const dataPrefix = streaming?.dataPrefix || "data:";
    const doneSignals = new Set<string>([
      ...(streaming?.doneSignals || []),
      ...(response?.doneSignal ? [response.doneSignal] : []),
      "[DONE]",
    ]);
    const heartbeat =
      streaming?.heartbeatPattern ? new RegExp(streaming.heartbeatPattern) : null;
    const flush = (delta: string) => {
      if (!delta) {
        return;
      }
      fullText += delta;
      onDelta?.(delta, fullText);
    };
    const handleEvent = (chunk: string) => {
      if (abortSignal?.aborted) {
        reject(new Error("stream aborted"));
        return true;
      }
      const lines = chunk.split(/\r?\n/);
      const dataLines = lines
        .map((line) => line.trim())
        .filter((line) => line && line.startsWith(dataPrefix));
      if (!dataLines.length) {
        return false;
      }
      sawSseData = true;
      const data = dataLines
        .map((line) => line.slice(dataPrefix.length).trim())
        .join("\n");
      if (!data) {
        return false;
      }
      if (doneSignals.has(data)) {
        resolve(fullText);
        return true;
      }
      if (heartbeat && heartbeat.test(data)) {
        return false;
      }
      let payload: any = data;
      if (
        (data.startsWith("{") && data.endsWith("}")) ||
        (data.startsWith("[") && data.endsWith("]"))
      ) {
        try {
          payload = JSON.parse(data);
        } catch {
          payload = data;
        }
      }
      const delta = it_resolvePayloadText(payload, streaming, response);
      flush(delta);
      return false;
    };
    stream.on("data", (chunk) => {
      const text = chunk.toString();
      rawText += text;
      buffer += text;
      let idx = buffer.indexOf(delimiter);
      while (idx !== -1) {
        const piece = buffer.slice(0, idx);
        buffer = buffer.slice(idx + delimiter.length);
        if (handleEvent(piece)) {
          return;
        }
        idx = buffer.indexOf(delimiter);
      }
    });
    stream.on("end", () => {
      let settledByEvent = false;
      if (buffer.trim()) {
        settledByEvent = handleEvent(buffer);
      }
      if (settledByEvent) {
        return;
      }
      if (fullText) {
        resolve(fullText);
        return;
      }
      resolve(it_resolveNonSseFallback(rawText, streaming, response));
    });
    stream.on("error", (err) => reject(err));
  });
}
