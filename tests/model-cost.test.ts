import { describe, expect, it } from "vitest";

import { estimateFlashCost } from "@/lib/server/model-cost";
import { parseUpstreamPayload } from "@/lib/server/upstream";

describe("模型用量与费用", () => {
  it("解析千问缓存用量，按每天北京时间 08–22 点忙时计费，缺失用量不编造费用", () => {
    const parsed = parseUpstreamPayload({ usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 500 }, completion_tokens: 1000 } });
    const usage = { modelMs: 100, promptTokens: parsed?.usage?.promptTokens ?? null, cacheHitTokens: parsed?.usage?.cacheHitTokens ?? null, cacheMissTokens: parsed?.usage?.cacheMissTokens ?? null, completionTokens: parsed?.usage?.completionTokens ?? null };
    expect(usage.cacheMissTokens).toBe(500);
    expect(estimateFlashCost(usage, new Date("2026-09-27T00:00:00Z"))).toEqual({ priceTier: "peak", costCny: 0.0091 });
    expect(estimateFlashCost(usage, new Date("2026-09-27T13:59:59Z"))).toEqual({ priceTier: "peak", costCny: 0.0091 });
    expect(estimateFlashCost(usage, new Date("2026-09-27T14:00:00Z"))).toEqual({ priceTier: "off_peak", costCny: 0.00455 });
    expect(estimateFlashCost(usage, new Date("2026-09-26T23:59:59Z"))).toEqual({ priceTier: "off_peak", costCny: 0.00455 });
    expect(estimateFlashCost({ ...usage, cacheMissTokens: null }).costCny).toBeNull();
    expect(estimateFlashCost({ ...usage, completionTokens: -1 }).costCny).toBeNull();
    expect(parseUpstreamPayload({ usage: { prompt_tokens: 1000, completion_tokens: 10 } })?.usage?.cacheMissTokens).toBeNull();
    expect(parseUpstreamPayload({ usage: { prompt_tokens: 1000, prompt_tokens_details: { cached_tokens: 1200 } } })?.usage?.cacheMissTokens).toBeNull();
  });
});
