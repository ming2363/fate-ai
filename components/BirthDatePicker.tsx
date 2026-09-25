"use client";

import { useEffect, useRef, useState } from "react";

import leaps from "@/data/leap-months.json";
import lunarDays from "@/data/lunar-month-days.json";
import type { FormState } from "@/components/BirthForm";
import { MIN_BIRTH_YEAR } from "@/lib/shared/versions";

function leapMonth(year: string): number {
  return (leaps as Record<string, number>)[year] ?? 0;
}

export function daysInBirthMonth(calendar: FormState["calendar"], year: string, month: string, isLeapMonth: boolean): number {
  const y = Number(year);
  const m = Number(month);
  if (!Number.isInteger(y) || !Number.isInteger(m) || y < MIN_BIRTH_YEAR || m < 1 || m > 12) return 0;
  if (calendar === "solar") return new Date(Date.UTC(y, m, 0)).getUTCDate();
  const months = (lunarDays as Record<string, number[]>)[year];
  if (!months || (isLeapMonth && leapMonth(year) !== m)) return 0;
  const leap = leapMonth(year);
  return months[m - 1 + (leap && m > leap ? 1 : 0) + (isLeapMonth ? 1 : 0)] ?? 0;
}

export function BirthDatePicker({ form, errors, onChange }: {
  readonly form: FormState;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (next: FormState) => void;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const yearSelect = useRef<HTMLSelectElement>(null);
  const calendarLabel = form.calendar === "solar" ? "公历（阳历）" : "农历（阴历）";
  const leap = leapMonth(form.year);
  const dayCount = daysInBirthMonth(form.calendar, form.year, form.month, form.isLeapMonth);
  const invalidDay = Boolean(form.day && dayCount && Number(form.day) > dayCount);
  const monthValue = form.calendar === "lunar" && form.isLeapMonth ? `-${form.month}` : form.month;
  const years = Array.from({ length: new Date().getFullYear() - MIN_BIRTH_YEAR + 1 }, (_, index) => String(new Date().getFullYear() - index));
  const label = form.year && form.month && form.day
    ? `${form.year} 年 ${form.isLeapMonth && form.calendar === "lunar" ? "闰" : ""}${form.month} 月 ${form.day} 日`
    : "请选择出生年、月、日";

  useEffect(() => {
    if (!open) return;
    yearSelect.current?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);

  return <div className="birth-date-picker" ref={root} onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); } }}>
    <button id="birth-year" ref={trigger} type="button" className="picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-invalid={Boolean(errors.birthDate || errors["birthDate.isLeapMonth"] || invalidDay)} aria-describedby={["calendar-context", errors.birthDate && "birthDate-error", errors["birthDate.isLeapMonth"] && "birthDate.isLeapMonth-error"].filter(Boolean).join(" ")} onClick={() => setOpen((value) => !value)}>
      <span>{label}</span><span className="picker-chevron" aria-hidden="true" />
    </button>
    {open ? <><button className="picker-backdrop" type="button" aria-label="关闭日期选择" onClick={() => { setOpen(false); trigger.current?.focus(); }} /><div className="picker-popover date-popover" role="dialog" aria-label={`${calendarLabel}出生日期选择`}>
      <p className="picker-heading">选择{calendarLabel}日期</p>
      <div className="picker-select-row">
        <label>年份<select ref={yearSelect} id="birth-year-select" value={form.year} onChange={(event) => {
          const year = event.target.value;
          onChange({ ...form, year, isLeapMonth: form.isLeapMonth && leapMonth(year) === Number(form.month) });
        }}><option value="">请选择年</option>{years.map((year) => <option key={year} value={year}>{year} 年</option>)}</select></label>
        <label>月份<select value={monthValue} disabled={!form.year} onChange={(event) => {
          const signed = Number(event.target.value);
          onChange({ ...form, month: event.target.value ? String(Math.abs(signed)) : "", isLeapMonth: signed < 0 });
        }}><option value="">请选择月</option>{Array.from({ length: 12 }, (_, index) => index + 1).flatMap((month) => [
          <option key={month} value={month}>{month} 月</option>,
          ...(form.calendar === "lunar" && leap === month ? [<option key={`leap-${month}`} value={`-${month}`}>闰{month}月</option>] : []),
        ])}</select></label>
      </div>
      <p className="picker-subheading">选择日期</p>
      <div className="picker-day-grid" role="group" aria-label="日期">
        {Array.from({ length: dayCount }, (_, index) => String(index + 1)).map((day) => <button key={day} type="button" aria-pressed={form.day === day} onClick={() => { onChange({ ...form, day }); setOpen(false); trigger.current?.focus(); }}>{day}</button>)}
      </div>
      {!dayCount ? <p className="hint">先选择年份和月份，再选择日期。</p> : null}
      <button type="button" className="picker-close" onClick={() => { setOpen(false); trigger.current?.focus(); }}>完成</button>
    </div></> : null}
    {invalidDay ? <p className="error" role="alert">{calendarLabel}的这个月没有 {form.day} 日，请重新选择。</p> : null}
  </div>;
}
