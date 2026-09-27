import { randomUUID } from "node:crypto";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "./db";
import { fail, lockedReport, transaction } from "./reports";
import { estimateFlashCost, PRICE_VERSION } from "./model-cost";
import { DEEPSEEK_MODEL } from "./deepseek";
import { PERSONA_IMAGE_MODEL } from "./persona-image";
import type { UsageNote } from "./reading-run";

export type CallTicket = { id: string; started: number; reserve: number; kind: "text" | "image"; imagePrice: number | null };
export function budgetDay(at = new Date()): string { return new Date(at.getTime() + 8 * 3600_000).toISOString().slice(0, 10); }
export function textReservation(bytes: number): number { return Math.ceil((bytes * 2 + 131072 * 8) / 1000) / 1000; }
export function concurrency(kind: "text" | "image"): number {
  const value = Number(kind === "text" ? process.env.MODEL_TEXT_CONCURRENCY || 2 : process.env.MODEL_IMAGE_CONCURRENCY || 1);
  if (!Number.isInteger(value) || value < 1 || value > 10) fail("CONCURRENCY_CONFIG", "服务并发配置有误。", 503);
  return value;
}
export async function startCall(reportId: string, taskId: string, version: number, kind: "text" | "image", bodyBytes: number): Promise<CallTicket> {
  const limit = Number(process.env.DAILY_MODEL_BUDGET_CNY);
  const imagePrice = Number(process.env.IMAGE_PRICE_CNY);
  if (!Number.isFinite(limit) || limit <= 0) fail("BUDGET_CONFIG", "服务额度尚未配置，请稍后再试。", 503);
  if (kind === "image" && (!Number.isFinite(imagePrice) || !(imagePrice > 0) || !process.env.IMAGE_PRICE_VERSION || process.env.IMAGE_PRICE_VERSION.length > 16)) fail("IMAGE_PRICE_CONFIG", "绘画额度尚未配置。", 503);
  const reserve = kind === "image" ? imagePrice : textReservation(bodyBytes);
  return transaction(async (c) => {
    const row = await lockedReport(c, reportId);
    const task = row.task_state.tasks[taskId];
    if (task?.status !== "running" || task.version !== version) fail("TASK_CANCELLED", "任务已取消。");
    // ponytail: one short ledger lock serializes reservations; shard only if admission becomes a bottleneck.
    const [totals] = await c.query<RowDataPacket[]>("SELECT COALESCE(SUM(COALESCE(estimated_cost_cny, CAST(metadata_json->>'$.reservedCny' AS DECIMAL(12,6)))),0) AS cost FROM fate_operation_log WHERE call_id IS NOT NULL AND metadata_json->>'$.budgetDay'=?", [budgetDay()]);
    if (Number(totals[0]?.cost) + reserve > limit) fail("DAILY_BUDGET", "今日生成额度已用完，请明天再试。", 429);
    const [active] = await c.query<RowDataPacket[]>("SELECT SUM(metadata_json->>'$.kind'=?) AS global_count, SUM(session_id=?) AS session_count, SUM(ip=?) AS ip_count FROM fate_operation_log WHERE call_id IS NOT NULL AND outcome='started'", [kind, row.session_id, row.task_state.ip]);
    const maximum = concurrency(kind);
    if (Number(active[0]?.global_count) >= maximum || Number(active[0]?.session_count) >= 3 || Number(active[0]?.ip_count) >= 3) fail("CAPACITY", "生成任务正在排队。", 429);
    const id = randomUUID();
    const started = Date.now();
    await c.execute("INSERT INTO fate_operation_log (call_id,session_id,history_id,event,outcome,ip,task_id,attempt,model,price_version,metadata_json) VALUES (?,?,?,'model_call','started',?,?,?,?,?,?)", [id, row.session_id, reportId, row.task_state.ip === "direct" ? null : row.task_state.ip, taskId, task.attempt, kind === "image" ? PERSONA_IMAGE_MODEL : DEEPSEEK_MODEL, kind === "image" ? process.env.IMAGE_PRICE_VERSION! : PRICE_VERSION, JSON.stringify({ visitor: row.task_state.visitor, kind, reservedCny: reserve, budgetDay: budgetDay(), billing: "reserved", started, imagePrice: kind === "image" ? imagePrice : null })]);
    return { id, started, reserve, kind, imagePrice: kind === "image" ? imagePrice : null };
  }, "fate-model-ledger");
}
export async function finishCall(ticket: CallTicket, usage?: UsageNote, imageGenerated = false): Promise<void> {
  const estimate = usage ? estimateFlashCost(usage, new Date(ticket.started)) : null;
  const cost = ticket.kind === "image" && imageGenerated ? ticket.imagePrice : estimate?.costCny ?? null;
  await database().execute("UPDATE fate_operation_log SET outcome=?,duration_ms=?,prompt_tokens=?,completion_tokens=?,cache_hit_tokens=?,cache_miss_tokens=?,estimated_cost_cny=?,price_tier=?,metadata_json=JSON_SET(metadata_json,'$.billing',?,'$.imageGenerated',?) WHERE call_id=?", [cost === null ? "unknown" : "settled", Date.now() - ticket.started, usage?.promptTokens ?? null, usage?.completionTokens ?? null, usage?.cacheHitTokens ?? null, usage?.cacheMissTokens ?? null, cost, estimate?.priceTier ?? null, cost === null ? "unknown_reserved" : "estimated", imageGenerated, ticket.id]);
}
