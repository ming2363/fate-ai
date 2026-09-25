import { Temporal } from "@js-temporal/polyfill";

import { YUN_SECT } from "@/lib/shared/versions";

import { chartAt } from "@/lib/server/pillars";

export type LuckPeriod = {
  readonly id: string;
  readonly formal: boolean;
  readonly pillar: string | null;
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
};

export type LuckSnapshot = {
  readonly forward: boolean;
  readonly start: Temporal.Instant;
  readonly periods: readonly LuckPeriod[];
  readonly currentId: string | null;
};

function addYears(instant: Temporal.Instant, years: number): Temporal.Instant {
  const zoned = instant.toZonedDateTimeISO("+08:00");
  const next = zoned.toPlainDateTime().add({ years }, { overflow: "constrain" });
  return next.toZonedDateTime("+08:00").toInstant();
}

export function luckAt(birth: Temporal.Instant, gender: 0 | 1, asOf: Temporal.Instant): LuckSnapshot {
  const { eight } = chartAt(birth);
  const yun = eight.getYun(gender, YUN_SECT);
  const startSolar = yun.getStartSolar();
  const start = Temporal.ZonedDateTime.from({
    timeZone: "+08:00",
    year: startSolar.getYear(),
    month: startSolar.getMonth(),
    day: startSolar.getDay(),
    hour: startSolar.getHour(),
    minute: startSolar.getMinute(),
    second: startSolar.getSecond(),
  }).toInstant();
  const daYun = yun.getDaYun(16);
  const periods: LuckPeriod[] = [{
    id: "before-start",
    formal: false,
    pillar: null,
    start: birth,
    end: start,
  }];
  let cursor = start;
  for (let index = 1; index < daYun.length; index += 1) {
    const item = daYun[index];
    if (!item) continue;
    const end = addYears(cursor, 10);
    periods.push({
      id: `dayun-${index}`,
      formal: true,
      pillar: item.getGanZhi() || null,
      start: cursor,
      end,
    });
    cursor = end;
  }
  const current = periods.find((period) =>
    Temporal.Instant.compare(asOf, period.start) >= 0 && Temporal.Instant.compare(asOf, period.end) < 0,
  );
  return { forward: yun.isForward(), start, periods, currentId: current?.id ?? null };
}

export function periodById(snapshot: LuckSnapshot, id: string | null): LuckPeriod | null {
  if (!id) return null;
  return snapshot.periods.find((period) => period.id === id) ?? null;
}
