import { THINKING_CHAR_LIMIT } from "@/lib/shared/versions";

export function appendThinking(current: string, delta: string, limit = THINKING_CHAR_LIMIT): { readonly text: string; readonly truncated: boolean } {
  const merged = [...(current + delta)];
  if (merged.length <= limit) return { text: current + delta, truncated: false };
  return { text: merged.slice(merged.length - limit).join(""), truncated: true };
}
