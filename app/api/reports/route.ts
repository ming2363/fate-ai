import { visitorSchema } from "@/lib/shared/visitor";
import { requestVisitor } from "@/lib/server/visitor";
import { reportInputSchema } from "@/lib/shared/report";
import { createReport, snapshot } from "@/lib/server/reports";
import { requireSession } from "@/lib/server/report-session";
import { assertSameOrigin, clientAddress, consumeRateLimit } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
export const runtime = "nodejs";
export async function POST(request: Request): Promise<Response> {
  try { assertSameOrigin(request); const session = requireSession(request); consumeRateLimit(`report:${session}`, Date.now(), 20); const { visitor, ...input } = reportInputSchema.extend({ visitor: visitorSchema.optional() }).parse(await readJson(request)); const id = await createReport(input, session, clientAddress(request), requestVisitor(request, visitor)); return jsonResponse(await snapshot(id, session), 202); }
  catch (error) { return errorResponse(error); }
}
