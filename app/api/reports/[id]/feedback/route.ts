import { z } from "zod";
import { feedback } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { assertSameOrigin, consumeRateLimit } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
const schema = z.object({ module: z.string().max(16), value: z.enum(["有帮助", "太笼统", "术语看不懂"]) }).strict();
export async function POST(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { assertSameOrigin(request); const session = requireSession(request); consumeRateLimit(`feedback:${session}`, Date.now(), 30); const input = schema.parse(await readJson(request)); await feedback(z.string().uuid().parse((await context.params).id), session, input.module, input.value); return jsonResponse({ ok: true }); }
  catch (error) { return errorResponse(error); }
}
