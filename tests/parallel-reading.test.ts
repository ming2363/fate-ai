import { Temporal } from "@js-temporal/polyfill";
import { expect, it } from "vitest";
import { buildChart } from "@/lib/server/chart";
import { runParallelReading, type TaskReadingEmit } from "@/lib/server/reading-run";
import { validateTaskReading } from "@/lib/server/reading-validate";
import type { Reading } from "@/lib/shared/chart-types";

const facts = buildChart({ calendar: "lunar", birthDate: { year: 1999, month: 11, day: 15, isLeapMonth: false }, birthTime: { precision: "shichen", value: null, shichen: "si" }, genderForCalculation: "male", birthPlace: { cityId: null, timeZone: "Asia/Shanghai", offsetChoice: null } }, Temporal.Instant.from("2026-09-25T00:00:00Z"));
const p = (length: number, ...basisRefs: string[]) => ({ text: "先理解依据，再观察现实中的选择与边界。".repeat(20).slice(0, length), basisRefs });
const report: Reading = {
  schemaVersion: "reading.v1", overview: p(50, "natal.day_master"),
  personality: { status: "generated", summary: p(60, "natal.day_master"), strengths: [p(30, "natal.day_master"), p(30, "natal.day_master")], blindSpots: [p(30, "natal.day_master")], relationshipAdvice: p(40, "natal.day_master"), cardSentence: p(16, "persona.title") },
  currentLuck: { status: "generated", periodId: facts.luck.current!.id, theme: p(8, "luck.current.pillar"), summary: p(150, "luck.current.ten_gods", "luck.current.relation.day"), opportunity: p(150, "luck.current.ten_gods"), attention: p(120, "luck.current.relation.year") },
  annualReadings: facts.annuals.items.map((annual) => {
    const prefix = `annual.${annual.year}`;
    const relation = facts.factCatalog.find((item) => item.id.startsWith(prefix) && item.id.includes(".relation."))?.id ?? `${prefix}.ten_gods`;
    return { year: annual.year, status: "generated", summary: p(120, `${prefix}.ten_gods`, relation), outlooks: [p(50, `${prefix}.ten_gods`), p(50, relation)], career: p(100, `${prefix}.ten_gods`), relationships: p(100, relation), finance: p(100, `${prefix}.ten_gods`), actions: [p(40, `${prefix}.ten_gods`), p(40, relation)], segments: annual.segments.map((segment, index) => ({ periodId: segment.periodId, summary: p(80, `${prefix}.segment.${index + 1}`) })) };
  }), zodiacNote: p(40, "zodiac.sign"),
};
const identity = { schemaVersion: "reading-part.v1", personality: report.personality, zodiacNote: report.zodiacNote };
const fortune = { schemaVersion: "reading-part.v1", overview: report.overview, currentLuck: report.currentLuck, annualReadings: report.annualReadings };
function sse(content: string): Response {
  return new Response(`data: ${JSON.stringify({ choices: [{ delta: { content }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`, { headers: { "Content-Type": "text/event-stream" } });
}
function taskOf(init?: RequestInit): string {
  return JSON.parse(String(init?.body)).messages[1].content.includes('"task":"generate_identity"') ? "identity" : "fortune";
}

it("双任务各自校验，先完成的模块立即交付，随后完整结束", async () => {
  expect(validateTaskReading(identity, facts, "identity").ok).toBe(true);
  expect(validateTaskReading(fortune, facts, "fortune").ok).toBe(true);
  const events: TaskReadingEmit[] = [];
  let finishFortune!: (response: Response) => void;
  const pending = runParallelReading({ facts, focus: "general", question: "", apiKey: "test-key", signal: new AbortController().signal, deadlineMs: Date.now() + 5000,
    emit: (event) => events.push(event),
    fetchImpl: async (_url, init) => taskOf(init) === "identity" ? sse(JSON.stringify(identity)) : new Promise((resolve) => { finishFortune = resolve; }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(events.some((event) => event.event === "module_result" && event.taskId === "identity")).toBe(true);
  expect(events.some((event) => event.event === "module_result" && event.taskId === "fortune")).toBe(false);
  finishFortune(sse(JSON.stringify(fortune)));
  await expect(pending).resolves.toBe("success");
  expect(events.filter((event) => event.event === "module_result")).toHaveLength(2);
});

it("一块失败仍保留成功块，最多只修复一次", async () => {
  const events: TaskReadingEmit[] = [];
  let calls = 0;
  const outcome = await runParallelReading({ facts, focus: "general", question: "", apiKey: "test-key", signal: new AbortController().signal, deadlineMs: Date.now() + 5000,
    emit: (event) => events.push(event),
    fetchImpl: async (_url, init) => { calls += 1; return sse(taskOf(init) === "identity" ? JSON.stringify(identity) : "not-json"); },
  });
  expect(outcome).toBe("partial");
  expect(calls).toBe(3);
  expect(events.filter((event) => event.event === "module_retry")).toHaveLength(1);
  expect(events.some((event) => event.event === "module_result" && event.taskId === "identity")).toBe(true);
  expect(events.some((event) => event.event === "module_error" && event.taskId === "fortune")).toBe(true);
});

it("流年块先完成时也立即交付，取消会中断两个上游请求", async () => {
  const events: TaskReadingEmit[] = [];
  let finishIdentity!: (response: Response) => void;
  const pending = runParallelReading({ facts, focus: "general", question: "", apiKey: "test-key", signal: new AbortController().signal, deadlineMs: Date.now() + 5000,
    emit: (event) => events.push(event),
    fetchImpl: async (_url, init) => taskOf(init) === "fortune" ? sse(JSON.stringify(fortune)) : new Promise((resolve) => { finishIdentity = resolve; }),
  });
  await new Promise((resolve) => setTimeout(resolve, 20));
  expect(events.some((event) => event.event === "module_result" && event.taskId === "fortune")).toBe(true);
  finishIdentity(sse(JSON.stringify(identity)));
  await expect(pending).resolves.toBe("success");

  const abort = new AbortController();
  let aborted = 0;
  const cancelled = runParallelReading({ facts, focus: "general", question: "", apiKey: "test-key", signal: abort.signal, deadlineMs: Date.now() + 5000,
    emit: () => undefined,
    fetchImpl: (_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener("abort", () => { aborted += 1; reject(new DOMException("aborted", "AbortError")); }); }),
  });
  abort.abort();
  await expect(cancelled).resolves.toBe("cancelled");
  expect(aborted).toBe(2);
});
