import { z } from "zod";
import { snapshot } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { errorResponse, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  try { return jsonResponse(await snapshot(z.string().uuid().parse((await context.params).id), requireSession(request))); }
  catch (error) { return errorResponse(error); }
}
