import { Temporal } from "@js-temporal/polyfill";

import { chartRequestSchema } from "@/lib/shared/schemas";
import { buildChart } from "@/lib/server/chart";
import { assertSameOrigin, readOrCreateSession } from "@/lib/server/guard";
import { logOperation, saveChart, tryStore } from "@/lib/server/history";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { logEvent } from "@/lib/server/log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function statusCounts(facts: ReturnType<typeof buildChart>): { determinedCount: number; ambiguousCount: number } {
  const statuses = [
    facts.bazi.year.status,
    facts.bazi.month.status,
    facts.bazi.day.status,
    facts.bazi.time.status,
    facts.persona.status,
    facts.zodiac.status,
    facts.luck.status,
  ];
  return {
    determinedCount: statuses.filter((item) => item === "determined").length,
    ambiguousCount: statuses.filter((item) => item === "ambiguous").length,
  };
}

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const session = readOrCreateSession(request);
  try {
    assertSameOrigin(request);
    const { historyId, ...input } = chartRequestSchema.parse(await readJson(request));
    const facts = buildChart(input, Temporal.Now.instant());
    const counts = statusCounts(facts);
    logEvent({ phase: "chart", durationMs: Date.now() - started, rulesVersion: facts.rulesVersion, ...counts });
    if (historyId) await tryStore(() => saveChart({ id: historyId, sessionId: session.id, input, facts }));
    await tryStore(() => logOperation({ request, sessionId: session.id, historyId, event: "chart", outcome: "success", durationMs: Date.now() - started }));
    const response = jsonResponse(facts);
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    logEvent({ phase: "chart-error", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    await tryStore(() => logOperation({ request, sessionId: session.id, event: "chart", outcome: "failed", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
    const response = errorResponse(error);
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  }
}
