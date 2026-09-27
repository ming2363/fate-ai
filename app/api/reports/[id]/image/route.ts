import { z } from "zod";
import type { RowDataPacket } from "mysql2/promise";
import { database } from "@/lib/server/db";
import { fail } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { errorResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const [rows] = await database().query<RowDataPacket[]>("SELECT image_data,image_mime FROM fate_reading_history WHERE id=? AND session_id=? AND schema_version=2", [id, requireSession(request)]);
    if (!rows[0]?.image_data) fail("NOT_FOUND", "人物画尚未生成。", 404);
    return new Response(new Uint8Array(rows[0].image_data), { headers: { "Content-Type": rows[0].image_mime, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return errorResponse(error); }
}
