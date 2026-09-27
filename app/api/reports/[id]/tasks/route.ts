import { z } from "zod";
import { mutateReport, snapshot } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { assertSameOrigin, consumeRateLimit } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
const schema = z.object({ requestId: z.string().uuid(), action: z.enum(["retry", "year", "portrait", "cancel"]), task: z.string().max(16).optional(), year: z.number().int().optional() }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { assertSameOrigin(request); const session = requireSession(request); consumeRateLimit(`task:${session}`, Date.now(), 30); const id = z.string().uuid().parse((await context.params).id); await mutateReport(id, session, schema.parse(await readJson(request))); return jsonResponse(await snapshot(id, session), 202); }
  catch (error) { return errorResponse(error); }
}
