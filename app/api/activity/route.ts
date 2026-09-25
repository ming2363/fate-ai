import { z } from "zod";

import { assertSameOrigin, clientAddress, consumeRateLimit, readOrCreateSession } from "@/lib/server/guard";
import { logOperation, tryStore } from "@/lib/server/history";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const schema = z.object({ event: z.enum(["page_view", "card_save"]), historyId: z.string().uuid().optional() }).strict();

export async function POST(request: Request): Promise<Response> {
  const session = readOrCreateSession(request);
  try {
    assertSameOrigin(request);
    const { event, historyId } = schema.parse(await readJson(request));
    consumeRateLimit(`activity:${clientAddress(request)}`, Date.now(), 60);
    await tryStore(() => logOperation({ request, sessionId: session.id, historyId, event, outcome: "success" }));
    const response = jsonResponse({ ok: true });
    if (session.cookie && event !== "page_view") response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
