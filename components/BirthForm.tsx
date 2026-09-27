"use client";

import { BirthDatePicker } from "@/components/BirthDatePicker";
import { BirthPlacePicker } from "@/components/BirthPlacePicker";
import { MANUAL_TIME_ZONES } from "@/lib/shared/cities";
import { SHICHEN } from "@/lib/shared/shichen";
import { MBTI_TYPES, type MbtiType } from "@/lib/shared/mbti";

export type FormState = {
  readonly nickname: string;
  readonly cardNickname: boolean;
  readonly calendar: "solar" | "lunar";
  readonly year: string;
  readonly month: string;
  readonly day: string;
  readonly isLeapMonth: boolean;
  readonly precision: "minute" | "shichen" | "unknown";
  readonly timeValue: string;
  readonly shichen: string;
  readonly gender: "male" | "female" | "";
  readonly provinceCode: string;
  readonly cityId: string;
  readonly timeZone: string;
  readonly offsetChoice: string;
  readonly focus: "general" | "career" | "relationship" | "finance";
  readonly question: string;
  readonly mbti: MbtiType | "";
};

export const INITIAL_FORM: FormState = {
  nickname: "",
  cardNickname: false,
  calendar: "solar",
  year: "",
  month: "",
  day: "",
  isLeapMonth: false,
  precision: "minute",
  timeValue: "",
  shichen: "wu",
  gender: "",
  provinceCode: "",
  cityId: "",
  timeZone: "",
  offsetChoice: "",
  focus: "general",
  question: "",
  mbti: "",
};

function isFocus(value: string): value is FormState["focus"] {
  return value === "general" || value === "career" || value === "relationship" || value === "finance";
}

