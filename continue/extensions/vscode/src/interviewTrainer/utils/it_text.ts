import crypto from "crypto";

export function it_normalizeText(text: string): string {
  return (text || "").replace(/\s+/g, "").trim();
}

export function it_hashText(text: string): string {
  if (!text) {
    return "";
  }
  return crypto.createHash("sha1").update(text, "utf8").digest("hex");
}

export function it_makeSlug(
  input: string,
  allowUnicode: boolean,
  maxLen: number,
): string {
  const base = (input || "").trim();
  if (!base) {
    return "untitled";
  }
  if (allowUnicode) {
    const safe = base.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, "-");
    return safe.slice(0, maxLen) || "untitled";
  }
  const ascii = base
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii) {
    return ascii.slice(0, maxLen);
  }
  const digest = it_hashText(base).slice(0, 8);
  return `topic-${digest}`;
}

export function it_formatSeconds(seconds: number): string {
  const safe = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
