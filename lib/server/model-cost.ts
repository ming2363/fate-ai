import type { UsageNote } from "@/lib/server/reading-run";

// https://www.qianwenai.com/models/deepseek-v4.1-flash#pricing
// CNY per million tokens; off-peak daily 22:00–08:00 UTC+8. Estimates exclude account discounts.
export const PRICE_VERSION = "qw-2026-09-27";

export function estimateFlashCost(usage: UsageNote, at = new Date()): { costCny: number | null; priceTier: "peak" | "off_peak" } {
  const hour = at.getUTCHours();
  const peak = hour >= 0 && hour < 14;
  const priceTier = peak ? "peak" : "off_peak";
  const { cacheHitTokens: hit, cacheMissTokens: miss, completionTokens: output, promptTokens } = usage;
  if (hit === null || miss === null || output === null || promptTokens === null || hit + miss !== promptTokens ||
    ![hit, miss, output, promptTokens].every((count) => Number.isSafeInteger(count) && count >= 0) || !Number.isFinite(at.getTime())) {
    return { costCny: null, priceTier };
  }
  return { costCny: (hit * (peak ? 0.2 : 0.1) + miss * (peak ? 2 : 1) + output * (peak ? 8 : 4)) / 1_000_000, priceTier };
}
