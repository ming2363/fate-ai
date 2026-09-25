import { createHash } from "node:crypto";

import type { BirthInput } from "@/lib/shared/schemas";
import { RULES_VERSION } from "@/lib/shared/versions";

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`).join(",")}}`;
}

export function chartFingerprint(input: BirthInput, asOfUtc: string): string {
  return createHash("sha256").update(stableStringify({
    rulesVersion: RULES_VERSION,
    asOfUtc,
    calendar: input.calendar,
    birthDate: input.birthDate,
    birthTime: input.birthTime,
    genderForCalculation: input.genderForCalculation,
    birthPlace: input.birthPlace,
  })).digest("hex");
}

export function requestBodyFingerprint(input: BirthInput, focus: string, question: string, asOfUtc: string, requestedTasks: readonly string[] = []): string {
  return createHash("sha256").update(stableStringify({ input, focus, question, asOfUtc, requestedTasks })).digest("hex");
}