export function BirthForm({
  form,
  errors,
  offsetOptions,
  pending,
  onChange,
  onSubmit,
}: {
  readonly form: FormState;
  readonly errors: Readonly<Record<string, string>>;
  readonly offsetOptions: readonly string[];
  readonly pending: boolean;
  readonly onChange: (next: FormState) => void;
  readonly onSubmit: () => void;
}) {
  const calendarLabel = form.calendar === "solar" ? "公历（阳历）" : "农历（阴历）";
  const error = (path: string) => errors[path] ? <p className="error" id={`${path}-error`} role="alert">{errors[path]}</p> : null;
  return (
    <form className="sheet" onSubmit={(event) => { event.preventDefault(); onSubmit(); }}>
      <div className="form-head">
        <span className="form-number">01 / 生辰信息</span>
        <h2>从出生的那一刻说起</h2>
        <p>填好几项信息，先排盘，再读你的性格与当下。</p>
      </div>
      <div className="date-combo" role="group" aria-labelledby="birth-date-title">
        <p className="date-title" id="birth-date-title">出生日期 <span className="req">*</span></p>
        <p className="date-intro">先确认出生记录上的历法，再选择对应的年月日。</p>
        <div className="calendar-switch" role="radiogroup" aria-label="出生日期使用的历法">
          <label><input type="radio" name="calendar" value="solar" checked={form.calendar === "solar"} onChange={() => onChange({ ...form, calendar: "solar" })} /><span>公历<small>阳历</small></span></label>
          <label><input type="radio" name="calendar" value="lunar" checked={form.calendar === "lunar"} onChange={() => onChange({ ...form, calendar: "lunar" })} /><span>农历<small>阴历</small></span></label>
        </div>
        <div className="date-panel">
          <p className="date-context" id="calendar-context">正在填写 <strong>{calendarLabel}</strong> 出生日期</p>
          <BirthDatePicker form={form} errors={errors} onChange={onChange} />
        {error("birthDate")}
        {error("birthDate.isLeapMonth")}
        </div>
        <p className="hint calendar-reset-note">切换历法会保留年月日数字，请核对它们是否符合出生记录；不会自动换算日期。</p>
      </div>
      <fieldset className="field time-field">
        <legend className="legend">出生时间 <span className="req">*</span></legend>
        <div className="segments precision-segments">
          <label><input type="radio" name="precision" value="minute" checked={form.precision === "minute"} onChange={() => onChange({ ...form, precision: "minute" })} />知道具体时间</label>
          <label><input type="radio" name="precision" value="shichen" checked={form.precision === "shichen"} onChange={() => onChange({ ...form, precision: "shichen", offsetChoice: "" })} />只知道时辰</label>
          <label><input type="radio" name="precision" value="unknown" checked={form.precision === "unknown"} onChange={() => onChange({ ...form, precision: "unknown", offsetChoice: "" })} />不清楚</label>
        </div>
        {form.precision === "minute" ? <input id="birth-time" className="birth-time-input" type="time" aria-label="出生时间（时、分）" aria-invalid={Boolean(errors["birthTime.value"])} aria-describedby={errors["birthTime.value"] ? "birthTime.value-error" : undefined} value={form.timeValue} onChange={(event) => onChange({ ...form, timeValue: event.target.value })} /> : null}
        {form.precision === "shichen" ? (
          <select aria-label="时辰" value={form.shichen} onChange={(event) => onChange({ ...form, shichen: event.target.value })}>
            {SHICHEN.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        ) : null}
        <p className="hint">知道时、分就填写具体时间；不确定时可选时辰或“不清楚”。</p>
        {error("birthTime.value")}
        {error("birthTime")}
      </fieldset>
      <fieldset className="field gender-field">
        <legend className="legend">排盘性别 <span className="req">*</span></legend>
        <div className="segments gender-segments">
          <label><input id="gender-male" type="radio" name="gender" value="male" checked={form.gender === "male"} onChange={() => onChange({ ...form, gender: "male" })} />男</label>
          <label><input type="radio" name="gender" value="female" checked={form.gender === "female"} onChange={() => onChange({ ...form, gender: "female" })} />女</label>
        </div>
        <p className="hint">仅用于传统排运规则。</p>
        {error("genderForCalculation")}
      </fieldset>
      <div className="field place-field">
        <p className="place-title">出生地点 <span className="req">*</span></p>
        <BirthPlacePicker form={form} errors={errors} onChange={onChange} />
        {form.provinceCode === "65" && form.cityId ? (
          <div className="zone-field">
            <label htmlFor="birth-zone">出生时钟表采用</label>
            <select id="birth-zone" value={form.timeZone} onChange={(event) => onChange({ ...form, timeZone: event.target.value, offsetChoice: "" })}>
              <option value="Asia/Urumqi">新疆时间</option>
              <option value="Asia/Shanghai">北京时间</option>
            </select>
          </div>
        ) : null}
        {form.provinceCode === "other" && !form.cityId ? (
          <div className="zone-field">
            <label htmlFor="birth-zone">出生时使用的时区 <span className="req">*</span></label>
            <select id="birth-zone" value={form.timeZone} aria-invalid={Boolean(errors["birthPlace.timeZone"])} aria-describedby={errors["birthPlace.timeZone"] ? "birthPlace.timeZone-error" : undefined} onChange={(event) => onChange({ ...form, timeZone: event.target.value, offsetChoice: "" })}>
              <option value="">请选择时区</option>
              {MANUAL_TIME_ZONES.map((zone) => <option key={zone} value={zone}>{zone}</option>)}
            </select>
          </div>
        ) : null}
        <p className="hint" id="birth-place-hint">{form.provinceCode === "65" ? "新疆地区请按出生记录实际采用的钟表时间选择。" : "按出生地当年的时区计算；找不到城市可选“境外或列表外地点”。"}</p>
        {error("birthPlace.timeZone")}
        {error("birthPlace.cityId")}
      </div>
      {offsetOptions.length > 0 ? (
        <fieldset className="field">
          <legend className="legend">这个钟点出现了两次</legend>
          <div className="segments">
            {offsetOptions.map((offset) => (
              <label key={offset}><input type="radio" name="offset" value={offset} checked={form.offsetChoice === offset} onChange={() => onChange({ ...form, offsetChoice: offset })} />{offset}</label>
            ))}
          </div>
          {error("birthPlace.offsetChoice")}
        </fieldset>
      ) : null}
      <details className="optional-fields">
        <summary>称呼、MBTI 或关注的问题 <span>选填</span></summary>
        <div className="field"><label htmlFor="nickname">怎么称呼你 <span className="hint">选填 · 最多 20 字</span></label><input id="nickname" maxLength={20} value={form.nickname} onChange={(event) => onChange({ ...form, nickname: event.target.value })} /><label className="nickname-option"><input type="checkbox" checked={form.cardNickname} onChange={(event) => onChange({ ...form, cardNickname: event.target.checked })} />也显示在可保存的人格卡上</label></div>
        <div className="field">
          <label htmlFor="focus">关注方向</label>
          <select id="focus" value={form.focus} onChange={(event) => {
          if (isFocus(event.target.value)) onChange({ ...form, focus: event.target.value });
          }}>
          <option value="general">综合</option>
          <option value="career">事业</option>
          <option value="relationship">感情</option>
          <option value="finance">财运</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="question">具体困惑 <span className="hint">最多 200 字</span></label>
          <textarea id="question" maxLength={200} value={form.question} onChange={(event) => onChange({ ...form, question: event.target.value.slice(0, 200) })} />
        </div>
        <div className="field">
          <label htmlFor="mbti">你的 MBTI <span className="hint">选填 · 16 型自测结果</span></label>
          <select id="mbti" value={form.mbti} onChange={(event) => onChange({ ...form, mbti: event.target.value as MbtiType | "" })}>
            <option value="">不填写</option>
            {MBTI_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <p className="hint">用于补充自我观察与建议，不参与八字和星座计算。</p>
        </div>
      </details>
      <div className="form-actions">
        <button className="primary" type="submit" disabled={pending}><span>{pending ? "正在排盘" : "开始解读"}</span><span aria-hidden="true">↗</span></button>
        <p className="form-assurance">无需注册 · 信息只用于本次解读</p>
      </div>
    </form>
  );
}
