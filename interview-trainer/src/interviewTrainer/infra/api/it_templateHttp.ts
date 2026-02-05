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
      const delta = it_extractStreamDelta(payload, streaming, response);
      flush(delta);
      return false;
    };
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
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
      if (buffer.trim()) {
        handleEvent(buffer);
      }
      resolve(fullText);
    });
    stream.on("error", (err) => reject(err));
  });
}
