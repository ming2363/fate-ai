const ALLOWED = [
  "requestId",
  "phase",
  "durationMs",
  "modelMs",
  "promptTokens",
  "completionTokens",
  "rulesVersion",
  "errorCode",
  "determinedCount",
  "ambiguousCount",
  "attempt",
] as const;

export type LogFields = Partial<Record<(typeof ALLOWED)[number], string | number | null>>;

export function logEvent(fields: LogFields): void {
  const safe: Record<string, string | number | null> = {};
  for (const key of ALLOWED) {
    if (fields[key] !== undefined) safe[key] = fields[key] ?? null;
  }
  console.info(JSON.stringify(safe));
}
