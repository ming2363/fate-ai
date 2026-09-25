import { RATE_LIMIT_COUNT, RATE_WINDOW_MS } from "@/lib/shared/versions";

import { HttpError } from "@/lib/server/errors";

type Inflight = {
  readonly bodyHash: string;
  readonly abort: AbortController;
};

const inflight = new Map<string, Inflight>();
const hits = new Map<string, number[]>();

export function resetGuards(): void {
  inflight.clear();
  hits.clear();
}

export function clientAddress(request: Request): string {
  if (process.env.TRUST_PROXY_HEADERS === "true") {
    const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
  }
  return "direct";
}

export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get("origin");
  if (!origin) return;
  const host = request.headers.get("host");
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch (error) {
    if (error instanceof TypeError) throw new HttpError(403, "FORBIDDEN_ORIGIN", "来源不被接受", false);
    throw error;
  }
  if (!host || parsed.host !== host) throw new HttpError(403, "FORBIDDEN_ORIGIN", "来源不被接受", false);
}

export function consumeRateLimit(key: string, now = Date.now(), limit = RATE_LIMIT_COUNT): void {
  const recent = (hits.get(key) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= limit) {
    const oldest = recent[0] ?? now;
    const retryAfter = Math.ceil((RATE_WINDOW_MS - (now - oldest)) / 1000);
    throw new HttpError(429, "RATE_LIMITED", "解读请求过于频繁，请稍后再试。", true, { "Retry-After": String(retryAfter) });
  }
  recent.push(now);
  hits.set(key, recent);
}

export function beginInflight(sessionId: string, requestId: string, bodyHash: string): AbortController {
  const key = `${sessionId}:${requestId}`;
  const existing = inflight.get(key);
  if (existing) {
    if (existing.bodyHash !== bodyHash) throw new HttpError(409, "REQUEST_ID_CONFLICT", "同一个请求编号对应了不同内容。", false);
    throw new HttpError(409, "REQUEST_IN_PROGRESS", "这个解读还在生成，请勿重复提交。", false);
  }
  const abort = new AbortController();
  inflight.set(key, { bodyHash, abort });
  return abort;
}

export function endInflight(sessionId: string, requestId: string): void {
  inflight.delete(`${sessionId}:${requestId}`);
}

export function readOrCreateSession(request: Request): { readonly id: string; readonly cookie: string | null } {
  const current = request.headers.get("cookie") ?? "";
  const matched = /(?:^|;\s*)fate_sid=([a-f0-9]{32})/.exec(current);
  if (matched?.[1]) return { id: matched[1], cookie: null };
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const id = [...bytes].map((item) => item.toString(16).padStart(2, "0")).join("");
  const secure = request.headers.get("x-forwarded-proto") === "https" || new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { id, cookie: `fate_sid=${id}; HttpOnly; SameSite=Lax; Path=${process.env.NEXT_PUBLIC_BASE_PATH || "/"}; Max-Age=1800${secure}` };
}
