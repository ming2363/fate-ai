"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ZodError } from "zod";

import { BirthForm, INITIAL_FORM, type FormState } from "@/components/BirthForm";
import { daysInBirthMonth } from "@/components/BirthDatePicker";
import { PersonaCard, PersonaSummary, type CardView } from "@/components/PersonaCard";
import { ThinkingPanel } from "@/components/ThinkingPanel";
import { ZodiacPanel } from "@/components/ZodiacPanel";
import { AnalysisBasis } from "@/components/AnalysisBasis";
import { GlossaryText } from "@/components/GlossaryText";
import { FestivalLabel, FestivalOrnaments } from "@/components/FestivalDecor";
import { CITIES, PROVINCES } from "@/lib/shared/cities";
import type { ChartFacts, FortuneReading, IdentityReading, Reading, ReadingTaskId } from "@/lib/shared/chart-types";
import { copyReport } from "@/lib/shared/copy-report";
import { annualStatusMessage, readableMoment } from "@/lib/shared/display";
import { birthInputSchema, type BirthInput } from "@/lib/shared/schemas";
import { parseSseBlock } from "@/lib/shared/sse";
import { createRequestId } from "@/lib/shared/request-id";
import { appendThinking } from "@/lib/shared/thinking";
import { blankReading } from "@/lib/shared/blank-reading";
import { SITE_NAME } from "@/lib/shared/versions";
import type { FestivalTheme } from "@/lib/shared/festival";

type Phase = "idle" | "charting" | "waiting" | "thinking" | "answering" | "validating" | "done" | "failed" | "cancelled";
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const PHASE_LABEL: Record<Phase, string> = {
  idle: "等待填写",
  charting: "正在排盘",
  waiting: "等待模型响应",
  thinking: "AI 思考中",
  answering: "正在整理解读",
  validating: "正在检查结果",
  done: "解读完成",
  failed: "解读未完成",
  cancelled: "已取消生成",
};

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

function isChart(value: unknown): value is ChartFacts {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === "chart.v1");
}

function isReading(value: unknown): value is Reading {
  return Boolean(value && typeof value === "object" && "schemaVersion" in value && value.schemaVersion === "reading.v1");
}

type TaskPhase = "waiting" | "thinking" | "answering" | "validating" | "done" | "failed";
const TASK_LABEL: Record<ReadingTaskId, string> = { identity: "人格与星座", fortune: "大运与流年" };

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
  const blocks = kind === "annual" ? 8 : kind === "luck" ? 6 : kind === "zodiac" ? 4 : kind === "personality" ? 2 : 1;
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

function LoadingPortrait({ status, onRetry }: { readonly status: string; readonly onRetry?: () => void }) {
  return <section className="persona-placeholder" aria-label="国风人格卡" aria-busy={!onRetry && status !== "暂无可用人物卡"}>
    <span className="persona-placeholder-mark" aria-hidden="true">命</span>
    <div><p className="kicker">中式MBTI人格卡</p><strong>{status}</strong><p>完成后将在这里呈现</p>{onRetry ? <button type="button" className="quiet" onClick={onRetry}>重试绘制人格卡</button> : null}</div>
  </section>;
}

