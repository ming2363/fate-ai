import { Temporal } from "@js-temporal/polyfill";
import { expect, it } from "vitest";
import { buildChart } from "@/lib/server/chart";
import { validateReading } from "@/lib/server/reading-validate";
import type { Reading } from "@/lib/shared/chart-types";

it("详细报告接受完整段落，拒绝过短正文、缺失技术依据和跨年引用", () => {
  const facts = buildChart({ calendar: "lunar", birthDate: { year: 1999, month: 11, day: 15, isLeapMonth: false }, birthTime: { precision: "shichen", value: null, shichen: "si" }, genderForCalculation: "male", birthPlace: { cityId: null, timeZone: "Asia/Shanghai", offsetChoice: null } }, Temporal.Instant.from("2026-09-25T00:00:00Z"));
  const p = (length: number, ...basisRefs: string[]) => ({ text: "先理解依据，再观察现实中的选择与边界。".repeat(20).slice(0, length), basisRefs });
  const report: Reading = {
    schemaVersion: "reading.v1", overview: p(50, "natal.day_master"),
    personality: { status: "generated", summary: p(60, "natal.day_master"), strengths: [p(30, "natal.day_master"), p(30, "natal.day_master")], blindSpots: [p(30, "natal.day_master")], relationshipAdvice: p(40, "natal.day_master"), cardSentence: p(16, "persona.title") },
    currentLuck: { status: "generated", periodId: facts.luck.current!.id, theme: p(8, "luck.current.pillar"), summary: p(150, "luck.current.ten_gods", "luck.current.relation.day"), opportunity: p(150, "luck.current.ten_gods"), attention: p(120, "luck.current.relation.year") },
    annualReadings: facts.annuals.items.map((annual) => {
      const prefix = `annual.${annual.year}`;
      const relation = facts.factCatalog.find((item) => item.id.startsWith(prefix) && item.id.includes(".relation."))?.id ?? `${prefix}.ten_gods`;
      return { year: annual.year, status: "generated", summary: p(120, `${prefix}.ten_gods`, relation), outlooks: [p(50, `${prefix}.ten_gods`), p(50, relation)], career: p(100, `${prefix}.ten_gods`), relationships: p(100, relation), finance: p(100, `${prefix}.ten_gods`), actions: [p(40, `${prefix}.ten_gods`), p(40, relation)], segments: annual.segments.map((segment, index) => ({ periodId: segment.periodId, summary: p(80, `${prefix}.segment.${index + 1}`) })) };
    }), zodiacNote: p(40, "zodiac.sign"),
  };
  expect(validateReading(report, facts).ok).toBe(true);
  const slightlyLong = { ...report, annualReadings: report.annualReadings.map((item, index) => index === 2 ? { ...item, finance: p(159, `annual.${item.year}.ten_gods`) } : item) };
  expect(validateReading(slightlyLong, facts).ok).toBe(true);
  const short = { ...report, currentLuck: { ...report.currentLuck, summary: p(30, "luck.current.ten_gods", "luck.current.relation.day") } };
  expect(validateReading(short, facts)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("currentLuck.summary 长度")]) });
  const noBasis = { ...report, currentLuck: { ...report.currentLuck, summary: p(150, "luck.current.pillar") } };
  expect(validateReading(noBasis, facts)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("概括须引用")]) });
  const wrongYear = { ...report, annualReadings: report.annualReadings.map((item, index) => index ? item : { ...item, career: p(100, "annual.2026.ten_gods") }) };
  expect(validateReading(wrongYear, facts)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("与本模块无关")]) });
  const missingOutlooks = { ...report, annualReadings: report.annualReadings.map((item, index) => index ? item : { ...item, outlooks: [] }) };
  expect(validateReading(missingOutlooks, facts)).toMatchObject({ ok: false, errors: expect.arrayContaining([expect.stringContaining("流年段落不完整")]) });
  expect(facts.annuals.items[0]?.segments.some((segment) => segment.periodId === facts.luck.current?.id)).toBe(true);
  const sameLuckRef = { ...report, annualReadings: report.annualReadings.map((item, index) => index ? item : { ...item, outlooks: [p(50, "luck.current.relation.year"), item.outlooks[1]!] }) };
  expect(validateReading(sameLuckRef, facts).ok).toBe(true);
});
