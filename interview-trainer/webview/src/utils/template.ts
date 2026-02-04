import type { ItApiTemplate } from "../types";

export function cloneTemplate(template: ItApiTemplate): ItApiTemplate {
  return JSON.parse(JSON.stringify(template)) as ItApiTemplate;
}

export function formatJson(value: unknown, fallback = "{}"): string {
  if (value === undefined || value === null) {
    return fallback;
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return fallback;
  }
}

export function parseJson(
  text: string,
): { ok: true; value: any } | { ok: false; error: string } {
  const trimmed = String(text || "").trim();
  if (!trimmed) {
    return { ok: true, value: undefined };
  }
  try {
    return { ok: true, value: JSON.parse(trimmed) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
