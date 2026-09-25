import { describe, expect, it } from "vitest";

import { estimateFlashCost } from "@/lib/server/model-cost";
import { parseUpstreamPayload } from "@/lib/server/upstream";

describe("模型用量与费用", () => {
  it("按缓存命中和 UTC 峰谷价估算，缺少用量时不编造费用", () => {
    const parsed = parseUpstreamPayload({ usage: { prompt_tokens: 1000, prompt_cache_hit_tokens: 500, prompt_cache_miss_tokens: 500, completion_tokens: 1000 } });
    const usage = { modelMs: 100, promptTokens: parsed?.usage?.promptTokens ?? null, cacheHitTokens: parsed?.usage?.cacheHitTokens ?? null, cacheMissTokens: parsed?.usage?.cacheMissTokens ?? null, completionTokens: parsed?.usage?.completionTokens ?? null };
    expect(estimateFlashCost(usage, new Date("2026-09-25T02:00:00Z"))).toEqual({ priceTier: "peak", costCny: 0.00902 });
    expect(estimateFlashCost(usage, new Date("2026-09-25T04:00:00Z"))).toEqual({ priceTier: "off_peak", costCny: 0.00451 });
    expect(estimateFlashCost({ ...usage, cacheMissTokens: null }).costCny).toBeNull();
  });
});
