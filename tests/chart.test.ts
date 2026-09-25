import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { buildChart } from "@/lib/server/chart";
import { FieldInputError } from "@/lib/server/errors";
import type { BirthInput } from "@/lib/shared/schemas";
import { isDayMaster, PERSONA_BY_GAN, typeLabel } from "@/lib/shared/persona";
import { luckAt } from "@/lib/server/luck";
import { readableMoment, zodiacComparison } from "@/lib/shared/display";

const asOf = Temporal.Instant.from("2026-06-15T04:00:00Z");

function input(overrides: Partial<BirthInput> = {}): BirthInput {
  return {
    calendar: "solar",
    birthDate: { year: 1995, month: 8, day: 23, isLeapMonth: false },
    birthTime: { precision: "minute", value: "14:35", shichen: null },
    genderForCalculation: "female",
    birthPlace: { cityId: "cn-shanghai", timeZone: "Asia/Shanghai", offsetChoice: null },
    ...overrides,
  };
}

describe("确定性排盘", () => {
  it.each(["male", "female"] as const)("农历1999十一月十五巳时：%s 可解读稳定大运与流年，保留星座交接依据", (genderForCalculation) => {
    const birth = input({
      calendar: "lunar",
      birthDate: { year: 1999, month: 11, day: 15, isLeapMonth: false },
      birthTime: { precision: "shichen", value: null, shichen: "si" },
      genderForCalculation,
    });
    const facts = buildChart(birth, asOf);
    expect(facts.timeBasis.solarDateLabel).toBe("1999-12-22");
    expect(facts.zodiac.sign?.name).toBe("射手座");
    const ingress = facts.zodiac.ingresses[0]!;
    expect(ingress.previousSignName).toBe("射手座");
    expect(ingress.signName).toBe("摩羯座");
    expect(Date.parse(ingress.startUtc)).toBeGreaterThan(Date.parse(facts.birthUtcRanges[0]!.endUtc));
    expect(zodiacComparison(facts)).toContain("全部在交接之前");
    const after = buildChart({ ...birth, birthTime: { precision: "minute", value: "18:00", shichen: null } }, asOf);
    expect(after.zodiac.sign?.name).toBe("摩羯座");
    expect(zodiacComparison(after)).toContain("全部在交接之后");
    expect(facts.luck.status).toBe("determined");
    expect(facts.allowedTopics.currentLuck).toBe(true);
    expect(facts.allowedTopics.annualYears).toEqual([2025, 2026, 2027]);
    expect(facts.luck.current?.startUtc).toBeNull();
    expect(readableMoment(facts.luck.current!.startLabel).split(" 至 ")).toHaveLength(2);
    expect(Number(facts.luck.current!.endLabel.slice(0, 4)) - Number(facts.luck.current!.startLabel.slice(0, 4))).toBe(10);
    const exactPeriods = luckAt(Temporal.Instant.from("1999-12-22T01:00:00Z"), genderForCalculation === "male" ? 1 : 0, asOf).periods;
    for (const period of exactPeriods.filter((item) => item.formal)) {
      const start = period.start.toZonedDateTimeISO("+08:00");
      const end = period.end.toZonedDateTimeISO("+08:00");
      expect(end.year - start.year).toBe(10);
      expect(end.month).toBe(start.month);
      expect(end.day).toBe(start.day);
    }
    expect(facts.luck.notice).toBeNull();
    const annualFacts = facts.factCatalog.filter((item) => item.id.startsWith("annual.2026."));
    expect(annualFacts.find((item) => item.id === "annual.2026.ten_gods")?.description).toContain("天干丙火为偏印");
    expect(annualFacts.find((item) => item.id === "annual.2026.ten_gods")?.description).toContain("丁（正印，本气）、己（劫财）");
    expect(annualFacts.find((item) => item.id === "annual.2026.relation.month")?.description).toContain("午子六冲");
    expect(facts.factCatalog.find((item) => item.id === "annual.2025.relation.day")?.description).toContain("巳申六合");
    if (genderForCalculation === "male") {
      expect(facts.factCatalog.find((item) => item.id === "luck.current.ten_gods")?.description).toContain("天干癸水为正财");
      expect(facts.factCatalog.find((item) => item.id === "luck.current.relation.day")?.description).toContain("癸戊五合");
    }
  });

  it("时辰范围真的跨过当前交运时，不放开唯一大运解读", () => {
    const first = luckAt(Temporal.Instant.from("1999-12-22T01:00:00Z"), 1, asOf).start;
    const last = luckAt(Temporal.Instant.from("1999-12-22T02:59:59Z"), 1, asOf).start;
    const crossing = Temporal.Instant.fromEpochMilliseconds(Math.floor((first.epochMilliseconds + last.epochMilliseconds) / 2));
    const facts = buildChart(input({
      calendar: "lunar",
      birthDate: { year: 1999, month: 11, day: 15, isLeapMonth: false },
      birthTime: { precision: "shichen", value: null, shichen: "si" },
      genderForCalculation: "male",
    }), crossing);
    expect(facts.luck.status).toBe("ambiguous");
    expect(facts.luck.candidates).toHaveLength(2);
    expect(facts.allowedTopics.currentLuck).toBe(false);
    expect(facts.allowedTopics.annualYears).toEqual([]);
    expect(facts.factCatalog.some((item) => item.id.startsWith("luck.current.ten_gods"))).toBe(false);
  });

  it("日主来自日干，称号按固定表映射", () => {
    const facts = buildChart(input(), asOf);
    expect(facts.luck.current?.startLabel).not.toContain(" 至 ");
    expect(facts.bazi.dayMaster.source).toBe("日柱天干");
    expect(facts.bazi.dayMaster.status).toBe("determined");
    const gan = facts.bazi.dayMaster.value ?? "";
    expect(isDayMaster(gan)).toBe(true);
    if (!isDayMaster(gan)) return;
    expect(facts.persona.title).toBe(PERSONA_BY_GAN[gan].title);
    expect(facts.persona.typeLabel).toBe(typeLabel(gan, "female"));
    expect(facts.persona.typeLabel).not.toContain(facts.bazi.year.gan ?? "年");
  });

  it("同一输入在不同 asOf 之前的人格标签不随流年改变", () => {
    const first = buildChart(input(), asOf);
    const later = buildChart(input(), Temporal.Instant.from("2027-08-01T00:00:00Z"));
    expect(later.persona.typeLabel).toBe(first.persona.typeLabel);
    expect(later.persona.title).toBe(first.persona.title);
    expect(later.annuals.currentYear).not.toBe(first.annuals.currentYear);
  });

  it("拒绝非法公历和自动进位日期", () => {
    expect(() => buildChart(input({ birthDate: { year: 2023, month: 2, day: 30, isLeapMonth: false } }), asOf)).toThrow(FieldInputError);
    expect(() => buildChart(input({ birthDate: { year: 2023, month: 4, day: 31, isLeapMonth: false } }), asOf)).toThrow(FieldInputError);
    expect(() => buildChart(input({ birthDate: { year: 1899, month: 12, day: 31, isLeapMonth: false } }), asOf)).toThrow(FieldInputError);
  });

  it("拒绝不存在的农历闰月，接受真实闰月", () => {
    expect(() => buildChart(input({
      calendar: "lunar",
      birthDate: { year: 2023, month: 4, day: 1, isLeapMonth: true },
    }), asOf)).toThrow(FieldInputError);
    const facts = buildChart(input({
      calendar: "lunar",
      birthDate: { year: 2020, month: 4, day: 1, isLeapMonth: true },
      birthTime: { precision: "unknown", value: null, shichen: null },
    }), asOf);
    expect(facts.timeBasis.lunarLabel).toContain("闰");
    expect(facts.timeBasis.solarDateLabel).toBe("2020-05-23");
  });

  it("晚子时日柱仍属当天，早子时进入下一天", () => {
    const late = buildChart(input({
      birthDate: { year: 1988, month: 2, day: 15, isLeapMonth: false },
      birthTime: { precision: "minute", value: "23:30", shichen: null },
    }), asOf);
    const early = buildChart(input({
      birthDate: { year: 1988, month: 2, day: 16, isLeapMonth: false },
      birthTime: { precision: "minute", value: "00:30", shichen: null },
    }), asOf);
    expect(late.bazi.time.value).toContain("子");
    expect(early.bazi.time.value).toContain("子");
    expect(late.bazi.day.value).not.toBe(early.bazi.day.value);
  });

  it("立春前后年柱不同，元旦后立春前仍属上一流年", () => {
    const before = buildChart(input({
      birthDate: { year: 2026, month: 2, day: 3, isLeapMonth: false },
      birthTime: { precision: "minute", value: "12:00", shichen: null },
    }), asOf);
    const after = buildChart(input({
      birthDate: { year: 2026, month: 2, day: 4, isLeapMonth: false },
      birthTime: { precision: "minute", value: "12:00", shichen: null },
    }), asOf);
    expect(before.bazi.year.value).not.toBe(after.bazi.year.value);
    const newYear = buildChart(input(), Temporal.Instant.from("2026-01-15T04:00:00Z"));
    expect(newYear.annuals.currentYear).toBe(2025);
  });

  it("时间不详时不生成唯一起运，日主仍可确定", () => {
    const facts = buildChart(input({ birthTime: { precision: "unknown", value: null, shichen: null } }), asOf);
    expect(facts.luck.status).toBe("unavailable");
    expect(facts.luck.startUtc).toBeNull();
    expect(facts.allowedTopics.currentLuck).toBe(false);
    expect(facts.persona.status === "determined" || facts.persona.status === "ambiguous").toBe(true);
  });

  it("出生前的流年不生成个人经历", () => {
    const facts = buildChart(input({
      birthDate: { year: 2026, month: 3, day: 1, isLeapMonth: false },
      birthTime: { precision: "minute", value: "10:00", shichen: null },
    }), Temporal.Instant.from("2026-06-15T04:00:00Z"));
    const previous = facts.annuals.items.find((item) => item.role === "previous");
    expect(previous?.personalStatus).toBe("before-birth");
    expect(facts.allowedTopics.annualYears).not.toContain(previous?.year);
  });

  it("未来出生被拒绝", () => {
    expect(() => buildChart(input({
      birthDate: { year: 2027, month: 1, day: 1, isLeapMonth: false },
    }), asOf)).toThrow(FieldInputError);
  });
});
