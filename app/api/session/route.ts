import { assertSameOrigin } from "@/lib/server/guard";
import { initializeSession } from "@/lib/server/report-session";
import { errorResponse, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try { assertSameOrigin(request); const session = initializeSession(request); return jsonResponse({ ok: true }, 200, session.cookie ? { "Set-Cookie": session.cookie } : {}); }
  catch (error) { return errorResponse(error); }
}
