import { z } from "zod";
import { birthInputSchema } from "./schemas";
import { MBTI_TYPES } from "./mbti";
import type { ChartFacts, Reading } from "./chart-types";

export const reportInputSchema = birthInputSchema.extend({
  requestId: z.string().uuid(), focus: z.enum(["general", "career", "relationship", "finance"]),
  question: z.string().trim().max(200), mbti: z.enum(MBTI_TYPES).nullable(),
  nickname: z.string().trim().max(20).default(""), cardNickname: z.boolean().default(false),
}).strict();
export type ReportInput = z.infer<typeof reportInputSchema>;
export type TaskStatus = "idle" | "queued" | "running" | "completed" | "failed" | "interrupted" | "cancelled" | "unavailable";
export type ReportTask = { status: TaskStatus; version: number; attempt: number; leaseUntil?: number; startedAt?: number; finishedAt?: number; error?: string; question?: string; replacement?: boolean };
export type Followup = { question: string; answer: string; basisRefs: string[]; actions: string[] };
export type ReportState = {
  tasks: Record<string, ReportTask>; requests: Record<string, { hash: string; task: string }>;
  visitor?: import("../server/visitor").RequestVisitor; inputHash: string; ip: string; createdAt: number; imageVersion: number; replacements: number;
  followups: Record<string, Followup>; feedback: Record<string, string>;
};
export type ReportSnapshot = { id: string; revision: number; input: ReportInput; chart: ChartFacts; reading: Reading; tasks: Record<string, ReportTask>; followups: Record<string, Followup>; feedback: Record<string, string>; imageVersion: number; replacements: number; createdAt: number };
export function activeTask(task: ReportTask | undefined): boolean { return task?.status === "queued" || task?.status === "running"; }
export function initialTasks(chart: ChartFacts, mbti: boolean): Record<string, ReportTask> {
  const task = (available: boolean, queued = true): ReportTask => ({ status: available ? queued ? "queued" : "idle" : "unavailable", version: 1, attempt: 0 });
  return {
    ...(mbti ? { mbti: task(true) } : {}),
    identity: task(chart.allowedTopics.personality || chart.allowedTopics.zodiac),
    fortune_current: task(chart.allowedTopics.currentLuck || chart.allowedTopics.annualYears.includes(chart.annuals.currentYear)),
    portrait: task(chart.persona.status === "determined"),
    ...Object.fromEntries(chart.annuals.items.filter((a) => a.year !== chart.annuals.currentYear).map((a) => [`annual_${a.year}`, task(chart.allowedTopics.annualYears.includes(a.year), false)])),
  };
}
export function scopeYear(chart: ChartFacts, year: number): ChartFacts {
  return { ...chart, reportYears: [year], annuals: { ...chart.annuals, items: chart.annuals.items.filter((a) => a.year === year) }, allowedTopics: { ...chart.allowedTopics, annualYears: chart.allowedTopics.annualYears.filter((y) => y === year), currentLuck: year === chart.annuals.currentYear && chart.allowedTopics.currentLuck } };
}
export function mergeReading(current: Reading, part: Partial<Reading>, task: string): Reading {
  if (task === "identity") return { ...current, personality: part.personality ?? current.personality, zodiacNote: part.zodiacNote ?? null, mbtiNote: part.mbtiNote ?? null };
  if (task === "mbti") return { ...current, mbtiProfile: part.mbtiProfile ?? null };
  const annuals = new Map(current.annualReadings.map((a) => [a.year, a]));
  for (const a of part.annualReadings ?? []) annuals.set(a.year, a);
  return { ...current, ...(task === "fortune_current" ? { overview: part.overview ?? current.overview, currentLuck: part.currentLuck ?? current.currentLuck } : {}), annualReadings: [...annuals.values()].sort((a, b) => a.year - b.year) };
}
