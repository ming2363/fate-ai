import { visitorSchema } from "@/lib/shared/visitor";
import { z } from "zod";

import { assertSameOrigin, clientAddress, consumeRateLimit } from "@/lib/server/guard";
import { requireSession } from "@/lib/server/report-session";
import { snapshot } from "@/lib/server/reports";
import { logOperation, tryStore } from "@/lib/server/history";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ event: z.enum(["page_view", "card_save"]), historyId: z.string().uuid().optional(), visitor: visitorSchema.optional() }).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    assertSameOrigin(request);
    const session = { id: requireSession(request) };
    const { event, historyId, visitor } = schema.parse(await readJson(request));
    if (historyId) await snapshot(historyId, session.id);
    consumeRateLimit(`activity:${clientAddress(request)}`, Date.now(), 60);
    await tryStore(() => logOperation({ request, sessionId: session.id, historyId, event, outcome: "success", visitor }));
    const response = jsonResponse({ ok: true });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
