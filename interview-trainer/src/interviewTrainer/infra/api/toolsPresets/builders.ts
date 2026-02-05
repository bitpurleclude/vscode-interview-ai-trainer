import type { ItToolsPreset } from "./types";
import { IT_CODEX_LIKE_TOOLS } from "./presets/codexLike";

export function it_resolveToolsPreset(preset?: string): ItToolsPreset | undefined {
  if (!preset) return undefined;
  const key = String(preset).trim().toLowerCase();
  if (key in { "codex_like": 1, "codex": 1, "gmn": 1 }) {
    return [...IT_CODEX_LIKE_TOOLS];
  }
  return undefined;
}
