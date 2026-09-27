"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { activeTask, type ReportInput, type ReportSnapshot } from "@/lib/shared/report";
import { collectVisitor } from "@/lib/shared/visitor";
import { createRequestId } from "@/lib/shared/request-id";
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const STORAGE = "fate:last-report:v2";
let sessionReady: Promise<void> | null = null;
export function initializeBrowserSession(): Promise<void> {
  if (!sessionReady) sessionReady = fetch(`${BASE}/api/session`, { method: "POST" }).then(async (response) => { if (!response.ok) throw new Error((await response.json()).message ?? "会话初始化失败"); }).catch((e) => { sessionReady = null; throw e; });
  return sessionReady;
}
function remember(id: string | null) { try { if (id) localStorage.setItem(STORAGE, id); else localStorage.removeItem(STORAGE); } catch { /* Storage may be disabled in private browsers. */ } }
export async function reportRequest(path: string, body?: unknown) {
  await initializeBrowserSession();
  const response = await fetch(`${BASE}${path}`, { cache: "no-store", ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) { if (response.status === 401) sessionReady = null; throw Object.assign(new Error(result.message ?? "暂时连接不上，请稍后再试。"), result, { status: response.status }); }
  return result;
}
export function useReport() {
  const [report, setReport] = useState<ReportSnapshot | null>(null);
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState(true);
  const currentId = useRef<string | null>(null);
  const pending = useRef<{ body: string; id: string } | null>(null);
  const mutationIds = useRef(new Map<string, string>());
  const mutationBusy = useRef(new Set<string>());
  const accept = useCallback((snapshot: ReportSnapshot) => {
    if (currentId.current !== snapshot.id) return;
    setReport((old) => old?.id === snapshot.id && old.revision > snapshot.revision ? old : snapshot);
  }, []);
  useEffect(() => {
    let live = true;
    void initializeBrowserSession().then(() => {
      if (!live) return;
      let saved: string | null = null;
      try { saved = localStorage.getItem(STORAGE); } catch { /* No local storage. */ }
      if (saved) { currentId.current = saved; setId(saved); } else setRestoring(false);
      void collectVisitor().catch(() => ({})).then((visitor) => reportRequest("/api/activity", { event: "page_view", visitor })).catch(() => {});
    }).catch((e) => { if (live) { setError(e.message); setRestoring(false); } });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let fetching = false;
    const started = Date.now();
    const poll = async () => {
      if (disposed || fetching) return;
      clearTimeout(timer); fetching = true;
      let again = true;
      try {
        const next = await reportRequest(`/api/reports/${id}`) as ReportSnapshot;
        if (disposed) return;
        accept(next); setError(""); setRestoring(false);
        again = Object.values(next.tasks).some(activeTask);
      } catch (e) {
        if (disposed) return;
        const failure = e as Error & { status?: number };
        if ([401, 404].includes(failure.status ?? 0)) { remember(null); setId(null); currentId.current = null; again = false; }
        setError(failure.message); setRestoring(false);
      } finally {
        fetching = false;
        if (!disposed && again) timer = setTimeout(poll, document.hidden ? 15000 : Date.now() - started > 60000 ? 6000 : 2500);
      }
    };
    const foreground = () => { if (!document.hidden) void poll(); };
    document.addEventListener("visibilitychange", foreground);
    void poll();
    return () => { disposed = true; clearTimeout(timer); document.removeEventListener("visibilitychange", foreground); };
  }, [id, accept, report?.tasks && Object.values(report.tasks).some(activeTask)]);
  async function start(input: Omit<ReportInput, "requestId">) {
    const body = JSON.stringify(input);
    if (!pending.current || pending.current.body !== body) pending.current = { body, id: createRequestId() };
    const requestId = pending.current.id;
    setBusy(true); setError(""); remember(requestId); currentId.current = requestId;
    try { const next = await reportRequest("/api/reports", { ...input, requestId, visitor: await collectVisitor().catch(() => ({})) }) as ReportSnapshot; currentId.current = next.id; remember(next.id); setId(next.id); accept(next); pending.current = null; return next; }
    finally { setBusy(false); }
  }
  async function mutate(body: Record<string, unknown>, endpoint = "tasks") {
    if (!report) return;
    const key = `${report.id}:${endpoint}:${JSON.stringify(body)}`;
    if (mutationBusy.current.has(key)) return;
    mutationBusy.current.add(key);
    const requestId = mutationIds.current.get(key) ?? createRequestId(); mutationIds.current.set(key, requestId);
    try { const next = await reportRequest(`/api/reports/${report.id}/${endpoint}`, { ...body, requestId }) as ReportSnapshot; accept(next); mutationIds.current.delete(key); setError(""); }
    catch (e) { setError((e as Error).message); }
    finally { mutationBusy.current.delete(key); }
  }
  function reset() { currentId.current = null; remember(null); setId(null); setReport(null); setError(""); pending.current = null; }
  return { report, busy, restoring, error, start, mutate, reset, setError };
}
