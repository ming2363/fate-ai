import { Temporal } from "@js-temporal/polyfill";

import { chartRequestSchema } from "@/lib/shared/schemas";
import { buildChart } from "@/lib/server/chart";
import { assertSameOrigin, consumeRateLimit } from "@/lib/server/guard";
import { requireSession } from "@/lib/server/report-session";
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
  try {
    assertSameOrigin(request);
    const session = requireSession(request);
    consumeRateLimit(`chart:${session}`);
    const { historyId: _historyId, ...input } = chartRequestSchema.parse(await readJson(request));
    const facts = buildChart(input, Temporal.Now.instant());
    const counts = statusCounts(facts);
    logEvent({ phase: "chart", durationMs: Date.now() - started, rulesVersion: facts.rulesVersion, ...counts });
    // Read-only calculation; only /api/reports creates owned, durable reports.
    return jsonResponse(facts);
  } catch (error) {
    logEvent({ phase: "chart-error", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" });
    return errorResponse(error);
  }
}
