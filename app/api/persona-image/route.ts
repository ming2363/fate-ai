import { z } from "zod";

import { DAY_MASTERS } from "@/lib/shared/persona";
import { TROPICAL_SIGNS } from "@/lib/shared/signs";
import { generatePersonaImage } from "@/lib/server/persona-image";
import { HttpError } from "@/lib/server/errors";
import { assertSameOrigin, clientAddress, consumeRateLimit, readOrCreateSession } from "@/lib/server/guard";
import { errorResponse, jsonResponse, readJson } from "@/lib/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 150;

const requestSchema = z.object({ dayMaster: z.enum(DAY_MASTERS), gender: z.enum(["male", "female"]), signId: z.enum(TROPICAL_SIGNS.map((sign) => sign.id)).nullable() }).strict();

export async function POST(request: Request): Promise<Response> {
  const session = readOrCreateSession(request);
  try {
    assertSameOrigin(request);
    const { dayMaster, gender, signId } = requestSchema.parse(await readJson(request));
    const apiKey = process.env.MAAS_IMAGE_API_KEY?.trim();
    if (!apiKey) throw new HttpError(503, "IMAGE_NOT_CONFIGURED", "人物画暂不可用", false);
    consumeRateLimit(`image:${process.env.TRUST_PROXY_HEADERS === "true" ? clientAddress(request) : session.id}`);
    const signal = AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]);
    const image = await generatePersonaImage(dayMaster, gender, signId, apiKey, signal);
    const response = jsonResponse({ image });
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  } catch (error) {
    const response = errorResponse(error instanceof HttpError || error instanceof z.ZodError ? error : new HttpError(502, "IMAGE_UNAVAILABLE", "人物画暂不可用，请稍后重试", true));
    if (session.cookie) response.headers.append("Set-Cookie", session.cookie);
    return response;
  }
}
