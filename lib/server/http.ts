import { ZodError } from "zod";

import { BODY_BYTE_LIMIT } from "@/lib/shared/versions";

import { FieldInputError, HttpError } from "@/lib/server/errors";

export async function readJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > BODY_BYTE_LIMIT) {
    throw new HttpError(413, "BODY_TOO_LARGE", "请求体过大", false);
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > BODY_BYTE_LIMIT) throw new HttpError(413, "BODY_TOO_LARGE", "请求体过大", false);
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, "INVALID_JSON", "请求不是有效 JSON", false);
    throw error;
  }
}

export function jsonResponse(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  const headers = new Headers(extra);
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(body), { status, headers });
}

export function errorResponse(error: unknown): Response {
  if (error instanceof FieldInputError) {
    return jsonResponse({
      code: error.code,
      message: error.message,
      fieldPath: error.fieldPath,
      candidates: error.candidates,
    }, 422);
  }
  if (error instanceof ZodError) {
    const issue = error.issues[0];
    return jsonResponse({
      code: "FIELD_INVALID",
      message: issue?.message ?? "输入无效",
      fieldPath: issue?.path.join(".") ?? "body",
      candidates: [],
    }, 422);
  }
  if (error instanceof HttpError) {
    return jsonResponse({ code: error.code, message: error.message, retryable: error.retryable }, error.status, error.headers);
  }
  console.info(JSON.stringify({ errorCode: "UNHANDLED", phase: "error" }));
  return jsonResponse({ code: "CALCULATION_UNAVAILABLE", message: "排盘暂时不可用", retryable: true }, 503);
}
