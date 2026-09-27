"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ZodError } from "zod";

import { BirthForm, INITIAL_FORM, type FormState } from "@/components/BirthForm";
import { PersonaCard, PersonaSummary, type CardView } from "@/components/PersonaCard";
import { useReport, reportRequest } from "@/components/useReport";
import { activeTask } from "@/lib/shared/report";
import { ReportDialog } from "@/components/ReportDialog";
import { ZodiacPanel } from "@/components/ZodiacPanel";
import { AnalysisBasis } from "@/components/AnalysisBasis";
import { GlossaryText } from "@/components/GlossaryText";
import { FestivalLabel, FestivalOrnaments } from "@/components/FestivalDecor";
import { CITIES, PROVINCES } from "@/lib/shared/cities";
import { findShichen } from "@/lib/shared/shichen";
import type { ChartFacts, ReadingTaskId } from "@/lib/shared/chart-types";
import { copyReport, tryCopyText } from "@/lib/shared/copy-report";
import { annualStatusMessage, readableMoment } from "@/lib/shared/display";
import { birthInputSchema, type BirthInput } from "@/lib/shared/schemas";
import { SITE_NAME } from "@/lib/shared/versions";
import type { FestivalTheme } from "@/lib/shared/festival";

function taskLabel(key: string): string { return ({ identity: "人格与星座", fortune_current: "大运与当年流年", portrait: "国风人物画", mbti: "MBTI侧写" } as Record<string, string>)[key] ?? (key.startsWith("annual_") ? key.slice(7) + "年流年" : "报告追问"); }

type Phase = "idle" | "charting" | "waiting" | "thinking" | "answering" | "validating" | "done" | "failed" | "cancelled";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function payloadOf(form: FormState): BirthInput {
  const selectedCity = CITIES.find((city) => city.id === form.cityId);
  return birthInputSchema.parse({
    calendar: form.calendar,
    birthDate: {
      year: Number(form.year),
      month: Number(form.month),
      day: Number(form.day),
      isLeapMonth: form.calendar === "lunar" && form.isLeapMonth,
    },
    birthTime: form.precision === "shichen"
      ? { precision: "shichen", value: null, shichen: form.shichen }
      : form.precision === "unknown"
        ? { precision: "unknown", value: null, shichen: null }
        : { precision: "minute", value: form.timeValue, shichen: null },
    genderForCalculation: form.gender,
    birthPlace: {
      cityId: selectedCity?.timeZone === form.timeZone ? form.cityId : null,
      timeZone: form.timeZone,
      offsetChoice: form.offsetChoice || null,
    },
  });
}

function cardOf(chart: ChartFacts, sentence: string): CardView {
  const zodiacLabel = chart.zodiac.status === "determined" && chart.zodiac.sign
    ? `${chart.zodiac.sign.name}${chart.zodiac.nearBoundary ? " · 交界附近" : ""}`
    : chart.zodiac.candidates.length > 1
      ? `星座待确认：${chart.zodiac.candidates.map((item) => item.name).join(" / ")}`
      : "星座待确认";
  return {
    typeLabel: chart.persona.typeLabel,
    title: chart.persona.title,
    keywords: chart.persona.keywords,
    element: chart.persona.element,
    image: chart.persona.image,
    zodiacLabel,
    sentence,
  };
}

function luckYears(startLabel: string, endLabel: string): string {
  const start = startLabel.match(/^\d{4}/)?.[0];
  const end = endLabel.match(/^\d{4}/)?.[0];
  return start && end ? `${start}—${end}` : "";
}

type PlaceholderKind = "overview" | "personality" | "zodiac" | "luck" | "annual" | "basis";

function LoadingSection({ marker, title, kind }: { readonly marker: string; readonly title: string; readonly kind: PlaceholderKind }) {
  const blocks = 1;
  return <section className={`reading result-placeholder result-placeholder-${kind}`} aria-label={`${title}正在准备`} aria-busy="true">
    <h2><span className="idx">{marker}</span>{title}</h2>
    <p>正在准备这部分解读</p>
    <div className="placeholder-content" aria-hidden="true">{Array.from({ length: blocks }, (_, index) => <div className="placeholder-lines" key={index}><span /><span /><span /><span /></div>)}</div>
  </section>;
}

function LoadingSummary() {
  return <section className="persona-summary persona-summary-placeholder" aria-label="中式人格正在准备" aria-busy="true">
    <div><p className="kicker">中式人格 · 中式MBTI</p><div className="placeholder-lines" aria-hidden="true"><span /><span /><span /></div></div>
    <p className="sentence">人格信息准备中</p>
  </section>;
}

