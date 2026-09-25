import type { UsageNote } from "@/lib/server/reading-run";

// DeepSeek public deepseek-flash rates, CNY per million tokens, checked 2026-09-25.
export const PRICE_VERSION = "2026-09-25";

export function estimateFlashCost(usage: UsageNote, at = new Date()): { costCny: number | null; priceTier: "peak" | "off_peak" } {
  const weekday = at.getUTCDay();
  const hour = at.getUTCHours();
  const peak = weekday >= 1 && weekday <= 5 && ((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
  const priceTier = peak ? "peak" : "off_peak";
  const { cacheHitTokens: hit, cacheMissTokens: miss, completionTokens: output, promptTokens } = usage;
  if (hit === null || miss === null || output === null || promptTokens === null || hit + miss !== promptTokens) {
    return { costCny: null, priceTier };
  }
  return { costCny: (hit * (peak ? 0.04 : 0.02) + miss * (peak ? 2 : 1) + output * (peak ? 8 : 4)) / 1_000_000, priceTier };
}
