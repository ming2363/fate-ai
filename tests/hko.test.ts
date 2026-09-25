import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { ingressEvents } from "@/lib/server/terms";
import { ENGINE_VERSION } from "@/lib/shared/versions";

/**
 * 香港天文台中气时刻，时标为协调世界时加 8 小时，精度到分钟。
 * 来源：https://www.hko.gov.hk/tc/gts/astron2025/files/2025SolarTerms24.pdf
 * https://www.hko.gov.hk/tc/gts/astron2026/files/2026SolarTerms24.pdf
 * 年历说明依据英国皇家航海历书局及美国海军天文台数据。日期表不能当作分钟证据，这里只用带时刻的中气。
 */
const HKO_SAMPLES = [
  ["春分", "2025-03-20T17:01:00+08:00"],
  ["谷雨", "2025-04-20T03:56:00+08:00"],
  ["小满", "2025-05-21T02:55:00+08:00"],
  ["夏至", "2025-06-21T10:42:00+08:00"],
  ["大暑", "2025-07-22T21:29:00+08:00"],
  ["处暑", "2025-08-23T04:34:00+08:00"],
  ["秋分", "2025-09-23T02:19:00+08:00"],
  ["霜降", "2025-10-23T11:51:00+08:00"],
  ["小雪", "2025-11-22T09:36:00+08:00"],
  ["冬至", "2025-12-21T23:03:00+08:00"],
  ["大寒", "2026-01-20T09:45:00+08:00"],
  ["雨水", "2026-02-18T23:52:00+08:00"],
  ["春分", "2026-03-20T22:46:00+08:00"],
  ["谷雨", "2026-04-20T09:39:00+08:00"],
  ["小满", "2026-05-21T08:37:00+08:00"],
  ["夏至", "2026-06-21T16:25:00+08:00"],
  ["大暑", "2026-07-23T03:13:00+08:00"],
  ["处暑", "2026-08-23T10:19:00+08:00"],
  ["秋分", "2026-09-23T08:05:00+08:00"],
  ["霜降", "2026-10-23T17:38:00+08:00"],
  ["小雪", "2026-11-22T15:23:00+08:00"],
  ["冬至", "2026-12-22T04:50:00+08:00"],
] as const;

describe("香港天文台独立节气样本", () => {
  it(`与 ${ENGINE_VERSION} 的差值不超过 60 秒，并记录参考精度为 1 分钟`, () => {
    const events = ingressEvents(2024, 2027);
    const deltas = HKO_SAMPLES.map(([name, label]) => {
      const expected = Temporal.Instant.from(label);
      const found = events.find((event) => event.name === name && Math.abs(event.instant.epochMilliseconds - expected.epochMilliseconds) < 120_000);
      expect(found, `${name} ${label}`).toBeTruthy();
      return found ? Math.abs(found.instant.epochMilliseconds - expected.epochMilliseconds) / 1000 : 999;
    });
    const max = Math.max(...deltas);
    expect(max).toBeLessThanOrEqual(60);
  });
});
