import { z } from "zod";
import { mutateReport, snapshot } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { assertSameOrigin, consumeRateLimit } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
const schema = z.object({ requestId: z.string().uuid(), question: z.string().trim().min(1).max(200) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { assertSameOrigin(request); const session = requireSession(request); consumeRateLimit(`followup:${session}`, Date.now(), 10); const id = z.string().uuid().parse((await context.params).id); await mutateReport(id, session, { ...schema.parse(await readJson(request)), action: "followup" }); return jsonResponse(await snapshot(id, session), 202); }
  catch (error) { return errorResponse(error); }
}
