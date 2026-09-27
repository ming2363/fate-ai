import { visitorSchema, type Visitor } from "../shared/visitor";

export function requestVisitor(request: Request, input?: Visitor) {
  const client = visitorSchema.parse(input ?? {});
  const ua = (request.headers.get("user-agent") ?? "").slice(0, 1024);
  const device = /bot|spider|crawler/i.test(ua) ? "bot" : /iPad|Tablet/i.test(ua) || (/Macintosh/.test(ua) && (client.touchPoints ?? 0) > 1) ? "tablet" : /Mobi|iPhone|Android/i.test(ua) || client.mobile ? "mobile" : ua ? "desktop" : "unknown";
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad|iPod/i.test(ua) || (device === "tablet" && /Macintosh/.test(ua)) ? "iOS/iPadOS" : /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS X/i.test(ua) ? "macOS" : /Linux/i.test(ua) ? "Linux" : "unknown";
  const browser = /MicroMessenger/i.test(ua) ? "微信" : /aweme|BytedanceWebview/i.test(ua) ? "抖音/字节内置" : /xhs|XiaoHongShu/i.test(ua) ? "小红书" : /Edg\//.test(ua) ? "Edge" : /Firefox|FxiOS/.test(ua) ? "Firefox" : /Chrome|CriOS/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "unknown";
  const androidModel = /Android[^;)]*;\s*(?:[a-z]{2}[-_][A-Z]{2};\s*)?([^;)]+?)(?:\s+Build\/[^;)]+)?[;)]/.exec(ua)?.[1]?.trim();
  const model = client.model || (androidModel && !/^(?:K|wv|Linux)$/i.test(androidModel) ? androidModel.slice(0,160) : null);
  let referrerOrigin = client.referrerOrigin || null;
  try { referrerOrigin = new URL(referrerOrigin || (!input ? request.headers.get("referer") : "") || "").origin; } catch { referrerOrigin = null; }
  return { ...client, referrerOrigin, userAgent: ua, acceptLanguage: request.headers.get("accept-language")?.slice(0,240) ?? null,
    device, os, browser, model, modelSource: client.model ? "client-hints" : model ? "user-agent" : "unavailable", receivedAt: new Date().toISOString() };
}
export type RequestVisitor = ReturnType<typeof requestVisitor>;
