import { z } from "zod";

import { DAY_MASTERS } from "@/lib/shared/persona";
import { TROPICAL_SIGNS } from "@/lib/shared/signs";
import { generatePersonaImage } from "@/lib/server/persona-image";
import { HttpError } from "@/lib/server/errors";
import { assertSameOrigin, clientAddress, consumeRateLimit, readOrCreateSession } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";
import { logOperation, savePortrait, tryStore } from "@/lib/server/history";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

const requestSchema = z.object({ dayMaster: z.enum(DAY_MASTERS), gender: z.enum(["male", "female"]), signId: z.enum(TROPICAL_SIGNS.map((sign) => sign.id)).nullable(), historyId: z.string().uuid().optional() }).strict();

export async function POST(request: Request): Promise<Response> {
  const started = Date.now();
  const session = readOrCreateSession(request);
  let historyId: string | undefined;
  try {
    assertSameOrigin(request);
    const input = requestSchema.parse(await readJson(request));
    const { dayMaster, gender, signId } = input;
    historyId = input.historyId;
    const apiKey = process.env.MAAS_IMAGE_API_KEY?.trim();
    if (!apiKey) throw new HttpError(503, "IMAGE_NOT_CONFIGURED", "人物画暂不可用", false);
    consumeRateLimit(`image:${process.env.TRUST_PROXY_HEADERS === "true" ? clientAddress(request) : session.id}`);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]);
    const image = await generatePersonaImage(dayMaster, gender, signId, apiKey, signal);
    const recordId = historyId;
    if (recordId) await tryStore(() => savePortrait(recordId, session.id, image));
    await tryStore(() => logOperation({ request, sessionId: session.id, historyId, event: "portrait", outcome: "success", durationMs: Date.now() - started }));
    const response = jsonResponse({ image });
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    await tryStore(() => logOperation({ request, sessionId: session.id, historyId, event: "portrait", outcome: "failed", durationMs: Date.now() - started, errorCode: error instanceof Error ? error.name : "UNKNOWN" }));
    const response = errorResponse(error instanceof HttpError || error instanceof z.ZodError ? error : new HttpError(502, "IMAGE_UNAVAILABLE", "人物画暂不可用，请稍后重试", true));
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  }
}
