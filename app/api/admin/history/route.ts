import { z } from "zod";
import type { RowDataPacket } from "mysql2";

import { assertAdmin } from "@/lib/server/admin";
import { database } from "@/lib/server/db";
import { errorResponse, jsonResponse } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const querySchema = z.object({
  id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
}).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdmin(request);
    const { id, limit, offset } = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = database();
    if (id) {
      const [rows] = await db.execute<RowDataPacket[]>("SELECT id, status, title, input_json, chart_json, reading_json, image_data IS NOT NULL AS has_image, created_at, updated_at FROM fate_reading_history WHERE id = ?", [id]);
      return rows[0] ? jsonResponse(rows[0]) : jsonResponse({ code: "NOT_FOUND" }, 404);
    }
    const [rows] = await db.query<RowDataPacket[]>("SELECT id, status, title, input_json, image_data IS NOT NULL AS has_image, created_at, updated_at FROM fate_reading_history ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?", [limit + 1, offset]);
    return jsonResponse({ items: rows.slice(0, limit), nextOffset: rows.length > limit ? offset + limit : null });
  } catch (error) { return errorResponse(error); }
}