export function FateApp() {
  const [form, setForm] = useState(INITIAL_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [offsetOptions, setOffsetOptions] = useState<string[]>([]);
  const [chart, setChart] = useState<ChartFacts | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [streamMode, setStreamMode] = useState<"unknown" | "single" | "parallel">("unknown");
  const [announcement, setAnnouncement] = useState("");
  const [thinking, setThinking] = useState("");
  const [taskThinking, setTaskThinking] = useState<Record<ReadingTaskId, { text: string; truncated: boolean }>>({ identity: { text: "", truncated: false }, fortune: { text: "", truncated: false } });
  const [taskPhase, setTaskPhase] = useState<Record<ReadingTaskId, TaskPhase>>({ identity: "waiting", fortune: "waiting" });
  const [taskErrors, setTaskErrors] = useState<Partial<Record<ReadingTaskId, string>>>({});
  const [truncated, setTruncated] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [elapsed, setElapsed] = useState("0:00");
  const [message, setMessage] = useState("");
  const [annualYear, setAnnualYear] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(true);
  const [portrait, setPortrait] = useState<string | null>(null);
  const [portraitStatus, setPortraitStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [cardPreview, setCardPreview] = useState<string | null>(null);
  const [cardExporting, setCardExporting] = useState(false);
  const [festival, setFestival] = useState<FestivalTheme | null>(null);
  const seq = useRef(0);
  const requestIdRef = useRef("");
  const historyIdRef = useRef("");
  const seenSeq = useRef(new Set<number>());
  const abortRef = useRef<AbortController | null>(null);
  const thinkingRef = useRef("");
  const taskThinkingRef = useRef<Record<ReadingTaskId, string>>({ identity: "", fortune: "" });
  const startedRef = useRef(0);
  const phaseRef = useRef<Phase>("idle");
  const portraitAbortRef = useRef<AbortController | null>(null);
  const portraitKeyRef = useRef<string | null>(null);

  useEffect(() => {
    void fetch(`${BASE_PATH}/api/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "page_view" }) }).catch(() => {});
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch(`${BASE_PATH}/api/festival`, { cache: "no-store" });
        if (response.ok) {
          const theme = await response.json() as FestivalTheme | null;
          if (active) setFestival(theme);
        }
      } catch { /* Decoration never blocks the reading. */ }
      if (active) {
        const chinaTime = (Date.now() + 8 * 60 * 60 * 1000) % 86_400_000;
        timer = setTimeout(() => void refresh(), 86_400_000 - chinaTime + 1000);
      }
    };
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      if (startedRef.current === 0 || ["done", "idle", "failed", "cancelled"].includes(phaseRef.current)) return;
      const seconds = Math.floor((Date.now() - startedRef.current) / 1000);
      setElapsed(`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!showForm) window.scrollTo(0, 0);
  }, [showForm]);

  useEffect(() => {
    if (!cardPreview) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setCardPreview(null); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [cardPreview]);

  function setLivePhase(next: Phase) {
    phaseRef.current = next;
    setPhase(next);
    setAnnouncement(PHASE_LABEL[next]);
  }

  function editBirth() {
    historyIdRef.current = "";
    setCardPreview(null);
    seq.current += 1;
    abortRef.current?.abort();
    portraitAbortRef.current?.abort();
    portraitKeyRef.current = null;
    setPortrait(null);
    setPortraitStatus("idle");
    setShowForm(true);
    setChart(null);
    setReading(null);
    setStreamMode("unknown");
    setThinking("");
    setTaskThinking({ identity: { text: "", truncated: false }, fortune: { text: "", truncated: false } });
    setTaskErrors({});
    setMessage("");
    setErrors({});
    setOffsetOptions([]);
    setLivePhase("idle");
    window.scrollTo(0, 0);
  }

  async function generatePortrait(facts: ChartFacts) {
    const dayMaster = facts.bazi.dayMaster.value;
    if (facts.persona.status !== "determined" || !dayMaster || !form.gender) return;
    const signId = facts.zodiac.status === "determined" && !facts.zodiac.nearBoundary ? facts.zodiac.sign?.id ?? null : null;
    const key = `${dayMaster}:${form.gender}:${signId ?? "unknown"}`;
    if (portraitKeyRef.current === key) return;
    portraitAbortRef.current?.abort();
    const abort = new AbortController();
    portraitAbortRef.current = abort;
    portraitKeyRef.current = key;
    setPortrait(null);
    setPortraitStatus("loading");
    try {
      const response = await fetch(`${BASE_PATH}/api/persona-image`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayMaster, gender: form.gender, signId, historyId: historyIdRef.current }),
        signal: abort.signal,
      });
      if (!response.ok) throw new Error("IMAGE_UNAVAILABLE");
      const data = await response.json() as { image?: string };
      if (!data.image?.startsWith("data:image/")) throw new Error("IMAGE_INVALID");
      if (abort.signal.aborted) return;
      setPortrait(data.image);
      setPortraitStatus("ready");
    } catch {
      if (abort.signal.aborted) return;
      portraitKeyRef.current = null;
      setPortraitStatus("failed");
    }
  }

  async function submit() {
    const nextErrors: Record<string, string> = {};
    if (!form.year.trim() || !form.month.trim() || !form.day.trim()) nextErrors.birthDate = "请填写完整的出生日期。";
    else {
      const maxDay = daysInBirthMonth(form.calendar, form.year, form.month, form.calendar === "lunar" && form.isLeapMonth);
      if (!maxDay || Number(form.day) < 1 || Number(form.day) > maxDay) nextErrors.birthDate = `所选${form.calendar === "solar" ? "公历" : "农历"}年月没有这一天，请重新选择。`;
    }
    if (form.precision === "minute" && !form.timeValue) nextErrors["birthTime.value"] = "请选择出生时间，或改选时辰 / 不清楚。";
    if (!form.gender) nextErrors.genderForCalculation = "请选择排盘性别。";
    if (!form.provinceCode || (form.provinceCode !== "other" && !form.cityId)) nextErrors["birthPlace.cityId"] = "请先选择省份，再选择出生城市。";
    if (form.provinceCode === "other" && !form.cityId && !form.timeZone) nextErrors["birthPlace.timeZone"] = "请选择出生时使用的时区。";
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      document.getElementById(nextErrors.birthDate ? "birth-year" : nextErrors["birthTime.value"] ? "birth-time" : nextErrors.genderForCalculation ? "gender-male" : nextErrors["birthPlace.timeZone"] ? "birth-zone" : "birth-place")?.focus();
      return;
    }
    seq.current += 1;
    historyIdRef.current = createRequestId();
    const localSeq = seq.current;
    abortRef.current?.abort();
    portraitAbortRef.current?.abort();
    portraitKeyRef.current = null;
    setPortrait(null);
    setPortraitStatus("idle");
    const abort = new AbortController();
    abortRef.current = abort;
    setErrors({});
    setReading(null);
    setStreamMode("unknown");
    setMessage("");
    setThinking("");
    thinkingRef.current = "";
    taskThinkingRef.current = { identity: "", fortune: "" };
    setTaskThinking({ identity: { text: "", truncated: false }, fortune: { text: "", truncated: false } });
    setTaskPhase({ identity: "waiting", fortune: "waiting" });
    setTaskErrors({});
    setTruncated(false);
    setExpanded(false);
    setLivePhase("charting");
    startedRef.current = Date.now();
    let chartReady = false;
    try {
      const input = payloadOf(form);
      setShowForm(false);
      const chartResponse = await fetch(`${BASE_PATH}/api/chart`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, historyId: historyIdRef.current }),
        signal: abort.signal,
      });
      const chartBody = await chartResponse.json() as Record<string, unknown>;
      if (localSeq !== seq.current) return;
      if (!chartResponse.ok) {
        const path = typeof chartBody.fieldPath === "string" ? chartBody.fieldPath : "birthDate";
        setErrors({ [path]: typeof chartBody.message === "string" ? chartBody.message : "请检查出生信息" });
        setOffsetOptions(Array.isArray(chartBody.candidates) ? chartBody.candidates.filter((item): item is string => typeof item === "string") : []);
        setShowForm(true);
        setLivePhase("idle");
        return;
      }
      if (!isChart(chartBody)) {
        setMessage("排盘结果无法识别。");
        setShowForm(true);
        setLivePhase("idle");
        return;
      }
      const facts = chartBody;
      chartReady = true;
      setChart(facts);
      setAnnualYear(facts.annuals.currentYear);
      void generatePortrait(facts);
      await streamReading(input, facts, abort, localSeq);
    } catch (error) {
      if (error instanceof ZodError) {
        const path = error.issues[0]?.path.join(".") ?? "birthDate";
        setErrors({ [path]: "请检查这项信息后重试。" });
        setShowForm(true);
        setLivePhase("idle");
        return;
      }
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (localSeq !== seq.current) return;
      setMessage("解读未能完成，排盘结果如已返回会保留。可以重试。");
      if (!chartReady) setShowForm(true);
      setLivePhase(chartReady ? "failed" : "idle");
    }
  }

  async function streamReading(input: BirthInput, facts: ChartFacts, abort: AbortController, localSeq: number, requestedTasks?: readonly ReadingTaskId[]) {
    setLivePhase("waiting");
    const requestId = createRequestId();
    requestIdRef.current = requestId;
    seenSeq.current = new Set();
    const response = await fetch(`${BASE_PATH}/api/reading`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...input,
        requestId,
        historyId: historyIdRef.current,
        focus: form.focus,
        question: form.question,
        asOfUtc: facts.asOfUtc,
        requestedTasks,
      }),
      signal: abort.signal,
    });
    if (localSeq !== seq.current) return;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/event-stream")) {
      const body = await response.json() as { message?: string };
      setMessage(`基础命盘已完成。${body.message ?? "AI 解读尚未完成"}`);
      setLivePhase("failed");
      return;
    }
    const reader = response.body?.getReader();
    if (!reader) {
      setMessage("连接中断，没有收到完成标记。请手动重试，不会自动重发。");
      setLivePhase("failed");
      return;
    }
    const decoder = new TextDecoder();
    let buffer = "";
    let pending = "";
    let sawDone = false;
    let stagedReading: Reading | null = null;
    let receivedPart = false;
    let failedParts = 0;
    const taskPending: Record<ReadingTaskId, string> = { identity: "", fortune: "" };
    const flush = setInterval(() => {
      if (localSeq !== seq.current) return;
      if (pending) {
        const next = appendThinking(thinkingRef.current, pending);
        thinkingRef.current = next.text;
        pending = "";
        setThinking(next.text);
        setTruncated(next.truncated);
      }
      for (const taskId of ["identity", "fortune"] as const) {
        if (!taskPending[taskId]) continue;
        const taskNext = appendThinking(taskThinkingRef.current[taskId], taskPending[taskId]);
        taskThinkingRef.current[taskId] = taskNext.text;
        taskPending[taskId] = "";
        setTaskThinking((prev) => ({ ...prev, [taskId]: taskNext }));
      }
    }, 100);
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const blocks = buffer.split(/\n\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) {
          const parsed = parseSseBlock(block);
          if (!parsed || !parsed.data || typeof parsed.data !== "object") continue;
          const data = parsed.data as Record<string, unknown>;
          if (data.requestId !== requestId || data.chartFingerprint !== facts.chartFingerprint) continue;
          if (typeof data.seq === "number" && seenSeq.current.has(data.seq)) continue;
          if (typeof data.seq === "number") seenSeq.current.add(data.seq);
          if (localSeq !== seq.current) continue;
          if (parsed.event === "status" && typeof data.phase === "string") { setStreamMode("single"); setLivePhase(data.phase as Phase); }
          if (parsed.event === "thinking_delta" && typeof data.text === "string") pending += data.text;
          const taskId = data.taskId === "identity" || data.taskId === "fortune" ? data.taskId : null;
          if (taskId && parsed.event === "module_status" && typeof data.phase === "string") {
            setStreamMode("parallel");
            setTaskPhase((prev) => ({ ...prev, [taskId]: data.phase as TaskPhase }));
            setLivePhase(data.phase as Phase);
          }
          if (taskId && parsed.event === "module_thinking_delta" && typeof data.text === "string") taskPending[taskId] += data.text;
          if (taskId && parsed.event === "module_retry") {
            taskPending[taskId] = "";
            taskThinkingRef.current[taskId] = "";
            setTaskThinking((prev) => ({ ...prev, [taskId]: { text: "", truncated: false } }));
            setTaskPhase((prev) => ({ ...prev, [taskId]: "waiting" }));
          }
          if (taskId && parsed.event === "module_result" && data.part && typeof data.part === "object") {
            if (taskId === "identity" && "personality" in data.part) setReading((prev) => ({ ...(prev ?? blankReading(facts)), ...data.part as IdentityReading }));
            if (taskId === "fortune" && "annualReadings" in data.part) setReading((prev) => ({ ...(prev ?? blankReading(facts)), ...data.part as FortuneReading }));
            receivedPart = true;
            setTaskPhase((prev) => ({ ...prev, [taskId]: "done" }));
          }
          if (taskId && parsed.event === "module_error") {
            failedParts += 1;
            setTaskErrors((prev) => ({ ...prev, [taskId]: typeof data.message === "string" ? data.message : "这一部分未完成" }));
            setTaskPhase((prev) => ({ ...prev, [taskId]: "failed" }));
          }
          if (parsed.event === "retry") {
            pending = "";
            thinkingRef.current = "";
            setThinking("");
            setTruncated(false);
            setAnnouncement("正在重新生成");
          }
          if (parsed.event === "result" && isReading(data.reading)) {
            stagedReading = data.reading;
          }
          if (parsed.event === "error") {
            setMessage(typeof data.message === "string" ? data.message : "解读失败");
            setLivePhase("failed");
          }
          if (parsed.event === "done") {
            sawDone = true;
            if ((data.outcome === "success" || data.outcome === "partial") && receivedPart) {
              if (failedParts) setMessage("部分解读未完成，已保留生成成功的内容。可单独重试失败部分。");
              setLivePhase("done");
            } else if (data.outcome === "success" && stagedReading) {
              setReading(stagedReading);
              setExpanded(false);
              setLivePhase("done");
            } else if (phaseRef.current !== "failed") {
              setMessage("解读没有收到完整结果，请手动重试。");
              setLivePhase("failed");
            }
          }
        }
      }
    } finally {
      if (pending && localSeq === seq.current) {
        const next = appendThinking(thinkingRef.current, pending);
        thinkingRef.current = next.text;
        setThinking(next.text);
        setTruncated(next.truncated);
      }
      clearInterval(flush);
      for (const taskId of ["identity", "fortune"] as const) {
        if (!taskPending[taskId] || localSeq !== seq.current) continue;
        const next = appendThinking(taskThinkingRef.current[taskId], taskPending[taskId]);
        taskThinkingRef.current[taskId] = next.text;
        setTaskThinking((prev) => ({ ...prev, [taskId]: next }));
      }
    }
    if (!sawDone && localSeq === seq.current && phaseRef.current !== "cancelled") {
      setMessage("连接中断，没有收到完成标记。请手动重试，不会自动重发。");
      setLivePhase("failed");
    }
  }

  async function retryTask(taskId: ReadingTaskId) {
    if (!chart || ["charting", "waiting", "thinking", "answering", "validating"].includes(phaseRef.current)) return;
    seq.current += 1;
    const localSeq = seq.current;
    const abort = new AbortController();
    abortRef.current = abort;
    setMessage("");
    setTaskErrors((prev) => { const next = { ...prev }; delete next[taskId]; return next; });
    setTaskPhase((prev) => ({ ...prev, [taskId]: "waiting" }));
    taskThinkingRef.current[taskId] = "";
    setTaskThinking((prev) => ({ ...prev, [taskId]: { text: "", truncated: false } }));
    startedRef.current = Date.now();
    try {
      const input = payloadOf(form);
      let fresh = chart;
      if (Date.now() - Date.parse(chart.asOfUtc) > 4 * 60_000) {
        setLivePhase("charting");
        const response = await fetch(`${BASE_PATH}/api/chart`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, historyId: historyIdRef.current }), signal: abort.signal });
        const body = await response.json() as unknown;
        if (!response.ok || !isChart(body)) throw new Error("REFRESH_CHART_FAILED");
        fresh = body;
        const equivalent = JSON.stringify([chart.bazi, chart.persona, chart.zodiac, chart.luck, chart.annuals, chart.factCatalog, chart.allowedTopics])
          === JSON.stringify([fresh.bazi, fresh.persona, fresh.zodiac, fresh.luck, fresh.annuals, fresh.factCatalog, fresh.allowedTopics]);
        if (!equivalent) { await submit(); return; }
        setChart(fresh);
      }
      if (localSeq !== seq.current) return;
      await streamReading(input, fresh, abort, localSeq, [taskId]);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (localSeq !== seq.current) return;
      setTaskErrors((prev) => ({ ...prev, [taskId]: "重试连接中断" }));
      setTaskPhase((prev) => ({ ...prev, [taskId]: "failed" }));
      setLivePhase("done");
      setMessage("已保留生成成功的内容，失败部分仍可重试。");
    }
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
      void fetch(`${BASE_PATH}/api/activity`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ event: "card_save", historyId: historyIdRef.current }) }).catch(() => {});
    } catch (error) {
      if (error instanceof Error) setMessage("人格卡导出失败，请改用系统截图。");
    } finally {
      setCardExporting(false);
    }
  }

  const sentence = reading?.personality.cardSentence?.text ?? "一份自我探索的侧写";
  const annual = chart?.annuals.items.find((item) => item.year === annualYear) ?? null;
  const annualReading = reading?.annualReadings.find((item) => item.year === annualYear) ?? null;
  const identityAvailable = Boolean(chart?.allowedTopics.personality || chart?.allowedTopics.zodiac);
  const fortuneAvailable = Boolean(chart?.allowedTopics.currentLuck || chart?.allowedTopics.annualYears.length);
  const identityReady = Boolean(reading && (taskPhase.identity === "done" || (streamMode === "single" && phase === "done")));
  const fortuneReady = Boolean(reading && (taskPhase.fortune === "done" || (streamMode === "single" && phase === "done")));
  const finalPhase = ["done", "failed", "cancelled"].includes(phase);
  const showIdentity = identityReady || (finalPhase && chart !== null);
  const showPersonaCard = Boolean(chart && chart.persona.status === "determined" && finalPhase && portraitStatus === "ready" && portrait);
  const showFortune = fortuneReady || (finalPhase && chart !== null);
  const birthCity = CITIES.find((city) => city.id === form.cityId);
  const birthProvince = PROVINCES.find((province) => province.code === form.provinceCode);
  const birthPlaceLabel = birthCity
    ? [birthProvince?.name, birthCity.name].filter(Boolean).join(" · ") || birthCity.name
    : "列表外地点（手动选择时区）";
  const birthZoneLabel = chart?.timeBasis.birthTimeZone === "Asia/Shanghai" ? "北京时间"
    : chart?.timeBasis.birthTimeZone === "Asia/Urumqi" ? "新疆时间"
      : chart?.timeBasis.birthTimeZone ?? "";

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
      {chart && !showForm ? <div className="result-birthplace">
        <div><span>出生地</span><strong>{birthPlaceLabel}</strong></div>
        <div><span>采用的出生时区</span><strong>{birthZoneLabel}</strong></div>
        <p>出生地用于换算出生时刻，进而计算八字与太阳星座；同一时区的城市计算结果相同。</p>
      </div> : !showForm ? <div className="result-birthplace birthplace-placeholder" aria-label="出生地正在核算"><span>出生地与时区正在核算</span></div> : null}
      {!showForm && !["idle", "done", "failed", "cancelled"].includes(phase) ? (
        <ThinkingPanel
          phaseLabel={PHASE_LABEL[phase]}
          elapsed={elapsed}
          text={thinking}
          truncated={truncated}
          expanded={expanded}
          onToggle={() => setExpanded((value) => !value)}
          onCancel={() => { seq.current += 1; abortRef.current?.abort(); portraitAbortRef.current?.abort(); if (portraitStatus === "loading") { portraitKeyRef.current = null; setPortraitStatus("failed"); } if (!chart) setShowForm(true); setLivePhase("cancelled"); setMessage("已取消生成"); }}
          tasks={streamMode === "parallel" ? (["identity", "fortune"] as const).filter((taskId) => taskId === "identity" ? identityAvailable : fortuneAvailable).map((taskId) => ({ label: TASK_LABEL[taskId], phase: taskPhase[taskId] === "done" ? "已完成" : taskPhase[taskId] === "failed" ? "未完成" : PHASE_LABEL[taskPhase[taskId]], ...taskThinking[taskId] })) : undefined}
        />
      ) : null}
      {phase === "done" && thinking ? (
        <button type="button" className="text-button" onClick={() => setExpanded((value) => !value)}>{expanded ? "收起思考过程" : "查看本次思考片段"}</button>
      ) : null}
      {expanded && phase === "done" && thinking ? <pre className="think" aria-hidden="true">{thinking}</pre> : null}
      {message ? <p className="error" role="alert">{message}</p> : null}
      {!showForm && chart && chart.persona.status === "determined" && showIdentity ? <PersonaSummary card={cardOf(chart, sentence)} /> : !showForm && !showIdentity && !finalPhase ? <LoadingSummary /> : null}
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
            <section className="reading personality-reading ready">
              <h2><span className="idx">格</span>人格解读</h2>
              <p><GlossaryText text={reading.personality.summary.text} /></p>
              <div className="insight-grid">
                <div><h3>可发挥</h3>{reading.personality.strengths.map((item) => <p key={item.text}><GlossaryText text={item.text} /></p>)}</div>
                <div><h3>需留意</h3>{reading.personality.blindSpots.map((item) => <p key={item.text}><GlossaryText text={item.text} /></p>)}</div>
              </div>
              {reading.personality.relationshipAdvice ? <p><strong>与人相处　</strong><GlossaryText text={reading.personality.relationshipAdvice.text} /></p> : null}
            </section>
          ) : !finalPhase && !identityReady ? <LoadingSection marker="格" title="人格解读" kind="personality" /> : showIdentity && chart.persona.status !== "determined" ? (
            <section className="reading personality-reading"><h2><span className="idx">格</span>人格解读</h2><p>日主尚未唯一确定，这里不写专属人格正文。</p></section>
          ) : <section className="reading personality-reading"><h2><span className="idx">格</span>人格解读</h2><p className="module-notice">{taskErrors.identity ?? "人格解读暂未完成。"}</p></section>}
          {showIdentity ? <ZodiacPanel chart={chart} cultureNote={reading?.zodiacNote?.text} /> : <LoadingSection marker="星" title="太阳星座" kind="zodiac" />}
          {showFortune ? <section className={`reading detailed-reading luck-reading${reading?.currentLuck.summary ? " ready" : ""}`}>
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
                {reading?.currentLuck.summary ? <div className="analysis-section"><h3>这一运的主线与依据</h3><p><GlossaryText text={reading.currentLuck.summary.text} /></p></div> : <p className="module-notice">大运阶段已排定。{taskErrors.fortune ?? (phase === "failed" || phase === "cancelled" ? "AI 正文尚未完成，可在下方重新生成。" : "正在生成详细解读…")}</p>}
                <div className="analysis-columns">
                  {reading?.currentLuck.opportunity ? <div className="analysis-section"><h3>机会与可用方向</h3><p><GlossaryText text={reading.currentLuck.opportunity.text} /></p></div> : null}
                  {reading?.currentLuck.attention ? <div className="analysis-section"><h3>需要留意与如何应对</h3><p><GlossaryText text={reading.currentLuck.attention.text} /></p></div> : null}
                </div>
                <AnalysisBasis chart={chart} prefix="luck.current" />
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
                <button type="button" key={item.year} aria-pressed={item.year === annualYear} onClick={() => setAnnualYear(item.year)}>
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
                    <div className="analysis-section"><h3>年度主线与命盘关系</h3><p><GlossaryText text={annualReading.summary?.text ?? ""} /></p></div>
                    <div className="annual-outlooks"><h3>这一年可能遇到的事</h3><ol>{annualReading.outlooks.map((item) => <li key={item.text}><GlossaryText text={item.text} /></li>)}</ol></div>
                    <div className="annual-segments"><h3>放在大运里看这一年</h3>{annualReading.segments.map((segment, index) => <p key={segment.periodId}><strong>{annual.segments[index]?.pillar ?? "起运前"}阶段　</strong><GlossaryText text={segment.summary.text} /></p>)}</div>
                    <div className="analysis-columns">
                      <div className="analysis-section"><h3>事业与学习</h3><p><GlossaryText text={annualReading.career?.text ?? ""} /></p></div>
                      <div className="analysis-section"><h3>感情与人际</h3><p><GlossaryText text={annualReading.relationships?.text ?? ""} /></p></div>
                      <div className="analysis-section"><h3>财务与积累</h3><p><GlossaryText text={annualReading.finance?.text ?? ""} /></p></div>
                      <div className="analysis-section action-section"><h3>可以着手的两件事</h3><ol className="reading-actions">{annualReading.actions.map((item) => <li key={item.text}><GlossaryText text={item.text} /></li>)}</ol></div>
                    </div>
                  </>
                ) : annual.personalStatus === "applicable" ? <p className="module-notice">年度阶段已排定。{taskErrors.fortune ?? (phase === "failed" || phase === "cancelled" ? "AI 正文尚未完成，可在下方重新生成。" : "正在生成事业、人际与财务解读…")}</p> : null}
                <AnalysisBasis chart={chart} prefix={`annual.${annual.year}`} />
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
          {showPersonaCard && portrait ? <PersonaCard card={cardOf(chart, sentence)} artwork={portrait} />
            : <LoadingPortrait status={chart.persona.status !== "determined" && finalPhase ? "暂无可用人物卡" : portraitStatus === "failed" ? "人物卡暂未生成" : finalPhase ? "正在绘制人物卡" : "人物卡将在解读完成后呈现"} onRetry={portraitStatus === "failed" && finalPhase ? () => void generatePortrait(chart) : undefined} />}
          <div className="actions">
            {identityReady || fortuneReady ? <button type="button" className="quiet" onClick={() => { const missing: ReadingTaskId[] = []; if (identityAvailable && !identityReady) missing.push("identity"); if (fortuneAvailable && !fortuneReady) missing.push("fortune"); void navigator.clipboard.writeText(copyReport(chart, reading, annualYear ?? chart.annuals.currentYear, missing)).catch(() => setMessage("复制失败，请检查浏览器剪贴板权限。")); }}>复制解读</button> : null}
            {showPersonaCard ? <button type="button" className="quiet" disabled={cardExporting} onClick={() => void saveCard()}>{cardExporting ? "正在准备图片…" : "保存人格卡"}</button> : null}
            {taskErrors.identity ? <button type="button" className="quiet" onClick={() => void retryTask("identity")}>重试人格与星座解读</button> : null}
            {taskErrors.fortune ? <button type="button" className="quiet" onClick={() => void retryTask("fortune")}>重试大运与流年解读</button> : null}
            {phase === "failed" ? <button type="button" className="quiet" onClick={() => void submit()}>重试解读</button> : null}
            {phase === "done" || phase === "cancelled" ? <button type="button" className="quiet" onClick={() => { portraitKeyRef.current = null; void submit(); }}>重新生成解读</button> : null}
          </div>
        </div>
      ) : !showForm ? <div className="result-stack">
        <LoadingSection marker="总" title="一句话总览" kind="overview" />
        <LoadingSection marker="格" title="人格解读" kind="personality" />
        <LoadingSection marker="星" title="太阳星座" kind="zodiac" />
        <LoadingSection marker="运" title="当前大运" kind="luck" />
        <LoadingSection marker="年" title="年度流年" kind="annual" />
        <LoadingSection marker="据" title="排盘依据" kind="basis" />
        <LoadingPortrait status="正在准备人物卡" />
      </div> : null}
      {cardPreview ? <div className="card-preview" role="dialog" aria-modal="true" aria-label="保存人格卡图片">
        <button type="button" className="card-preview-backdrop" aria-label="关闭图片预览" onClick={() => setCardPreview(null)} />
        <div className="card-preview-content">
          <div className="card-preview-head"><p>长按图片，保存到相册</p><button type="button" className="card-preview-close" aria-label="关闭图片预览" onClick={() => setCardPreview(null)}>×</button></div>
          <img src={cardPreview} alt="已生成的中式MBTI人格卡，可长按保存" />
        </div>
      </div> : null}
    </main>
  );
}
