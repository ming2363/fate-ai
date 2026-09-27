import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import type { RowDataPacket } from "mysql2/promise";
import { assertAdmin } from "@/lib/server/admin";
import { database } from "@/lib/server/db";
import { errorResponse, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
const schema = z.object({ date: z.iso.date().optional(), historyId: z.string().uuid().optional(),
  event: z.string().regex(/^[a-z_]{1,32}$/).optional(), device: z.enum(["mobile", "tablet", "desktop", "bot", "unknown"]).optional(),
  os: z.string().max(40).optional(), browser: z.string().max(40).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20), beforeId: z.string().regex(/^[1-9]\d{0,19}$/).optional(),
}).strict();
export async function GET(request: Request): Promise<Response> {
  try {
    assertAdmin(request);
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const conditions: string[] = []; const values: (string | number)[] = [];
    if (input.date) { conditions.push("created_at>=? AND created_at<?"); values.push(input.date, Temporal.PlainDate.from(input.date).add({ days: 1 }).toString()); }
    for (const [key, column] of [["historyId", "history_id"], ["event", "event"], ["device", "metadata_json->>'$.visitor.device'"], ["os", "metadata_json->>'$.visitor.os'"], ["browser", "metadata_json->>'$.visitor.browser'"]] as const) {
      if (input[key]) { conditions.push(`${column}=?`); values.push(input[key]); }
    }
    if (input.beforeId) { conditions.push("id<?"); values.push(input.beforeId); }
    const [rows] = await database().query<RowDataPacket[]>(`SELECT CAST(id AS CHAR) AS id,history_id,session_id,event,outcome,ip,duration_ms,error_code,task_id,attempt,model,prompt_tokens,completion_tokens,cache_hit_tokens,cache_miss_tokens,estimated_cost_cny,price_version,call_id,metadata_json,created_at FROM fate_operation_log${conditions.length ? " WHERE " + conditions.join(" AND ") : ""} ORDER BY id DESC LIMIT ?`, [...values, input.limit + 1]);
    return jsonResponse({ items: rows.slice(0, input.limit), nextBeforeId: rows.length > input.limit ? rows[input.limit - 1]!.id : null, timeZone: "Asia/Shanghai" });
  } catch (error) { return errorResponse(error); }
}
