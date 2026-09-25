import { Temporal } from "@js-temporal/polyfill";
import { Lunar, LunarYear } from "lunar-javascript";

import { findCity } from "@/lib/shared/cities";
import { findShichen } from "@/lib/shared/shichen";
import type { BirthInput } from "@/lib/shared/schemas";
import { CHART_OFFSET, MIN_BIRTH_YEAR } from "@/lib/shared/versions";

import { FieldInputError } from "@/lib/server/errors";

export type UtcInterval = {
  readonly start: Temporal.Instant;
  readonly end: Temporal.Instant;
  readonly offset: string;
};

export type ResolvedBirth = {
  readonly timeZone: string;
  readonly solarYear: number;
  readonly solarMonth: number;
  readonly solarDay: number;
  readonly lunarLabel: string | null;
  readonly precision: BirthInput["birthTime"]["precision"];
  readonly ranges: readonly UtcInterval[];
  readonly clipped: boolean;
};

const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

export function daysInMonth(year: number, month: number): number {
  return Temporal.PlainDate.from({ year, month, day: 1 }).daysInMonth;
}

export function assertSolarDate(year: number, month: number, day: number, fieldPath: string): void {
  if (year < MIN_BIRTH_YEAR || month < 1 || month > 12) {
    throw new FieldInputError(fieldPath, "出生日期超出首版可计算范围。");
  }
  const maxDay = daysInMonth(year, month);
  if (day < 1 || day > maxDay) {
    throw new FieldInputError(fieldPath, "这个公历日期不存在，请修正后再排盘。");
  }
}

function lunarToSolar(input: BirthInput): { year: number; month: number; day: number; label: string } {
  const { year, month, day, isLeapMonth } = input.birthDate;
  if (year < 1899 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 30) {
    throw new FieldInputError("birthDate", "农历日期无效。");
  }
  const leap = LunarYear.fromYear(year).getLeapMonth();
  if (isLeapMonth && leap !== month) {
    throw new FieldInputError("birthDate.isLeapMonth", leap === 0 ? "这一年没有闰月。" : `这一年的闰月是闰${leap}月。`);
  }
  const lunarMonth = isLeapMonth ? -month : month;
  let lunar;
  try {
    lunar = Lunar.fromYmd(year, lunarMonth, day);
  } catch (error) {
    if (error instanceof Error) {
      throw new FieldInputError("birthDate", "农历日期无效，请检查闰月和日数。");
    }
    throw error;
  }
  if (lunar.getYear() !== year || lunar.getMonth() !== lunarMonth || lunar.getDay() !== day) {
    throw new FieldInputError("birthDate", "农历日期被自动进位，已拒绝。");
  }
  const solar = lunar.getSolar();
  return {
    year: solar.getYear(),
    month: solar.getMonth(),
    day: solar.getDay(),
    label: `农历${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}${lunar.getDayInChinese()}`,
  };
}

function resolveTimeZone(input: BirthInput): string {
  const { cityId, timeZone } = input.birthPlace;
  if (cityId) {
    const city = findCity(cityId);
    if (!city) throw new FieldInputError("birthPlace.cityId", "没有找到这个城市，请改选手动时区。");
    if (city.timeZone !== timeZone) {
      throw new FieldInputError("birthPlace.timeZone", "城市和时区不一致。");
    }
    return city.timeZone;
  }
  try {
    Temporal.PlainDateTime.from("2020-06-01T12:00:00").toZonedDateTime(timeZone, { disambiguation: "compatible" });
  } catch (error) {
    if (error instanceof Error) {
      throw new FieldInputError("birthPlace.timeZone", "时区名称无效，请从列表中选择。");
    }
    throw error;
  }
  return timeZone;
}

