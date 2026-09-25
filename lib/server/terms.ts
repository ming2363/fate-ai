import { Temporal } from "@js-temporal/polyfill";
import { Lunar } from "lunar-javascript";

import { JIE_TERMS, signByTerm, ZHONG_QI } from "@/lib/shared/signs";
import { CHART_OFFSET, ENGINE_VERSION } from "@/lib/shared/versions";

const ALIAS: Record<string, string> = {
  DA_XUE: "大雪",
  DONG_ZHI: "冬至",
  XIAO_HAN: "小寒",
  DA_HAN: "大寒",
  LI_CHUN: "立春",
  YU_SHUI: "雨水",
  JING_ZHE: "惊蛰",
};

export type TermEvent = {
  readonly name: string;
  readonly instant: Temporal.Instant;
  readonly source: string;
};

const JIE_SET = new Set<string>(JIE_TERMS);
const QI_SET = new Set<string>(ZHONG_QI);
const cache = new Map<string, readonly TermEvent[]>();

function solarToInstant(year: number, month: number, day: number, hour: number, minute: number, second: number): Temporal.Instant {
  return Temporal.ZonedDateTime.from({
    timeZone: CHART_OFFSET,
    year,
    month,
    day,
    hour,
    minute,
    second,
  }).toInstant();
}

export function collectTerms(fromYear: number, toYear: number): readonly TermEvent[] {
  const key = `${ENGINE_VERSION}:${fromYear}:${toYear}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const seen = new Map<string, TermEvent>();
  for (let year = fromYear - 1; year <= toYear + 1; year += 1) {
    const table = Lunar.fromYmd(year, 6, 1).getJieQiTable();
    for (const [rawName, solar] of Object.entries(table)) {
      const name = ALIAS[rawName] ?? rawName;
      if (!QI_SET.has(name) && !JIE_SET.has(name)) continue;
      const instant = solarToInstant(solar.getYear(), solar.getMonth(), solar.getDay(), solar.getHour(), solar.getMinute(), solar.getSecond());
      const id = `${name}:${instant.toString()}`;
      if (!seen.has(id)) {
        seen.set(id, { name, instant, source: `${ENGINE_VERSION} jieqi UTC+08:00` });
      }
    }
  }
  const events = [...seen.values()].sort((left, right) => Temporal.Instant.compare(left.instant, right.instant));
  cache.set(key, events);
  return events;
}

export function ingressEvents(fromYear: number, toYear: number): readonly (TermEvent & { readonly signId: string; readonly signName: string })[] {
  return collectTerms(fromYear, toYear).flatMap((event) => {
    const sign = signByTerm(event.name);
    return sign ? [{ ...event, signId: sign.id, signName: sign.name }] : [];
  });
}

export function jieEvents(fromYear: number, toYear: number): readonly TermEvent[] {
  return collectTerms(fromYear, toYear).filter((event) => JIE_SET.has(event.name));
}
