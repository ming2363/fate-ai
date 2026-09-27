import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { HttpError } from "./errors";
const TTL = 7 * 86400;
function signature(value: string): string {
  const secret = process.env.REPORT_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new HttpError(503, "SESSION_CONFIG", "服务正在准备，请稍后再试。", true);
  return createHmac("sha256", secret).update(value).digest("hex");
}
export function sessionId(request: Request): string | null {
  const token = /(?:^|;\s*)fate_sid_v2=([a-f0-9]{32}\.\d{10}\.[a-f0-9]{64})(?:;|$)/.exec(request.headers.get("cookie") ?? "")?.[1];
  if (!token) return null;
  const [id, expiry, sig] = token.split(".");
  if (!id || !expiry || !sig || Number(expiry) <= Date.now() / 1000 || Number(expiry) > Date.now() / 1000 + TTL + 60) return null;
  return timingSafeEqual(Buffer.from(sig), Buffer.from(signature(`${id}.${expiry}`))) ? id : null;
}
export function requireSession(request: Request): string {
  const id = sessionId(request);
  if (!id) throw new HttpError(401, "SESSION_REQUIRED", "当前会话已过期，请重新开始解读。", false);
  return id;
}
export function initializeSession(request: Request): { id: string; cookie?: string } {
  const existing = sessionId(request);
  if (existing) return { id: existing };
  const id = randomBytes(16).toString("hex");
  const value = `${id}.${Math.floor(Date.now() / 1000) + TTL}`;
  const secure = new URL(request.url).protocol === "https:" || (process.env.TRUST_PROXY_HEADERS === "true" && request.headers.get("x-forwarded-proto") === "https");
  return { id, cookie: `fate_sid_v2=${value}.${signature(value)}; HttpOnly; SameSite=Lax; Path=${process.env.NEXT_PUBLIC_BASE_PATH || "/"}; Max-Age=${TTL}${secure ? "; Secure" : ""}` };
}
