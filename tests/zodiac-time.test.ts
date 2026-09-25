import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { buildChart } from "@/lib/server/chart";
import { FieldInputError } from "@/lib/server/errors";
import { ingressEvents } from "@/lib/server/terms";
import type { BirthInput } from "@/lib/shared/schemas";

const asOf = Temporal.Instant.from("2026-09-01T00:00:00Z");

function at(date: { year: number; month: number; day: number }, time: string, zone = "Asia/Shanghai"): BirthInput {
  return {
    calendar: "solar",
    birthDate: { ...date, isLeapMonth: false },
    birthTime: { precision: "second", value: time, shichen: null },
    genderForCalculation: "male",
    birthPlace: { cityId: null, timeZone: zone, offsetChoice: null },
  };
}

describe("太阳星座与时区", () => {
  it("恰好落在入宫时刻属于新星座，前一秒属于旧星座", () => {
    const equinox = ingressEvents(2025, 2027).find((event) => event.name === "春分" && event.instant.toZonedDateTimeISO("+08:00").year === 2026);
    expect(equinox).toBeTruthy();
    if (!equinox) return;
    const beijing = equinox.instant.toZonedDateTimeISO("+08:00");
    const clock = (zoned: Temporal.ZonedDateTime) => zoned.toPlainTime().toString({ smallestUnit: "second" }).slice(0, 8);
    const onBoundary = buildChart(at(
      { year: beijing.year, month: beijing.month, day: beijing.day },
      clock(beijing),
    ), asOf);
    const before = buildChart(at(
      { year: beijing.year, month: beijing.month, day: beijing.day },
      clock(beijing.subtract({ seconds: 1 })),
    ), asOf);
    expect(onBoundary.zodiac.sign?.name).toBe("白羊座");
    expect(before.zodiac.sign?.name).toBe("双鱼座");
    expect(onBoundary.zodiac.nearBoundary).toBe(true);
    expect(onBoundary.zodiac.candidates).toHaveLength(1);
  });

  it("分钟范围跨过交接时返回候选，不输出双重人格", () => {
    const facts = buildChart({
      ...at({ year: 2026, month: 3, day: 20 }, "22:45:00"),
      birthTime: { precision: "minute", value: "22:45", shichen: null },
    }, asOf);
    expect(facts.zodiac.status).toBe("ambiguous");
    expect(facts.zodiac.candidates.map((item) => item.name).sort()).toEqual(["双鱼座", "白羊座"]);
    expect(facts.persona.title === null || !facts.persona.title.includes("双星座")).toBe(true);
    expect(facts.zodiac.notice).toContain("或");
  });

  it("相同 UTC 用不同时区输入，星座相同", () => {
    const shanghai = buildChart(at({ year: 2024, month: 6, day: 1 }, "20:00:00", "Asia/Shanghai"), asOf);
    const tokyo = buildChart(at({ year: 2024, month: 6, day: 1 }, "21:00:00", "Asia/Tokyo"), asOf);
    expect(shanghai.birthUtcRanges[0]?.startUtc).toBe(tokyo.birthUtcRanges[0]?.startUtc);
    expect(shanghai.zodiac.sign?.id).toBe(tokyo.zodiac.sign?.id);
  });

  it("跳时不存在的钟点被拒绝，回拨重复时刻要求选择偏移", () => {
    const later = Temporal.Instant.from("2026-12-15T00:00:00Z");
    expect(() => buildChart(at({ year: 2026, month: 3, day: 8 }, "02:30:00", "America/New_York"), later)).toThrow(FieldInputError);
    try {
      buildChart(at({ year: 2026, month: 11, day: 1 }, "01:30:00", "America/New_York"), later);
      throw new Error("应当要求选择偏移");
    } catch (error) {
      expect(error).toBeInstanceOf(FieldInputError);
      if (error instanceof FieldInputError) {
        expect(error.code).toBe("AMBIGUOUS_OFFSET");
        expect(error.candidates).toEqual(["-04:00", "-05:00"]);
      }
    }
    const chosen = buildChart({
      ...at({ year: 2026, month: 11, day: 1 }, "01:30:00", "America/New_York"),
      birthPlace: { cityId: null, timeZone: "America/New_York", offsetChoice: "-05:00" },
    }, later);
    expect(chosen.birthUtcRanges).toHaveLength(1);
  });

  it("历史中国夏令时跳时同样拒绝不存在时刻", () => {
    expect(() => buildChart(at({ year: 1988, month: 4, day: 17 }, "02:30:00", "Asia/Shanghai"), asOf)).toThrow(FieldInputError);
  });

  it("夏令时当天不是固定 24 小时", () => {
    const later = Temporal.Instant.from("2026-12-15T00:00:00Z");
    const spring = buildChart({
      ...at({ year: 2026, month: 3, day: 8 }, "12:00:00", "America/New_York"),
      birthTime: { precision: "unknown", value: null, shichen: null },
    }, later);
    const fall = buildChart({
      ...at({ year: 2026, month: 11, day: 1 }, "12:00:00", "America/New_York"),
      birthTime: { precision: "unknown", value: null, shichen: null },
    }, later);
    const hours = (facts: ReturnType<typeof buildChart>) => facts.birthUtcRanges.reduce((sum, range) => {
      return sum + (Temporal.Instant.from(range.endUtc).epochMilliseconds - Temporal.Instant.from(range.startUtc).epochMilliseconds);
    }, 0) / 3_600_000;
    expect(hours(spring)).toBe(23);
    expect(hours(fall)).toBe(25);
  });

  it("未知时间覆盖交界日时不给唯一星座", () => {
    const facts = buildChart({
      ...at({ year: 2026, month: 3, day: 20 }, "12:00:00"),
      birthTime: { precision: "unknown", value: null, shichen: null },
    }, asOf);
    expect(facts.zodiac.status).toBe("ambiguous");
    expect(facts.allowedTopics.zodiac).toBe(false);
  });
});
