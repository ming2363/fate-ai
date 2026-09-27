import { z } from "zod";

const short = z.string().max(160);
const dimension = z.number().int().min(0).max(20000);
export const visitorSchema = z.object({
  screenWidth: dimension.optional(), screenHeight: dimension.optional(),
  viewportWidth: dimension.optional(), viewportHeight: dimension.optional(),
  pixelRatio: z.number().min(0).max(20).optional(), colorDepth: z.number().int().min(0).max(64).optional(),
  language: short.optional(), languages: z.array(short).max(10).optional(), timeZone: short.optional(),
  platform: short.optional(), platformVersion: short.optional(), model: short.optional(),
  architecture: short.optional(), bitness: short.optional(), browserVersion: short.optional(),
  mobile: z.boolean().optional(), touchPoints: z.number().int().min(0).max(100).optional(),
  cpuCores: z.number().int().min(1).max(1024).optional(), memoryGb: z.number().min(0).max(1024).optional(),
  network: z.enum(["slow-2g", "2g", "3g", "4g"]).optional(),
  downlinkMbps: z.number().min(0).max(100000).optional(), rttMs: z.number().min(0).max(100000).optional(),
  saveData: z.boolean().optional(), online: z.boolean().optional(), cookiesEnabled: z.boolean().optional(),
  colorScheme: z.enum(["dark", "light"]).optional(), reducedMotion: z.boolean().optional(),
  standalone: z.boolean().optional(), path: z.string().max(240).optional(),
  referrerOrigin: z.string().max(240).optional(), source: short.optional(), medium: short.optional(), campaign: short.optional(),
}).strict();
export type Visitor = z.infer<typeof visitorSchema>;

// Optional telemetry must never prevent a report. No location prompt, identifiers, or fingerprint hash.
export async function collectVisitor(): Promise<Visitor> {
  const nav = navigator as Navigator & {
    deviceMemory?: number;
    connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
    userAgentData?: { mobile?: boolean; platform?: string; getHighEntropyValues?: (keys: string[]) => Promise<Record<string, unknown>> };
  };
  let hints: Record<string, unknown> = {};
  try { hints = await Promise.race([nav.userAgentData?.getHighEntropyValues?.(["model", "platformVersion", "architecture", "bitness", "fullVersionList"]) ?? {}, new Promise<Record<string, unknown>>((resolve) => setTimeout(() => resolve({}), 250))]); } catch { /* Not supported or denied. */ }
  let referrerOrigin = "";
  try { referrerOrigin = new URL(document.referrer).origin; } catch { /* Direct visit. */ }
  const query = new URLSearchParams(location.search);
  const values: Record<string, unknown> = {
    screenWidth: screen.width, screenHeight: screen.height, viewportWidth: innerWidth, viewportHeight: innerHeight,
    pixelRatio: devicePixelRatio, colorDepth: screen.colorDepth, language: nav.language, languages: [...nav.languages].slice(0, 10),
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, platform: nav.userAgentData?.platform ?? nav.platform,
    platformVersion: hints.platformVersion, model: hints.model, architecture: hints.architecture, bitness: hints.bitness, browserVersion: Array.isArray(hints.fullVersionList) ? hints.fullVersionList.filter((v: {brand?: string}) => /Chrom|Edge/.test(v.brand ?? "")).map((v: {brand: string; version: string}) => `${v.brand} ${v.version}`).join("; ").slice(0,160) : undefined,
    mobile: nav.userAgentData?.mobile, touchPoints: nav.maxTouchPoints, cpuCores: nav.hardwareConcurrency, memoryGb: nav.deviceMemory,
    network: nav.connection?.effectiveType, downlinkMbps: nav.connection?.downlink, rttMs: nav.connection?.rtt, saveData: nav.connection?.saveData,
    online: nav.onLine, cookiesEnabled: nav.cookieEnabled, colorScheme: matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
    reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches, standalone: matchMedia("(display-mode: standalone)").matches,
    path: location.pathname.slice(0, 240), referrerOrigin, source: query.get("utm_source")?.slice(0,160), medium: query.get("utm_medium")?.slice(0,160), campaign: query.get("utm_campaign")?.slice(0,160),
  };
  return Object.fromEntries(Object.entries(values).filter(([key, value]) => value != null && visitorSchema.shape[key as keyof typeof visitorSchema.shape]?.safeParse(value).success)) as Visitor;
}
