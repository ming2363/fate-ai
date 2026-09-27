import type { RequestVisitor } from "./visitor";
import { createHash } from "node:crypto";
import type { PoolConnection, RowDataPacket } from "mysql2/promise";
import { Temporal } from "@js-temporal/polyfill";
import { database } from "./db";
import { HttpError } from "./errors";
import { buildChart } from "./chart";
import { blankReading } from "../shared/blank-reading";
import { birthInputSchema } from "../shared/schemas";
import { activeTask, initialTasks, type ReportInput, type ReportSnapshot, type ReportState } from "../shared/report";
import type { ChartFacts, Reading } from "../shared/chart-types";

export const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export const unpack = <T>(value: T | string): T => typeof value === "string" ? JSON.parse(value) as T : value;
export type ReportRow = RowDataPacket & { id: string; session_id: string; input_json: ReportInput; chart_json: ChartFacts; reading_json: Reading; task_state: ReportState; revision: number };
export function decodeRow(row: ReportRow): ReportRow {
  return { ...row, input_json: unpack(row.input_json), chart_json: unpack(row.chart_json), reading_json: unpack(row.reading_json), task_state: unpack(row.task_state) };
}
export function fail(code: string, message: string, status = 409): never { throw new HttpError(status, code, message, false); }
export async function transaction<T>(run: (connection: PoolConnection) => Promise<T>, lock?: string): Promise<T> {
  const c = await database().getConnection();
  let held = false;
  try {
    if (lock) {
      const [rows] = await c.query<RowDataPacket[]>("SELECT GET_LOCK(?, 5) AS held", [lock]);
      held = rows[0]?.held === 1;
      if (!held) fail("BUSY", "请求繁忙，请稍后重试。", 503);
    }
    await c.beginTransaction();
    const result = await run(c);
    await c.commit();
    return result;
  } catch (e) { await c.rollback(); throw e; }
  finally { if (held) await c.query("SELECT RELEASE_LOCK(?)", [lock]).catch(() => {}); c.release(); }
}
export async function lockedReport(c: PoolConnection, id: string, session?: string): Promise<ReportRow> {
  const [rows] = await c.query<ReportRow[]>(`SELECT id, session_id, input_json, chart_json, reading_json, task_state, revision FROM fate_reading_history WHERE id=?${session ? " AND session_id=?" : ""} FOR UPDATE`, session ? [id, session] : [id]);
  const row = rows[0];
  if (!row?.task_state) fail("NOT_FOUND", "这份报告不存在或不属于当前会话。", 404);
  return decodeRow(row);
}
export async function writeReport(c: PoolConnection, row: ReportRow): Promise<void> {
  const tasks = Object.values(row.task_state.tasks);
  const active = tasks.some(activeTask);
  const status = active ? "running" : tasks.some((t) => ["failed", "interrupted", "cancelled"].includes(t.status)) ? "partial" : "generated";
  await c.execute("UPDATE fate_reading_history SET task_state=?, reading_json=?, revision=revision+1, status=?, next_run_at=IF(?,UTC_TIMESTAMP(3),NULL) WHERE id=?", [JSON.stringify(row.task_state), JSON.stringify(row.reading_json), status, active, row.id]);
}
export async function snapshot(id: string, session: string): Promise<ReportSnapshot> {
  const [rows] = await database().query<ReportRow[]>("SELECT id,session_id,input_json,chart_json,reading_json,task_state,revision FROM fate_reading_history WHERE id=? AND session_id=?", [id, session]);
  if (!rows[0]?.task_state) fail("NOT_FOUND", "这份报告不存在或不属于当前会话。", 404);
  const row = decodeRow(rows[0]);
  return { id, revision: row.revision, input: row.input_json, chart: row.chart_json, reading: row.reading_json, tasks: row.task_state.tasks, followups: row.task_state.followups, feedback: row.task_state.feedback, imageVersion: row.task_state.imageVersion, replacements: row.task_state.replacements, createdAt: row.task_state.createdAt };
}
export async function createReport(input: ReportInput, session: string, ip: string, visitor?: RequestVisitor): Promise<string> {
  const { requestId, ...body } = input;
  const fingerprint = hash(body);
  return transaction(async (c) => {
    const [existing] = await c.query<ReportRow[]>("SELECT id,session_id,task_state FROM fate_reading_history WHERE id=?", [requestId]);
    if (existing[0]) {
      if (existing[0].session_id !== session || unpack(existing[0].task_state).inputHash !== fingerprint) fail("ID_CONFLICT", "请求编号已被使用，请重新开始。");
      return existing[0].id;
    }
    const [same] = await c.query<RowDataPacket[]>("SELECT id FROM fate_reading_history WHERE session_id=? AND status='running' AND task_state->>'$.inputHash'=? LIMIT 1", [session, fingerprint]);
    if (same[0]) return same[0].id as string;
    const [count] = await c.query<RowDataPacket[]>("SELECT SUM(session_id=?) AS sessions, SUM(task_state->>'$.ip'=?) AS ips FROM fate_reading_history WHERE created_at>NOW()-INTERVAL 1 HOUR", [session, ip]);
    if (Number(count[0]?.sessions) >= 6 || Number(count[0]?.ips) >= 20) fail("RATE_LIMIT", "解读请求过于频繁，请稍后再试。", 429);
    const facts = buildChart(birthInputSchema.parse(Object.fromEntries(Object.entries(input).filter(([key]) => ["calendar", "birthDate", "birthTime", "genderForCalculation", "birthPlace"].includes(key)))), Temporal.Now.instant());
    const state: ReportState = { tasks: initialTasks(facts, Boolean(input.mbti)), requests: {}, visitor, inputHash: fingerprint, ip, createdAt: Date.now(), imageVersion: 0, replacements: 0, followups: {}, feedback: {} };
    await c.execute("INSERT INTO fate_reading_history (id,session_id,status,title,input_json,chart_json,reading_json,task_state,schema_version,revision,next_run_at) VALUES (?,?,'running',?,?,?,?,?,2,1,UTC_TIMESTAMP(3))", [requestId, session, facts.persona.title, JSON.stringify(input), JSON.stringify(facts), JSON.stringify(blankReading(facts)), JSON.stringify(state)]);
    await c.execute("INSERT INTO fate_operation_log (session_id,history_id,event,outcome,ip,metadata_json) VALUES (?,?,'report_created','success',?,?)", [session, requestId, ip === "direct" ? null : ip, JSON.stringify({ visitor })]);
    return requestId;
  }, "fate-report-create");
}
export type Mutation = { requestId: string; action: "retry" | "year" | "portrait" | "cancel" | "followup"; task?: string; year?: number; question?: string };
export async function mutateReport(id: string, session: string, input: Mutation): Promise<void> {
  await transaction(async (c) => {
    const row = await lockedReport(c, id, session);
    const state = row.task_state;
    const fingerprint = hash(input);
    const previous = state.requests[input.requestId];
    if (previous) { if (previous.hash !== fingerprint) fail("ID_CONFLICT", "请求编号不能重复用于不同内容。"); return; }
    if (Object.keys(state.requests).length >= 60) fail("LIMIT", "本次报告操作次数已达到上限。");
    let key = input.task ?? "";
    if (input.action === "year") key = input.year === row.chart_json.annuals.currentYear ? "fortune_current" : `annual_${input.year}`;
    if (input.action === "portrait") key = "portrait";
    if (input.action === "followup") {
      if (!input.question?.trim()) fail("QUESTION", "请先填写问题。", 422);
      if (!Object.values(state.tasks).some((t) => t.status === "completed") || !["identity", "fortune_current"].some((k) => state.tasks[k]?.status === "completed")) fail("NOT_READY", "请等一部分解读完成后再追问。");
      const previousQuestion = Object.entries(state.tasks).find(([k, t]) => k.startsWith("followup_") && t.question === input.question);
      if (previousQuestion) key = previousQuestion[0];
      else {
        const n = Object.keys(state.tasks).filter((k) => k.startsWith("followup_")).length;
        if (n >= 3) fail("FOLLOWUP_LIMIT", "每份报告最多追问三次。");
        key = `followup_${n + 1}`;
        state.tasks[key] = { status: "idle", version: 0, attempt: 0, question: input.question };
      }
    }
    if (input.action === "cancel") {
      for (const [name, t] of Object.entries(state.tasks)) if ((!key || name === key) && activeTask(t)) { t.status = "cancelled"; t.version++; t.finishedAt = Date.now(); }
    } else {
      const t = state.tasks[key];
      if (!t || t.status === "unavailable") fail("TASK_INVALID", "这部分目前没有足够信息生成。", 422);
      if (!activeTask(t) && !(t.status === "completed" && input.action !== "portrait")) {
        if (input.action === "portrait" && state.imageVersion > 0 && state.replacements >= 3) fail("PORTRAIT_LIMIT", "每份报告最多更换三张人物画。");
        if (t.attempt >= 6) fail("RETRY_LIMIT", "这部分已达到重试上限。");
        t.status = "queued"; t.version++; delete t.error; delete t.finishedAt;
        if (key === "portrait") t.replacement = state.imageVersion > 0;
      }
    }
    state.requests[input.requestId] = { hash: fingerprint, task: key };
    await c.execute("INSERT INTO fate_operation_log (session_id,history_id,event,outcome,ip,task_id,metadata_json) VALUES (?,?,?,'success',?,?,?)", [session,id, "report_" + input.action, state.ip === "direct" ? null : state.ip, key || null, JSON.stringify({ visitor: state.visitor, requestId: input.requestId })]);
    await writeReport(c, row);
  });
}
export async function feedback(id: string, session: string, module: string, value: string): Promise<void> {
  await transaction(async (c) => {
    const row = await lockedReport(c, id, session);
    if (!row.task_state.tasks[module]) fail("TASK_INVALID", "没有这个模块。", 422);
    if (row.task_state.feedback[module] === value) return;
    const previous = row.task_state.feedback[module];
    row.task_state.feedback[module] = value;
    // One feedback row per report/module, updated under the report lock.
    if (previous) await c.execute("UPDATE fate_operation_log SET metadata_json=? WHERE history_id=? AND session_id=? AND event='feedback' AND task_id=?", [JSON.stringify({ value, visitor: row.task_state.visitor }), id, session, module]);
    else
    await c.execute("INSERT INTO fate_operation_log (session_id,history_id,event,outcome,task_id,metadata_json) VALUES (?,?,'feedback','success',?,?)", [session, id, module, JSON.stringify({ value, visitor: row.task_state.visitor })]);
    await writeReport(c, row);
  });
}
