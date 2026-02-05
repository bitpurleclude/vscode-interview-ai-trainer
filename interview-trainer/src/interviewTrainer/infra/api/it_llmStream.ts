export function it_extractStreamDelta(payload: any): string {
  const eventType = payload?.type;
  if (typeof eventType === "string") {
    if (eventType.includes("output_text.delta") && typeof payload?.delta === "string") {
      return payload.delta;
    }
    if (eventType.includes("output_text.done")) {
      return "";
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

export async function it_consumeSseStream(
  stream: NodeJS.ReadableStream,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    let fullText = "";
    const flush = (delta: string) => {
      if (!delta) {
        return;
      }
      fullText += delta;
      onDelta?.(delta, fullText);
    };
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data:")) {
          continue;
        }
        const data = trimmed.slice(5).trim();
        if (!data) {
          continue;
        }
        if (data === "[DONE]") {
          resolve(fullText);
          return;
        }
        try {
          const payload = JSON.parse(data);
          const delta = it_extractStreamDelta(payload);
          flush(delta);
        } catch {
          // ignore parse errors
        }
      }
    });
    stream.on("end", () => resolve(fullText));
    stream.on("error", (err) => reject(err));
  });
}