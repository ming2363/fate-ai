"use client";

import { useEffect, useRef, useState } from "react";

import type { FormState } from "@/components/BirthForm";
import { OTHER_CITIES, PROVINCES } from "@/lib/shared/cities";

export function BirthPlacePicker({ form, errors, onChange }: {
  readonly form: FormState;
  readonly errors: Readonly<Record<string, string>>;
  readonly onChange: (next: FormState) => void;
}) {
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<"province" | "city">("province");
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstOption = useRef<HTMLButtonElement>(null);
  const province = PROVINCES.find((item) => item.code === form.provinceCode);
  const cities = form.provinceCode === "other" ? OTHER_CITIES : province?.cities ?? [];
  const city = cities.find((item) => item.id === form.cityId);
  const label = city ? `${province?.name ?? "境外或列表外地点"} · ${city.name}`
    : form.provinceCode === "other" && form.timeZone ? `境外或列表外地点 · ${form.timeZone}`
      : province ? `${province.name} · 请选择城市`
        : form.provinceCode === "other" ? "境外或列表外地点 · 请选择城市或时区"
          : "请选择省份与城市";

  useEffect(() => {
    if (!open) return;
    firstOption.current?.focus();
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open, stage]);

  return <div className="birth-place-picker" ref={root} onKeyDown={(event) => { if (event.key === "Escape" && open) { setOpen(false); trigger.current?.focus(); } }}>
    <button id="birth-place" ref={trigger} type="button" className="picker-trigger" aria-haspopup="dialog" aria-expanded={open} aria-invalid={Boolean(errors["birthPlace.cityId"] || errors["birthPlace.timeZone"])} aria-describedby={["birth-place-hint", errors["birthPlace.cityId"] && "birthPlace.cityId-error", errors["birthPlace.timeZone"] && "birthPlace.timeZone-error"].filter(Boolean).join(" ")} onClick={() => { setStage(form.provinceCode ? "city" : "province"); setOpen((value) => !value); }}>
      <span>{label}</span><span className="picker-chevron" aria-hidden="true" />
    </button>
    {open ? <><button className="picker-backdrop" type="button" aria-label="关闭出生地点选择" onClick={() => { setOpen(false); trigger.current?.focus(); }} /><div className="picker-popover place-popover" role="dialog" aria-label="选择出生地点">
      <div className="place-step-head">
        {stage === "city" ? <button type="button" className="place-back" onClick={() => setStage("province")}>← 返回省份</button> : null}
        <p className="picker-heading" aria-live="polite">{stage === "province" ? "先选省份／地区" : `再选城市 · ${province?.name ?? "境外或列表外地点"}`}</p>
      </div>
      <div className="place-options" role="group" aria-label={stage === "province" ? "省份／地区" : "城市／地区"}>
        {stage === "province" ? <>
          {PROVINCES.map((item, index) => <button key={item.code} ref={index === 0 ? firstOption : undefined} type="button" aria-pressed={form.provinceCode === item.code} onClick={() => { onChange({ ...form, provinceCode: item.code, cityId: "", timeZone: "", offsetChoice: "" }); setStage("city"); }}>{item.name}</button>)}
          <button type="button" onClick={() => { onChange({ ...form, provinceCode: "other", cityId: "", timeZone: "", offsetChoice: "" }); setStage("city"); }}>境外或列表外地点</button>
        </> : <>
          {cities.map((item, index) => <button key={item.id} ref={index === 0 ? firstOption : undefined} type="button" aria-pressed={form.cityId === item.id} onClick={() => { onChange({ ...form, cityId: item.id, timeZone: item.timeZone, offsetChoice: "" }); setOpen(false); trigger.current?.focus(); }}>{item.name}</button>)}
          {form.provinceCode === "other" ? <button type="button" onClick={() => { onChange({ ...form, cityId: "", timeZone: "", offsetChoice: "" }); setOpen(false); trigger.current?.focus(); }}>不在列表，手动选时区</button> : null}
        </>}
      </div>
    </div></> : null}
  </div>;
}