function LoadingPortrait({ status, loading = false, onRetry }: { readonly status: string; readonly loading?: boolean; readonly onRetry?: () => void }) {
  return <section className={`persona-placeholder${loading ? " is-loading" : ""}`} aria-label="国风人格卡" aria-busy={loading}>
    <span className="persona-placeholder-mark" aria-hidden="true">命</span>
    <div><p className="kicker">中式MBTI人格卡</p>{loading ? <span className="portrait-spinner" aria-hidden="true" /> : null}<strong role="status">{status}</strong><p>{loading ? "解读可先阅读，画作完成后会自动呈现" : onRetry ? "可单独重试，不影响已有解读" : "完成后将在这里呈现"}</p>{onRetry ? <button type="button" className="quiet" onClick={onRetry}>重试绘制人格卡</button> : null}</div>
  </section>;
}

export function FateApp() {
  const controller = useReport();
  const { report } = controller;
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [offsetOptions, setOffsetOptions] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [annualYear, setAnnualYear] = useState<number | null>(null);
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const [copyPreview, setCopyPreview] = useState<string | null>(null);
  const [cardExporting, setCardExporting] = useState(false);
  const [followup, setFollowup] = useState("");
  const [festival, setFestival] = useState<FestivalTheme | null>(null);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(""), 6000); return () => clearTimeout(timer); }, [message]);
  const chart = report?.chart ?? null;
  const reading = report?.reading ?? null;
  const showForm = !report;
  const pendingTasks = Object.entries(report?.tasks ?? {}).filter(([, task]) => activeTask(task));
  const phase: Phase = controller.busy ? "charting" : pendingTasks.length ? "thinking" : report ? "done" : "idle";
  const taskPhase = { identity: report?.tasks.identity?.status === "completed" ? "done" : "waiting", fortune: report?.tasks.fortune_current?.status === "completed" ? "done" : "waiting" };
  const taskErrors = { identity: report?.tasks.identity?.error, fortune: report?.tasks.fortune_current?.error };
  const mbtiError = report?.tasks.mbti?.error ?? "";
  const streamMode: string = "parallel";
  const portrait = report?.imageVersion ? BASE_PATH + "/api/reports/" + report.id + "/image?v=" + report.imageVersion : null;
  const portraitTask = report?.tasks.portrait;
  const portraitStatus = activeTask(portraitTask) ? "loading" : portrait ? "ready" : portraitTask?.status === "failed" || portraitTask?.status === "interrupted" ? "failed" : "idle";
  const portraitError = portraitTask?.error ?? "";
  const announcement = pendingTasks.length ? "解读正在生成，已完成的部分可先阅读" : report ? "已完成本次生成" : "";
  const submittedForm: FormState | null = report ? {
    ...INITIAL_FORM, ...report.input, year: String(report.input.birthDate.year), month: String(report.input.birthDate.month), day: String(report.input.birthDate.day),
    isLeapMonth: report.input.birthDate.isLeapMonth, precision: report.input.birthTime.precision === "second" ? "minute" : report.input.birthTime.precision,
    timeValue: report.input.birthTime.value?.slice(0, 5) ?? "", shichen: report.input.birthTime.shichen ?? "wu", gender: report.input.genderForCalculation,
    provinceCode: PROVINCES.find((p) => p.cities.some((c) => c.id === report.input.birthPlace.cityId))?.code ?? "other",
    cityId: report.input.birthPlace.cityId ?? "", timeZone: report.input.birthPlace.timeZone, offsetChoice: report.input.birthPlace.offsetChoice ?? "", mbti: report.input.mbti ?? "",
  } : null;
  useEffect(() => { if (report) setAnnualYear((old) => old ?? report.chart.annuals.currentYear); }, [report]);
  useEffect(() => {
    let live = true;
    void fetch(BASE_PATH + "/api/festival", { cache: "no-store" }).then((r) => r.json()).then((value) => { if (live) setFestival(value); }).catch(() => {});
    return () => { live = false; };
  }, []);
  function editBirth() { if (submittedForm) setForm(submittedForm); controller.reset(); setAnnualYear(null); setMessage(""); window.scrollTo(0, 0); }
  async function submit() {
    setErrors({}); setMessage("");
    try {
      if (!form.year || !form.month || !form.day) { setErrors({ birthDate: "请先选择完整的出生年月日。" }); return; }
      if (!form.gender) { setErrors({ genderForCalculation: "请选择排盘性别。" }); return; }
      if (!form.timeZone || (!form.cityId && form.provinceCode !== "other")) { setErrors({ birthPlace: "请选择出生地。" }); return; }
      const input = payloadOf(form);
      const next = await controller.start({ ...input, focus: form.focus, question: form.question, mbti: form.mbti || null, nickname: form.nickname, cardNickname: form.cardNickname });
      setAnnualYear(next.chart.annuals.currentYear); window.scrollTo(0, 0);
    } catch (e) {
      const error = e as Error & { fieldPath?: string; candidates?: string[] };
      const path = error instanceof ZodError ? error.issues[0]?.path.join(".") : error.fieldPath;
      if (path) setErrors({ [path]: error.message }); else setMessage(error.message || "请求暂未完成，请重试。");
      setOffsetOptions(error.candidates ?? []);
    }
  }
  async function generatePortrait(_facts: ChartFacts) { await controller.mutate({ action: portrait ? "portrait" : "retry", task: "portrait" }); }
  function selectYear(year: number) { setAnnualYear(year); void controller.mutate({ action: "year", year }); }
  async function copyReading() {
    if (!chart || !reading) return;
    const missing: ReadingTaskId[] = [];
    if (report?.tasks.identity?.status !== "completed") missing.push("identity");
    if (report?.tasks.fortune_current?.status !== "completed") missing.push("fortune");
    const selectedYear = annualYear ?? chart.annuals.currentYear;
    const text = copyReport(chart, reading, selectedYear, missing) + (reading.annualReadings.some((item) => item.year === selectedYear && item.status === "generated") ? "" : `\n\n${selectedYear} 年解读尚未完成`);
    if (await tryCopyText(text, navigator.clipboard)) setMessage("解读已复制");
    else setCopyPreview(text);
  }
  async function sendFeedback(module: string, value: string) {
    if (!report) return;
    try { await reportRequest("/api/reports/" + report.id + "/feedback", { module, value }); setMessage("已收到你的反馈，谢谢"); }
    catch (e) { setMessage((e as Error).message); }
  }
  async function saveCard() {
    const node = document.getElementById("persona-card");
    if (!node || cardExporting) return;
    setCardExporting(true);
    try {
      const { toPng } = await import("html-to-image");
      const url = await toPng(node, { pixelRatio: 2, cacheBust: true, style: { margin: "0" } });
      if (/MicroMessenger/i.test(navigator.userAgent)) setCardPreview(url);
      else {
        const link = document.createElement("a");
        link.href = url;
        link.download = "zhiming-card.png";
        link.click();
      }
      void fetch(`${BASE_PATH}/api/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "card_save", historyId: report?.id }) }).catch(() => {});
    } catch (error) {
      if (error instanceof Error) setMessage("人格卡导出失败，请改用系统截图。");
    } finally {
      setCardExporting(false);
    }
  }

  const sentence = reading?.personality.cardSentence?.text ?? (chart?.persona.title ? chart.persona.title + "，" + chart.persona.keywords.join("、") + "。" : "一份自我探索的侧写");
  const annual = chart?.annuals.items.find((item) => item.year === annualYear) ?? null;
  const annualReading = reading?.annualReadings.find((item) => item.year === annualYear) ?? null;
  const identityReady = Boolean(reading && (taskPhase.identity === "done" || (streamMode === "single" && phase === "done")));
  const fortuneReady = Boolean(reading && (taskPhase.fortune === "done" || (streamMode === "single" && phase === "done")));
  const finalPhase = ["done", "failed", "cancelled"].includes(phase);
  const showIdentity = chart !== null;
  const showPersonaCard = Boolean(chart && chart.persona.status === "determined" && portrait);
  const showFortune = chart !== null;
  const resultForm = submittedForm ?? form;
  const birthCity = CITIES.find((city) => city.id === resultForm.cityId);
  const birthProvince = PROVINCES.find((province) => province.code === resultForm.provinceCode);
  const birthPlaceLabel = birthCity
    ? [birthProvince?.name, birthCity.name].filter(Boolean).join(" · ") || birthCity.name
    : "列表外地点（手动选择时区）";
  const birthZone = chart?.timeBasis.birthTimeZone ?? resultForm.timeZone;
  const birthZoneLabel = birthZone === "Asia/Shanghai" ? "北京时间" : birthZone === "Asia/Urumqi" ? "新疆时间" : birthZone;
  const dateLabel = `${resultForm.calendar === "solar" ? "公历" : "农历"} ${resultForm.year}年${resultForm.isLeapMonth && resultForm.calendar === "lunar" ? "闰" : ""}${resultForm.month}月${resultForm.day}日`;
  const timeLabel = resultForm.precision === "minute" ? resultForm.timeValue : resultForm.precision === "shichen" ? findShichen(resultForm.shichen)?.label ?? "时辰待确认" : "出生时间不清楚";
  const focusLabel = { general: "整体解读", career: "事业与学习", relationship: "感情与人际", finance: "财务与积累" }[resultForm.focus];

  return (
    <main className="shell" id="main">
      <header className="site-top">
        <div className="brand"><Image src={`${BASE_PATH}/icon.svg`} alt="" width={44} height={44} unoptimized className="brand-mark" /><span>{SITE_NAME}<small>一纸自观 · 八字解读</small></span></div>
        <span className={`top-note${festival ? " top-note-festival" : ""}`}>{festival ? <FestivalLabel theme={festival} /> : "生辰入纸　见字如你"}</span>
      </header>
      <p className="sr" aria-live="polite">{announcement}</p>
      {showForm ? (
        <div className="entry">
          <section className="hero" aria-labelledby="intro-title">
            <Image src={`${BASE_PATH}/ink-still-life.png`} alt="" fill priority sizes="(max-width: 700px) 100vw, 1200px" className="hero-image" />
            {festival ? <FestivalOrnaments theme={festival} place="hero" /> : null}
            <div className="hero-copy">
              <p className="eyebrow"><span className="eyebrow-line" /> 知命 · 一纸自观</p>
              <h1 id="intro-title">生辰入纸，<br /><em>见字如你。</em></h1>
              <p className="intro-text">从日主性情，读到此刻的大运流年。<br />用清楚的话，写一份属于你的命盘。</p>
            </div>
            <p className="hero-caption">八字 · 中式人格 · 星座交界</p>
          </section>
          <div className="form-overlap">{festival ? <FestivalOrnaments theme={festival} place="form" /> : null}<BirthForm form={form} errors={errors} offsetOptions={offsetOptions} pending={phase === "charting"} onChange={setForm} onSubmit={() => void submit()} /></div>
        </div>
      ) : (
        <div className="result-intro">
          <div><p className="eyebrow"><span className="eyebrow-line" /> 你的命盘</p><h1>{chart?.persona.title ? `${chart.persona.title}，读懂你的节奏。` : "你的命盘，正在展开。"}</h1>{festival ? <FestivalLabel theme={festival} /> : null}</div>
          <button type="button" className="outline-button" onClick={editBirth}>修改出生信息 <span aria-hidden="true">↗</span></button>
        </div>
      )}
      {!showForm ? <section className="result-input" aria-label="本次输入的出生信息">
        <p className="result-input-title">{resultForm.nickname ? resultForm.nickname + "的解读" : "本次解读"}</p><p className="input-summary">{dateLabel} · {timeLabel} · {resultForm.gender === "male" ? "男" : "女"} · {birthPlaceLabel}</p><details><summary>核对完整出生信息</summary>
        <div className="result-input-grid">
          <div><span>出生日期</span><strong>{dateLabel}</strong></div>
          <div><span>出生时间</span><strong>{timeLabel}</strong></div>
          <div><span>排盘性别</span><strong>{resultForm.gender === "male" ? "男" : "女"}</strong></div>
          <div><span>出生地</span><strong>{birthPlaceLabel}</strong></div>
          <div><span>采用时区</span><strong>{birthZoneLabel}</strong></div>
          <div><span>关注方向</span><strong>{focusLabel}</strong></div>
          {resultForm.mbti ? <div><span>自填 MBTI</span><strong>{resultForm.mbti}</strong></div> : null}
        </div>
        {chart ? <p className="result-input-pillars"><span>排出的八字</span><strong>{[chart.bazi.year.value, chart.bazi.month.value, chart.bazi.day.value, chart.bazi.time.value].map((pillar) => pillar ?? "待确认").join(" · ")}</strong></p> : null}
        {resultForm.question.trim() ? <p className="result-input-question"><span>特别想了解</span>{resultForm.question.trim()}</p> : null}
        </details>
        {chart?.persona.status === "determined" && portraitStatus !== "idle" ? <p className={`portrait-progress portrait-progress-${portraitStatus}`} role="status">{portraitStatus === "loading" ? <span className="portrait-spinner" aria-hidden="true" /> : null}{portraitStatus === "loading" ? "国风人格卡绘制中，解读可先看" : portraitStatus === "failed" ? `人物卡暂未生成：${portraitError || "请在结果末尾重试。"}` : "国风人格卡已完成，可在结果末尾查看"}</p> : null}
      </section> : null}
      {!showForm && pendingTasks.length ? <div className="report-progress" role="status"><span className="portrait-spinner" aria-hidden="true" /><span>{pendingTasks.map(([key]) => taskLabel(key)).join("、")}正在准备 · 可以先看已完成的解读</span><button type="button" className="text-button" onClick={() => void controller.mutate({ action: "cancel" })}>停止生成</button></div> : null}
      {controller.restoring ? <p role="status">正在恢复本次报告…</p> : null}
      {controller.error ? <p className="error" role="alert">{controller.error}</p> : null}
      {message ? <p className="report-message" role="status">{message}</p> : null}
      {!showForm && chart && chart.persona.status === "determined" && showIdentity ? <PersonaSummary card={cardOf(chart, sentence)} /> : !showForm && !showIdentity && !finalPhase ? <LoadingSummary /> : null}
      {!showForm && reading ? <ul className="report-highlights">{[reading.personality.strengths[0]?.text, reading.currentLuck.theme?.text, reading.annualReadings.find((a) => a.year === chart?.annuals.currentYear)?.actions[0]?.text].filter(Boolean).map((text) => <li key={text}>{text}</li>)}</ul> : null}
      {!showForm && chart ? <nav className="result-nav" aria-label="报告分区"><a href="#personality">人格</a><a href="#zodiac">星座</a><a href="#luck">大运流年</a><a href="#portrait">人物卡</a></nav> : null}
      {!showForm && chart ? (
        <div className="result-stack">
          {showFortune && reading?.overview.text ? (
            <section className="reading overview">
              <h2><span className="idx">总</span>一句话总览</h2>
              {festival ? <FestivalOrnaments theme={festival} place="overview" /> : null}
              <p><GlossaryText text={reading.overview.text} /></p>
            </section>
          ) : !finalPhase && !fortuneReady ? <LoadingSection marker="总" title="一句话总览" kind="overview" /> : null}
          {showIdentity && reading?.personality.status === "generated" && reading.personality.summary ? (
            <section id="personality" className="reading personality-reading ready">
              <h2><span className="idx">格</span>人格解读</h2>
              <p><GlossaryText text={reading.personality.summary.text} /></p>
              <details className="reading-detail"><summary>优势、提醒与相处建议</summary><div className="insight-grid">
                <div><h3>可发挥</h3>{reading.personality.strengths.map((item) => <p key={item.text}><GlossaryText text={item.text} /></p>)}</div>
                <div><h3>需留意</h3>{reading.personality.blindSpots.map((item) => <p key={item.text}><GlossaryText text={item.text} /></p>)}</div>
              </div>
              {reading.personality.relationshipAdvice ? <p><strong>与人相处　</strong><GlossaryText text={reading.personality.relationshipAdvice.text} /></p> : null}</details><div className="feedback"><span>这部分对你有帮助吗？</span>{["有帮助", "太笼统", "术语看不懂"].map((value) => <button type="button" key={value} onClick={() => void sendFeedback("identity", value)}>{value}</button>)}</div>
            </section>
          ) : !finalPhase && !identityReady ? <LoadingSection marker="格" title="人格解读" kind="personality" /> : showIdentity && chart.persona.status !== "determined" ? (
            <section className="reading personality-reading"><h2><span className="idx">格</span>人格解读</h2><p>日主尚未唯一确定，这里不写专属人格正文。</p></section>
          ) : <section className="reading personality-reading"><h2><span className="idx">格</span>人格解读</h2><p className="module-notice">{taskErrors.identity ?? "人格解读暂未完成。"}</p></section>}
          {resultForm.mbti ? <section className="reading mbti-reading" aria-label="自填 MBTI 解读">
            <h2><span className="idx">型</span>你填写的 MBTI <span className="mbti-type">{resultForm.mbti}</span></h2>
            {reading?.mbtiProfile ? <>
              <p className="mbti-lead">{reading.mbtiProfile.overview}</p>
              <div className="mbti-grid">
                <div><h3>可发挥的偏好</h3><p>{reading.mbtiProfile.strengths}</p></div>
                <div><h3>容易忽略的地方</h3><p>{reading.mbtiProfile.blindSpots}</p></div>
                <div><h3>与人沟通</h3><p>{reading.mbtiProfile.communication}</p></div>
                <div><h3>成长练习</h3><p>{reading.mbtiProfile.growth}</p></div>
              </div>
            </> : mbtiError ? <p className="module-notice">{mbtiError}</p> : <div className="mbti-loading" role="status"><span className="portrait-spinner" aria-hidden="true" />{activeTask(report?.tasks.mbti) ? "正在解读你的 MBTI" : "MBTI 侧写尚未完成，可在下方重试"}</div>}
            {reading?.mbtiNote ? <div className="mbti-synthesis">
              <h3>和中式人格放在一起看</h3>
              <div><strong>相呼应</strong><p>{reading.mbtiNote.commonGround}</p></div>
              <div><strong>不同视角</strong><p>{reading.mbtiNote.difference}</p></div>
              <div><strong>可以试试</strong><p>{reading.mbtiNote.practice}</p></div>
            </div> : !finalPhase && reading?.mbtiProfile ? <p className="module-notice">正在结合八字，整理两种视角的共同点与行动建议…</p> : null}
            <p className="mbti-footnote">MBTI 来自你填写的自测类型；这里用于性格偏好与建议，不改变排盘结果。</p>
          </section> : null}
          {showIdentity ? <ZodiacPanel chart={chart} cultureNote={reading?.zodiacNote?.text} /> : <LoadingSection marker="星" title="太阳星座" kind="zodiac" />}
          {showFortune ? <section id="luck" className={`reading detailed-reading luck-reading${reading?.currentLuck.summary ? " ready" : ""}`}>
            <h2><span className="idx">运</span>当前大运</h2>
            {chart.luck.status === "determined" && chart.luck.current ? (
              <>
                <p className="luck-pillar">{chart.luck.current.formal ? chart.luck.current.pillar : "起运前"}</p>
                {chart.luck.current.formal ? <p className="luck-duration"><strong>这一运约十年</strong><span>{luckYears(chart.luck.current.startLabel, chart.luck.current.endLabel)}</span></p> : null}
                <details className="luck-timing"><summary>查看交运时间{chart.luck.current.startLabel.includes(" 至 ") ? "范围" : ""}</summary>
                  <p><strong>开始　</strong>{readableMoment(chart.luck.current.startLabel)}</p>
                  <p><strong>结束　</strong>{readableMoment(chart.luck.current.endLabel)}</p>
                </details>
                {reading?.currentLuck.theme ? <h3 className="luck-theme">{reading.currentLuck.theme.text}</h3> : null}
                <details className="reading-detail"><summary>展开大运解读与依据</summary>{reading?.currentLuck.summary ? <div className="analysis-section"><h3>这一运的主线与依据</h3><p><GlossaryText text={reading.currentLuck.summary.text} /></p></div> : <p className="module-notice">大运阶段已排定。{taskErrors.fortune ?? (finalPhase ? "AI 正文尚未完成，可在下方重新生成。" : "正在生成详细解读…")}</p>}
                <div className="analysis-columns">
                  {reading?.currentLuck.opportunity ? <div className="analysis-section"><h3>机会与可用方向</h3><p><GlossaryText text={reading.currentLuck.opportunity.text} /></p></div> : null}
                  {reading?.currentLuck.attention ? <div className="analysis-section"><h3>需要留意与如何应对</h3><p><GlossaryText text={reading.currentLuck.attention.text} /></p></div> : null}
                </div>
                <AnalysisBasis chart={chart} prefix="luck.current" /></details>
                <details>
                  <summary>前后大运</summary>
                  {chart.luck.previous ? <p>上一运 {chart.luck.previous.pillar} · {luckYears(chart.luck.previous.startLabel, chart.luck.previous.endLabel)}（约十年）</p> : <p>没有更早的正式大运。</p>}
                  {chart.luck.next ? <p>下一运 {chart.luck.next.pillar} · {luckYears(chart.luck.next.startLabel, chart.luck.next.endLabel)}（约十年）</p> : null}
                </details>
              </>
            ) : <><p>{chart.luck.notice ?? "当前大运待确认。"}</p>{chart.luck.candidates.length ? <p>候选阶段：{[...new Set(chart.luck.candidates.map((item) => item.pillar ?? "起运前"))].join(" / ")}</p> : null}</>}
          </section> : <LoadingSection marker="运" title="当前大运" kind="luck" />}
          {showFortune ? <section className={`reading detailed-reading annual-reading${annualReading?.status === "generated" ? " ready" : ""}`}>
            <h2><span className="idx">年</span>年度流年</h2>
            <div className="tabs" aria-label="流年">
              {chart.annuals.items.map((item) => (
                <button type="button" key={item.year} aria-pressed={item.year === annualYear} onClick={() => selectYear(item.year)}>
                  {item.role === "previous" ? "上一" : item.role === "current" ? "当前" : "下一"} {item.year}
                </button>
              ))}
            </div>
            {annual ? (
              <>
                <p>{annual.year} 流年 {annual.pillar} · {readableMoment(annual.startLabel)} 至 {readableMoment(annual.endLabel)}</p>
                {annualStatusMessage(annual.personalStatus) ? <p className="module-notice">{annualStatusMessage(annual.personalStatus)}</p> : null}
                {annualReading?.status === "generated" ? (
                  <>
                    <details className="reading-detail"><summary>年度主线与命盘关系</summary><div className="analysis-section"><h3>年度主线与命盘关系</h3><p><GlossaryText text={annualReading.summary?.text ?? ""} /></p></div>
                    </details><div className="annual-outlooks"><h3>这一年可能遇到的事</h3><ol>{annualReading.outlooks.map((item) => <li key={item.text}><GlossaryText text={item.text} /></li>)}</ol></div>
                    <details className="reading-detail"><summary>事业、人际与财务详细解读</summary><div className="annual-segments"><h3>放在大运里看这一年</h3>{annualReading.segments.map((segment, index) => <p key={segment.periodId}><strong>{annual.segments[index]?.pillar ?? "起运前"}阶段　</strong><GlossaryText text={segment.summary.text} /></p>)}</div>
                    <div className="analysis-columns">
                      <div className="analysis-section"><h3>事业与学习</h3><p><GlossaryText text={annualReading.career?.text ?? ""} /></p></div>
                      <div className="analysis-section"><h3>感情与人际</h3><p><GlossaryText text={annualReading.relationships?.text ?? ""} /></p></div>
                      <div className="analysis-section"><h3>财务与积累</h3><p><GlossaryText text={annualReading.finance?.text ?? ""} /></p></div>
                    </div></details><div><div className="analysis-section action-section"><h3>可以着手的两件事</h3><ol className="reading-actions">{annualReading.actions.map((item) => <li key={item.text}><GlossaryText text={item.text} /></li>)}</ol></div>
                    </div>
                  </>
                ) : null}
                <AnalysisBasis chart={chart} prefix={`annual.${annual.year}`} />
                {annualReading?.status === "generated" ? <div className="feedback"><span>年度解读反馈</span>{["有帮助", "太笼统", "术语看不懂"].map((value) => <button type="button" key={value} onClick={() => void sendFeedback(annual.year === chart.annuals.currentYear ? "fortune_current" : "annual_" + annual.year, value)}>{value}</button>)}</div> : <p className="module-notice">{report?.tasks[annual.year === chart.annuals.currentYear ? "fortune_current" : "annual_" + annual.year]?.error ?? (activeTask(report?.tasks[annual.year === chart.annuals.currentYear ? "fortune_current" : "annual_" + annual.year]) ? "正在生成这一年的解读…" : "这一年的解读尚未生成。")}</p>}
                {report?.tasks[annual.year === chart.annuals.currentYear ? "fortune_current" : "annual_" + annual.year]?.error ? <button type="button" className="quiet" onClick={() => void controller.mutate({ action: "retry", task: annual.year === chart.annuals.currentYear ? "fortune_current" : "annual_" + annual.year })}>重试这一年</button> : null}
              </>
            ) : null}
          </section> : <LoadingSection marker="年" title="年度流年" kind="annual" />}
          <details className="reading">
            <summary>排盘依据</summary>
            <p>四柱：{chart.bazi.year.value ?? (chart.bazi.year.candidates.join(" / ") || "待确认")} {chart.bazi.month.value ?? "月柱待确认"} {chart.bazi.day.value ?? "日柱待确认"} {chart.bazi.time.value ?? "时柱待确认"}</p>
            <p>日主来自日柱天干：{chart.bazi.dayMaster.value ?? chart.bazi.dayMaster.candidates.join("、")}</p>
            <p>起运：{chart.luck.direction === "forward" ? "顺排" : chart.luck.direction === "backward" ? "逆排" : "未确定"}。{chart.luck.startLabel ? readableMoment(chart.luck.startLabel) : "没有唯一起运时刻。"}</p>
            {chart.timeBasis.localLabels.map((item) => <p key={item}>当地时间 {item}</p>)}
            {chart.timeBasis.beijingLabels.map((item) => <p key={item}>排盘时间 {item}</p>)}
            {chart.timeBasis.lunarLabel ? <p>{chart.timeBasis.lunarLabel}，对应公历 {chart.timeBasis.solarDateLabel}</p> : null}
            {chart.zodiac.notice ? <p>{chart.zodiac.notice}</p> : null}
            {chart.zodiac.ingresses.map((item) => <p key={item.startUtc}>{item.term} {item.signName}：{item.birthZoneLabel}</p>)}
            {chart.timeBasis.notes.map((item) => <p key={item}>{item}</p>)}
            {chart.limitations.map((item) => <p key={item}>{item}</p>)}
          </details>
          <section id="portrait" className="portrait-section">{showPersonaCard && portrait ? <PersonaCard card={({...cardOf(chart, sentence), nickname: report?.input.cardNickname ? report.input.nickname : undefined})} artwork={portrait} />
            : <LoadingPortrait status={chart.persona.status !== "determined" && finalPhase ? "暂无可用人物卡" : portraitStatus === "failed" ? portraitError || "人物卡暂未生成" : portraitStatus === "loading" ? "正在绘制人物卡" : "人物卡将在解读完成后呈现"} loading={portraitStatus === "loading"} onRetry={portraitStatus === "failed" ? () => void generatePortrait(chart) : undefined} />}
          </section>
          <section className="reading report-followups"><h2><span className="idx">问</span>继续聊聊这份解读</h2>
            {Object.entries(report?.tasks ?? {}).filter(([key]) => key.startsWith("followup_")).map(([key, task]) => <article key={key}><h3>{task.question}</h3>{report?.followups[key] ? <><p>{report.followups[key].answer}</p><ul>{report.followups[key].actions.map((action) => <li key={action}>{action}</li>)}</ul><details><summary>回答依据</summary><ul>{report.followups[key].basisRefs.map((id) => <li key={id}><GlossaryText text={chart.factCatalog.find((fact) => fact.id === id)?.description ?? id} /></li>)}</ul></details></> : <p role="status">{task.error ?? (activeTask(task) ? "正在结合这份报告回答…" : "这次追问已停止")}</p>}{task.error || task.status === "cancelled" || task.status === "interrupted" ? <button type="button" className="quiet" onClick={() => void controller.mutate({ action: "retry", task: key })}>重试这次追问</button> : null}</article>)}
            <form onSubmit={(event) => { event.preventDefault(); if (followup.trim()) { void controller.mutate({ question: followup.trim() }, "followups"); setFollowup(""); } }}><p className="hint">例如：我该怎么安排学习？相处时要留意什么？</p><label htmlFor="followup">还想了解什么 <span className="hint">每份报告最多 3 次 · 每次 200 字</span></label><textarea id="followup" maxLength={200} value={followup} onChange={(event) => setFollowup(event.target.value)} /><button className="quiet" disabled={!followup.trim() || (!identityReady && !fortuneReady) || Object.keys(report?.tasks ?? {}).filter((key) => key.startsWith("followup_")).length >= 3}>继续追问</button></form>
          </section>
          <div className="actions report-secondary-actions">
            {portrait ? <button type="button" className="quiet" disabled={activeTask(portraitTask) || (report?.replacements ?? 0) >= 3} onClick={() => void generatePortrait(chart)}>{activeTask(portraitTask) ? "新画绘制中，原图可保存" : "换一张人物画"}</button> : null}
            {identityReady || fortuneReady ? <button type="button" className="quiet" onClick={() => void copyReading()}>复制解读</button> : null}
            {Object.entries(report?.tasks ?? {}).filter(([key, task]) => !key.startsWith("followup_") && ["failed", "interrupted", "cancelled"].includes(task.status)).map(([key]) => <button type="button" className="quiet" key={key} onClick={() => void controller.mutate({ action: "retry", task: key })}>重试{taskLabel(key)}</button>)}
          </div>
          <div className="actions result-actions"><a className="quiet" href="#portrait">查看人物卡</a><button type="button" className="quiet" disabled={!showPersonaCard || cardExporting} onClick={() => void saveCard()}>{cardExporting ? "正在准备图片…" : showPersonaCard ? "保存人格卡" : "人物卡未就绪"}</button></div>
        </div>
      ) : !showForm ? <div className="result-stack">
        <LoadingSection marker="总" title="一句话总览" kind="overview" />
        <LoadingSection marker="格" title="人格解读" kind="personality" />
        {resultForm.mbti ? <LoadingSection marker="型" title={`MBTI · ${resultForm.mbti}`} kind="personality" /> : null}
        <LoadingSection marker="星" title="太阳星座" kind="zodiac" />
        <LoadingSection marker="运" title="当前大运" kind="luck" />
        <LoadingSection marker="年" title="年度流年" kind="annual" />
        <LoadingSection marker="据" title="排盘依据" kind="basis" />
        <LoadingPortrait status="正在准备人物卡" loading />
      </div> : null}
      {copyPreview ? <ReportDialog title="手动复制解读" onClose={() => setCopyPreview(null)}><p>长按文字全选复制，或用电脑快捷键复制。</p><textarea aria-label="完整解读文字" readOnly value={copyPreview} onFocus={(event) => event.target.select()} rows={14} /></ReportDialog> : null}
      {cardPreview ? <ReportDialog title="长按图片，保存到相册" onClose={() => setCardPreview(null)}><img className="export-preview" src={cardPreview} alt="已生成的中式MBTI人格卡，可长按保存" /></ReportDialog> : null}
    </main>
  );
}