function clockParts(value: string, withSecond: boolean): { hour: number; minute: number; second: number } {
  const matched = CLOCK.exec(value);
  if (!matched) throw new FieldInputError("birthTime.value", "时间格式应为 HH:mm 或 HH:mm:ss。");
  const hour = Number(matched[1]);
  const minute = Number(matched[2]);
  const secondText = matched[3];
  if (withSecond && secondText === undefined) {
    throw new FieldInputError("birthTime.value", "精确到秒时请填写 HH:mm:ss。");
  }
  if (!withSecond && secondText !== undefined) {
    throw new FieldInputError("birthTime.value", "只知道分钟时不要填写秒。");
  }
  return { hour, minute, second: secondText === undefined ? 0 : Number(secondText) };
}

function zoneHits(timeZone: string, when: Temporal.PlainDateTime): readonly { readonly instant: Temporal.Instant; readonly offset: string }[] {
  try {
    const zoned = when.toZonedDateTime(timeZone, { disambiguation: "reject" });
    return [{ instant: zoned.toInstant(), offset: zoned.offset }];
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    const earlier = when.toZonedDateTime(timeZone, { disambiguation: "earlier" });
    const later = when.toZonedDateTime(timeZone, { disambiguation: "later" });
    if (!earlier.toPlainDateTime().equals(when) || !later.toPlainDateTime().equals(when)) return [];
    return [
      { instant: earlier.toInstant(), offset: earlier.offset },
      { instant: later.toInstant(), offset: later.offset },
    ];
  }
}

function resolveExact(
  timeZone: string,
  when: Temporal.PlainDateTime,
  offsetChoice: string | null,
  duration: Temporal.Duration,
): readonly UtcInterval[] {
  const hits = zoneHits(timeZone, when);
  const offsets = hits.map((item) => item.offset);
  if (offsets.length === 0) {
    throw new FieldInputError("birthTime.value", "这个钟点在夏令时跳时中不存在，请改成当时真实存在的时间。", "NONEXISTENT_TIME");
  }
  if (offsets.length > 1 && !offsetChoice) {
    throw new FieldInputError(
      "birthPlace.offsetChoice",
      "这个钟点在时区回拨时出现了两次，请选择当时的偏移。",
      "AMBIGUOUS_OFFSET",
      offsets,
    );
  }
  const offset = offsets.length === 1 ? offsets[0] : offsetChoice;
  if (!offset || !offsets.includes(offset)) {
    throw new FieldInputError("birthPlace.offsetChoice", "所选偏移不是这个时刻的合法候选。", "AMBIGUOUS_OFFSET", offsets);
  }
  if (offsets.length === 1 && offsetChoice && offsetChoice !== offset) {
    throw new FieldInputError("birthPlace.offsetChoice", "这个时刻没有重复，不需要选择偏移。");
  }
  const start = hits.find((item) => item.offset === offset)?.instant ?? null;
  if (!start) throw new FieldInputError("birthTime.value", "无法还原这个出生时刻。");
  return [{ start, end: start.add(duration), offset }];
}

function walkRange(
  timeZone: string,
  start: Temporal.PlainDateTime,
  end: Temporal.PlainDateTime,
): readonly UtcInterval[] {
  const buckets = new Map<string, Temporal.Instant[]>();
  let cursor = start;
  let valid = 0;
  while (Temporal.PlainDateTime.compare(cursor, end) < 0) {
    const hits = zoneHits(timeZone, cursor);
    if (hits.length > 0) valid += 1;
    for (const hit of hits) {
      const list = buckets.get(hit.offset) ?? [];
      list.push(hit.instant);
      buckets.set(hit.offset, list);
    }
    cursor = cursor.add({ minutes: 1 });
  }
  if (valid === 0) {
    throw new FieldInputError("birthTime", "所选时辰全部落在不存在的跳时里，请改选。", "NONEXISTENT_TIME");
  }
  const ranges: UtcInterval[] = [];
  for (const [offset, instants] of buckets) {
    const sorted = [...instants].sort((left, right) => Temporal.Instant.compare(left, right));
    const first = sorted[0];
    if (!first) continue;
    let runStart = first;
    let previous = first;
    for (const current of sorted.slice(1)) {
      if (current.epochMilliseconds - previous.epochMilliseconds !== 60_000) {
        ranges.push({ start: runStart, end: previous.add({ minutes: 1 }), offset });
        runStart = current;
      }
      previous = current;
    }
    ranges.push({ start: runStart, end: previous.add({ minutes: 1 }), offset });
  }
  return ranges.sort((left, right) => Temporal.Instant.compare(left.start, right.start));
}

