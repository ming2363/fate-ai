import { Temporal } from "@js-temporal/polyfill";
import { Solar } from "lunar-javascript";
import type { EightCharLike } from "lunar-javascript";

import { DAY_PILLAR_SECT } from "@/lib/shared/versions";

import type { UtcInterval } from "@/lib/server/time";
import { jieEvents } from "@/lib/server/terms";

export type PillarSample = {
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly time: string;
  readonly dayGan: string;
  readonly yearShiShen: string;
  readonly monthShiShen: string;
  readonly timeShiShen: string;
};

const HOUR_BOUNDARIES = [0, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23] as const;

export function chartAt(instant: Temporal.Instant): { readonly sample: PillarSample; readonly eight: EightCharLike } {
  const zoned = instant.toZonedDateTimeISO("+08:00");
  const solar = Solar.fromYmdHms(zoned.year, zoned.month, zoned.day, zoned.hour, zoned.minute, zoned.second);
  if (solar.getYear() !== zoned.year || solar.getMonth() !== zoned.month || solar.getDay() !== zoned.day) {
    throw new Error("排盘库改写了公历日期");
  }
  const eight = solar.getLunar().getEightChar();
  eight.setSect(DAY_PILLAR_SECT);
  return {
    eight,
    sample: {
      year: eight.getYear(),
      month: eight.getMonth(),
      day: eight.getDay(),
      time: eight.getTime(),
      dayGan: eight.getDayGan(),
      yearShiShen: eight.getYearShiShenGan(),
      monthShiShen: eight.getMonthShiShenGan(),
      timeShiShen: eight.getTimeShiShenGan(),
    },
  };
}

function boundaryInstants(range: UtcInterval): Temporal.Instant[] {
  const startYear = range.start.toZonedDateTimeISO("+08:00").year;
  const endYear = range.end.toZonedDateTimeISO("+08:00").year;
  const points = [range.start];
  for (const event of jieEvents(startYear - 1, endYear + 1)) {
    if (Temporal.Instant.compare(event.instant, range.start) > 0 && Temporal.Instant.compare(event.instant, range.end) < 0) {
      points.push(event.instant);
    }
  }
  let day = range.start.toZonedDateTimeISO("+08:00").toPlainDate().add({ days: -1 });
  const last = range.end.toZonedDateTimeISO("+08:00").toPlainDate().add({ days: 1 });
  while (Temporal.PlainDate.compare(day, last) <= 0) {
    for (const hour of HOUR_BOUNDARIES) {
      const instant = Temporal.ZonedDateTime.from({
        timeZone: "+08:00",
        year: day.year,
        month: day.month,
        day: day.day,
        hour,
        minute: 0,
        second: 0,
      }).toInstant();
      if (Temporal.Instant.compare(instant, range.start) > 0 && Temporal.Instant.compare(instant, range.end) < 0) {
        points.push(instant);
      }
    }
    day = day.add({ days: 1 });
  }
  return [...new Map(points.map((point) => [point.toString(), point])).values()].sort((left, right) =>
    Temporal.Instant.compare(left, right),
  );
}

export function samplePillars(ranges: readonly UtcInterval[]): readonly PillarSample[] {
  return ranges.flatMap((range) => boundaryInstants(range).map((instant) => chartAt(instant).sample));
}
