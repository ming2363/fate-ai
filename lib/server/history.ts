import { requestVisitor } from "./visitor";
import type { Visitor } from "../shared/visitor";
import type { ChartFacts, Reading } from "@/lib/shared/chart-types";
import type { BirthInput, Focus } from "@/lib/shared/schemas";
import { blankReading } from "@/lib/shared/blank-reading";
import type { ResultSetHeader, RowDataPacket } from "mysql2";

import { database } from "@/lib/server/db";
import { clientAddress } from "@/lib/server/guard";
import { estimateFlashCost, PRICE_VERSION } from "@/lib/server/model-cost";
import type { UsageNote } from "@/lib/server/reading-run";
import type { MbtiType } from "@/lib/shared/mbti";

export async function saveChart(args: {
  id: string; sessionId: string; input: BirthInput; facts: ChartFacts; focus?: Focus; question?: string;
}): Promise<void> {
  const db = database();
  const input = JSON.stringify({ ...args.input, focus: args.focus ?? "general", question: args.question ?? "" });
  const chart = JSON.stringify(args.facts);
  const [inserted] = await db.execute<ResultSetHeader>(
    "INSERT IGNORE INTO fate_reading_history (id, session_id, title, input_json, chart_json, reading_json) VALUES (?, ?, ?, ?, ?, ?)",
    [args.id, args.sessionId, args.facts.persona.title, input, chart, JSON.stringify(blankReading(args.facts))],
  );
  if (!inserted.affectedRows) {
    await db.execute(
      "UPDATE fate_reading_history SET title = ?, input_json = ?, chart_json = ? WHERE id = ? AND session_id = ?",
      [args.facts.persona.title, input, chart, args.id, args.sessionId],
    );
  }
}

export async function saveReading(id: string, sessionId: string, patch: Partial<Reading>, status: "complete" | "partial" | "failed", focus: Focus, question: string, mbti?: MbtiType | null): Promise<void> {
  const db = database();
  const [rows] = await db.execute<RowDataPacket[]>("SELECT reading_json FROM fate_reading_history WHERE id = ? AND session_id = ?", [id, sessionId]);
  const row = rows[0];
  if (!row) return;
  const current = typeof row.reading_json === "string" ? JSON.parse(row.reading_json) as Reading : row.reading_json as Reading;
  const inputUpdates = mbti === undefined ? "'$.focus', ?, '$.question', ?" : "'$.focus', ?, '$.question', ?, '$.mbti', ?";
  await db.execute(
    `UPDATE fate_reading_history SET reading_json = ?, status = ?, input_json = JSON_SET(input_json, ${inputUpdates}) WHERE id = ? AND session_id = ?`,
    [JSON.stringify({ ...current, ...patch }), status, focus, question, ...(mbti === undefined ? [] : [mbti]), id, sessionId],
  );
}

export async function savePortrait(id: string, sessionId: string, image: string): Promise<void> {
  const matched = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!matched) throw new Error("IMAGE_INVALID");
  const [, mime, base64] = matched;
  if (!mime || !base64) throw new Error("IMAGE_INVALID");
  await database().execute(
    "UPDATE fate_reading_history SET image_mime = ?, image_data = ? WHERE id = ? AND session_id = ?",
    [mime, Buffer.from(base64, "base64"), id, sessionId],
  );
}

export async function logOperation(args: {
  request: Request; sessionId: string; event: string; outcome: string; historyId?: string | null; durationMs?: number; errorCode?: string;
  visitor?: Visitor; requestId?: string; taskId?: string; attempt?: number; model?: string; usage?: UsageNote; usageAt?: Date;
}): Promise<void> {
  const ip = clientAddress(args.request);
  const estimate = args.usage ? estimateFlashCost(args.usage, args.usageAt) : null;
  await database().execute(
    "INSERT INTO fate_operation_log (session_id, history_id, event, outcome, ip, duration_ms, error_code, request_id, task_id, attempt, model, prompt_tokens, cache_hit_tokens, cache_miss_tokens, completion_tokens, estimated_cost_cny, price_tier, price_version, metadata_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    [args.sessionId, args.historyId ?? null, args.event, args.outcome, ip === "direct" ? null : ip, args.durationMs ?? null, args.errorCode ?? null, args.requestId ?? null, args.taskId ?? null, args.attempt ?? null, args.model ?? null, args.usage?.promptTokens ?? null, args.usage?.cacheHitTokens ?? null, args.usage?.cacheMissTokens ?? null, args.usage?.completionTokens ?? null, estimate?.costCny ?? null, estimate?.priceTier ?? null, estimate ? PRICE_VERSION : null, JSON.stringify({ visitor: requestVisitor(args.request, args.visitor) })],
  );
}

export async function tryStore(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    console.error(JSON.stringify({ phase: "history-storage", errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
  }
}