export function resolveBirth(input: BirthInput, asOf: Temporal.Instant): ResolvedBirth {
  const timeZone = resolveTimeZone(input);
  const solar = input.calendar === "solar"
    ? { year: input.birthDate.year, month: input.birthDate.month, day: input.birthDate.day, label: null }
    : lunarToSolar(input);
  if (input.calendar === "solar" && input.birthDate.isLeapMonth) {
    throw new FieldInputError("birthDate.isLeapMonth", "公历没有闰月。");
  }
  assertSolarDate(solar.year, solar.month, solar.day, "birthDate");
  const date = Temporal.PlainDate.from(solar);
  if (Temporal.PlainDate.compare(date, Temporal.PlainDate.from("1900-01-01")) < 0) {
    throw new FieldInputError("birthDate", "首版只接受公历 1900-01-01 及之后的出生日期。");
  }
  const offsetChoice = input.birthPlace.offsetChoice;
  let ranges: readonly UtcInterval[];
  if (input.birthTime.precision === "second" || input.birthTime.precision === "minute") {
    const parts = clockParts(input.birthTime.value, input.birthTime.precision === "second");
    const when = date.toPlainDateTime(parts);
    const duration = input.birthTime.precision === "second" ? { seconds: 1 } : { minutes: 1 };
    ranges = resolveExact(timeZone, when, offsetChoice, Temporal.Duration.from(duration));
  } else if (input.birthTime.precision === "shichen") {
    if (offsetChoice) throw new FieldInputError("birthPlace.offsetChoice", "只知时辰时不用选择重复时刻偏移。");
    const shichen = findShichen(input.birthTime.shichen);
    if (!shichen) throw new FieldInputError("birthTime.shichen", "时辰选项无效。");
    const [startHour, startMinute] = shichen.start.split(":").map(Number);
    const start = date.toPlainDateTime({ hour: startHour, minute: startMinute });
    const end = shichen.end === "24:00" ? date.add({ days: 1 }).toPlainDateTime() : date.toPlainDateTime({
      hour: Number(shichen.end.slice(0, 2)),
      minute: Number(shichen.end.slice(3, 5)),
    });
    ranges = walkRange(timeZone, start, end);
  } else {
    if (offsetChoice) throw new FieldInputError("birthPlace.offsetChoice", "时间不详时不用选择重复时刻偏移。");
    ranges = walkRange(timeZone, date.toPlainDateTime(), date.add({ days: 1 }).toPlainDateTime());
  }
  const clippedRanges = ranges
    .map((range) => ({ ...range, end: Temporal.Instant.compare(range.end, asOf) > 0 ? asOf : range.end }))
    .filter((range) => Temporal.Instant.compare(range.start, range.end) < 0);
  if (clippedRanges.length === 0) {
    throw new FieldInputError("birthDate", "出生时间不能晚于现在。", "FUTURE_BIRTH");
  }
  return {
    timeZone,
    solarYear: solar.year,
    solarMonth: solar.month,
    solarDay: solar.day,
    lunarLabel: solar.label,
    precision: input.birthTime.precision,
    ranges: clippedRanges,
    clipped: ranges.some((range) => Temporal.Instant.compare(range.end, asOf) > 0),
  };
}

export function beijingFields(instant: Temporal.Instant): Temporal.ZonedDateTime {
  return instant.toZonedDateTimeISO(CHART_OFFSET);
}

export function formatZoned(instant: Temporal.Instant, timeZone: string): string {
  const zoned = instant.toZonedDateTimeISO(timeZone);
  const plain = zoned.toPlainDateTime().toString({ smallestUnit: "second" });
  return `${plain} ${zoned.offset} ${timeZone}`;
}

export function formatBeijing(instant: Temporal.Instant): string {
  const zoned = beijingFields(instant);
  return `${zoned.toPlainDateTime().toString({ smallestUnit: "second" })} 北京时间（UTC+08:00）`;
}
