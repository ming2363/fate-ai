import { z } from "zod";

import type { ChartFacts, FortuneReading, IdentityReading, Paragraph, Reading, ReadingTaskId } from "@/lib/shared/chart-types";
import { allTypeLabels } from "@/lib/shared/persona";
import { allSignNames } from "@/lib/shared/signs";

const paragraphSchema = z.object({
  text: z.string(),
  basisRefs: z.array(z.string()).min(1).max(4),
}).strict();

const readingSchema = z.object({
  schemaVersion: z.literal("reading.v1"),
  overview: paragraphSchema,
  personality: z.object({
    status: z.enum(["generated", "unavailable"]),
    summary: paragraphSchema.nullable(),
    strengths: z.array(paragraphSchema),
    blindSpots: z.array(paragraphSchema),
    relationshipAdvice: paragraphSchema.nullable(),
    cardSentence: paragraphSchema.nullable(),
  }).strict(),
  currentLuck: z.object({
    status: z.enum(["generated", "unavailable"]),
    periodId: z.string().nullable(),
    theme: paragraphSchema.nullable(),
    summary: paragraphSchema.nullable(),
    opportunity: paragraphSchema.nullable(),
    attention: paragraphSchema.nullable(),
  }).strict(),
  annualReadings: z.array(z.object({
    year: z.number().int(),
    status: z.enum(["generated", "unavailable"]),
    summary: paragraphSchema.nullable(),
    outlooks: z.array(paragraphSchema),
    career: paragraphSchema.nullable(),
    relationships: paragraphSchema.nullable(),
    finance: paragraphSchema.nullable(),
    actions: z.array(paragraphSchema),
    segments: z.array(z.object({ periodId: z.string(), summary: paragraphSchema }).strict()),
  }).strict()),
  zodiacNote: paragraphSchema.nullable(),
}).strict();

const FORBIDDEN = [/克夫/, /克妻/, /命差/, /必赚/, /一定会死/, /必死/, /破产/, /确诊/, /买入/, /卖出/, /幸运指数/, /准确率/, /运势\s*\d/];

function chars(text: string): number {
  return [...text].length;
}

function lengthError(path: string, text: string, min: number, max: number): string | null {
  const count = chars(text);
  if (count < min || ((path === "cardSentence" || path === "currentLuck.theme") && count > max)) return `${path} 长度 ${count} 不在 ${min}-${max}`;
  return null;
}

function refsError(path: string, paragraph: Paragraph, allowed: ReadonlySet<string>, prefix: RegExp): string | null {
  for (const ref of paragraph.basisRefs) {
    if (!allowed.has(ref)) return `${path} 引用了未知事实 ${ref}`;
    if (!prefix.test(ref)) return `${path} 引用了与本模块无关的事实 ${ref}`;
  }
  return null;
}

function collectText(reading: Reading): string {
  const paragraphs: Array<Paragraph | null> = [
    reading.overview,
    reading.personality.summary,
    reading.personality.relationshipAdvice,
    reading.personality.cardSentence,
    reading.currentLuck.theme,
    reading.currentLuck.summary,
    reading.currentLuck.opportunity,
    reading.currentLuck.attention,
    reading.zodiacNote,
    ...reading.personality.strengths,
    ...reading.personality.blindSpots,
    ...reading.annualReadings.flatMap((item) => [item.summary, item.career, item.relationships, item.finance, ...item.outlooks, ...item.actions, ...item.segments.map((segment) => segment.summary)]),
  ];
  return paragraphs.flatMap((item) => item ? [item.text] : []).join("\n");
}

function analysisRefsError(prefix: string, summary: Paragraph, paragraphs: readonly Paragraph[], ids: ReadonlySet<string>): string | null {
  const tenGods = `${prefix}.ten_gods`;
  if (ids.has(tenGods) && !summary.basisRefs.includes(tenGods)) return `${prefix} 概括须引用已计算的十神依据 ${tenGods}`;
  const relations = [...ids].filter((id) => id.startsWith(`${prefix}.`) && id.includes(".relation."));
  if (relations.length && !paragraphs.some((item) => item.basisRefs.some((ref) => relations.includes(ref)))) return `${prefix} 须至少解释一项已计算的合冲或重复关系`;
  return null;
}

export function validateReading(payload: unknown, facts: ChartFacts): { readonly ok: true; readonly reading: Reading; readonly status: "generated" | "partial" } | { readonly ok: false; readonly errors: readonly string[] } {
  const parsed = readingSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, errors: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`) };
  }
  const reading = parsed.data;
  const errors: string[] = [];
  const ids = new Set(facts.factCatalog.map((item) => item.id));
  const overviewError = lengthError("overview.text", reading.overview.text, 1, 120);
  if (overviewError) errors.push(overviewError);
  const overviewRefs = refsError("overview", reading.overview, ids, /.*/);
  if (overviewRefs) errors.push(overviewRefs);

  if (facts.allowedTopics.personality) {
    if (reading.personality.status !== "generated" || !reading.personality.summary || !reading.personality.relationshipAdvice || !reading.personality.cardSentence) {
      errors.push("personality 必须生成完整段落");
    } else {
      const checks = [
        lengthError("personality.summary", reading.personality.summary.text, 40, 100),
        lengthError("relationshipAdvice", reading.personality.relationshipAdvice.text, 20, 70),
        lengthError("cardSentence", reading.personality.cardSentence.text, 8, 24),
      ];
      if (reading.personality.strengths.length !== 2) errors.push("strengths 必须正好 2 项");
      if (reading.personality.blindSpots.length !== 1) errors.push("blindSpots 必须正好 1 项");
      reading.personality.strengths.forEach((item, index) => checks.push(lengthError(`strengths.${index}`, item.text, 20, 60)));
      reading.personality.blindSpots.forEach((item, index) => checks.push(lengthError(`blindSpots.${index}`, item.text, 20, 60)));
      for (const item of [reading.personality.summary, reading.personality.relationshipAdvice, reading.personality.cardSentence, ...reading.personality.strengths, ...reading.personality.blindSpots]) {
        const refError = refsError("personality", item, ids, /^(natal\.|persona\.|limit\.)/);
        if (refError) errors.push(refError);
      }
      for (const check of checks) if (check) errors.push(check);
    }
  } else if (reading.personality.status !== "unavailable" || reading.personality.summary || reading.personality.relationshipAdvice || reading.personality.cardSentence || reading.personality.strengths.length > 0 || reading.personality.blindSpots.length > 0) {
    errors.push("personality 未获允许，必须 unavailable");
  }

  const currentId = facts.luck.current?.id ?? null;
  if (facts.allowedTopics.currentLuck && currentId) {
    const luck = reading.currentLuck;
    if (luck.status !== "generated" || luck.periodId !== currentId || !luck.theme || !luck.summary || !luck.opportunity || !luck.attention) {
      errors.push("currentLuck 必须使用后端当前阶段并写完整段落");
    } else {
      const checks = [
        lengthError("currentLuck.theme", luck.theme.text, 4, 12),
        lengthError("currentLuck.summary", luck.summary.text, 120, 220),
        lengthError("currentLuck.opportunity", luck.opportunity.text, 120, 220),
        lengthError("currentLuck.attention", luck.attention.text, 100, 180),
        analysisRefsError("luck.current", luck.summary, [luck.summary, luck.opportunity, luck.attention], ids),
      ];
      for (const item of [luck.theme, luck.summary, luck.opportunity, luck.attention]) {
        const refError = refsError("currentLuck", item, ids, /^(natal\.|luck\.|limit\.)/);
        if (refError) errors.push(refError);
      }
      for (const check of checks) if (check) errors.push(check);
    }
  } else if (reading.currentLuck.status !== "unavailable" || reading.currentLuck.periodId || reading.currentLuck.theme || reading.currentLuck.summary || reading.currentLuck.opportunity || reading.currentLuck.attention) {
    errors.push("currentLuck 未获允许，必须 unavailable");
  }

  if (reading.annualReadings.map((item) => item.year).join(",") !== facts.reportYears.join(",")) {
    errors.push("annualReadings 年份必须与 reportYears 顺序一致");
  }
  for (const annual of reading.annualReadings) {
    const context = facts.annuals.items.find((item) => item.year === annual.year);
    const allowed = facts.allowedTopics.annualYears.includes(annual.year);
    if (!context) continue;
    if (!allowed) {
      if (annual.status !== "unavailable" || annual.summary || annual.career || annual.relationships || annual.finance || annual.outlooks.length > 0 || annual.actions.length > 0 || annual.segments.length > 0) {
        errors.push(`${annual.year} 不允许个人解读`);
      }
      continue;
    }
    if (annual.status !== "generated" || !annual.summary || !annual.career || !annual.relationships || !annual.finance || annual.outlooks.length !== 2 || annual.actions.length !== 2) {
      errors.push(`${annual.year} 流年段落不完整`);
      continue;
    }
    const expectedIds = context.segments.map((segment) => segment.periodId);
    if (annual.segments.map((segment) => segment.periodId).join(",") !== expectedIds.join(",")) {
      errors.push(`${annual.year} 阶段编号与后端不一致`);
    }
    const checks = [
      lengthError(`${annual.year}.summary`, annual.summary.text, 100, 180),
      lengthError(`${annual.year}.career`, annual.career.text, 80, 150),
      lengthError(`${annual.year}.relationships`, annual.relationships.text, 80, 150),
      lengthError(`${annual.year}.finance`, annual.finance.text, 80, 150),
      analysisRefsError(`annual.${annual.year}`, annual.summary, [annual.summary, annual.career, annual.relationships, annual.finance, ...annual.outlooks, ...annual.actions, ...annual.segments.map((item) => item.summary)], ids),
    ];
    annual.outlooks.forEach((item, index) => checks.push(lengthError(`${annual.year}.outlooks.${index}`, item.text, 35, 85)));
    annual.actions.forEach((item, index) => checks.push(lengthError(`${annual.year}.actions.${index}`, item.text, 30, 60)));
    annual.segments.forEach((item, index) => checks.push(lengthError(`${annual.year}.segments.${index}`, item.summary.text, 60, 120)));
    const currentLuckApplies = context.segments.some((segment) => segment.periodId === facts.luck.current?.id);
    const yearPrefix = new RegExp(`^(annual\\.${annual.year}\\.|natal\\.|${currentLuckApplies ? "luck\\.current\\.|" : ""}limit\\.)`);
    for (const item of [annual.summary, annual.career, annual.relationships, annual.finance, ...annual.outlooks, ...annual.actions, ...annual.segments.map((segment) => segment.summary)]) {
      const refError = refsError(String(annual.year), item, ids, yearPrefix);
      if (refError) errors.push(refError);
    }
    for (const check of checks) if (check) errors.push(check);
  }

  if (facts.allowedTopics.zodiac) {
    if (!reading.zodiacNote) errors.push("zodiacNote 必须填写");
    else {
      const note = reading.zodiacNote;
      const length = lengthError("zodiacNote", note.text, 100, 240);
      if (length) errors.push(length);
      if (!["工作学习：", "人际关系：", "日常生活："].every((label) => note.text.includes(label))) errors.push("zodiacNote 须分别写工作学习、人际关系、日常生活三个情境");
      const refError = refsError("zodiacNote", note, ids, /^(zodiac\.|limit\.)/);
      if (refError) errors.push(refError);
    }
  } else if (reading.zodiacNote) {
    errors.push("星座不唯一或靠近交界时 zodiacNote 必须为 null");
  }

  const prose = collectText(reading);
  if (/[<>]/.test(prose)) errors.push("正文不能包含 HTML");
  for (const pattern of FORBIDDEN) {
    if (pattern.test(prose)) errors.push(`正文包含不允许的表达：${pattern.source}`);
  }
  const allowedSigns = new Set(facts.zodiac.candidates.map((item) => item.name));
  if (facts.zodiac.sign) allowedSigns.add(facts.zodiac.sign.name);
  for (const name of allSignNames()) {
    if (prose.includes(name) && !allowedSigns.has(name)) errors.push(`正文提到了未授权星座 ${name}`);
  }
  const allowedLabels = new Set(facts.persona.typeLabel ? [facts.persona.typeLabel] : facts.persona.candidates.map((item) => item.typeLabel));
  for (const label of allTypeLabels()) {
    if (prose.includes(label) && !allowedLabels.has(label)) errors.push(`正文改写了类型标签 ${label}`);
  }
  if (errors.length > 0) return { ok: false, errors };
  const partial = reading.personality.status === "unavailable" || reading.currentLuck.status === "unavailable" || reading.annualReadings.some((item) => item.status === "unavailable");
  return { ok: true, reading, status: partial ? "partial" : "generated" };
}

const identitySchema = readingSchema.pick({ personality: true, zodiacNote: true }).extend({ schemaVersion: z.literal("reading-part.v1") }).strict();
const fortuneSchema = readingSchema.pick({ overview: true, currentLuck: true, annualReadings: true }).extend({ schemaVersion: z.literal("reading-part.v1") }).strict();

export function validateTaskReading(payload: unknown, facts: ChartFacts, taskId: "identity"): { readonly ok: true; readonly part: IdentityReading } | { readonly ok: false; readonly errors: readonly string[] };
export function validateTaskReading(payload: unknown, facts: ChartFacts, taskId: "fortune"): { readonly ok: true; readonly part: FortuneReading } | { readonly ok: false; readonly errors: readonly string[] };
export function validateTaskReading(payload: unknown, facts: ChartFacts, taskId: ReadingTaskId): { readonly ok: true; readonly part: IdentityReading | FortuneReading } | { readonly ok: false; readonly errors: readonly string[] } {
  const parsed = (taskId === "identity" ? identitySchema : fortuneSchema).safeParse(payload);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.slice(0, 20).map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`) };
  const emptyIdentity: IdentityReading = { personality: { status: "unavailable", summary: null, strengths: [], blindSpots: [], relationshipAdvice: null, cardSentence: null }, zodiacNote: null };
  const emptyFortune: FortuneReading = {
    overview: { text: "已展示可确认的命盘信息。", basisRefs: [facts.factCatalog[0]?.id ?? ""] },
    currentLuck: { status: "unavailable", periodId: null, theme: null, summary: null, opportunity: null, attention: null },
    annualReadings: facts.reportYears.map((year) => ({ year, status: "unavailable", summary: null, outlooks: [], career: null, relationships: null, finance: null, actions: [], segments: [] })),
  };
  const { schemaVersion: _partVersion, ...part } = parsed.data;
  const reading = taskId === "identity"
    ? { ...emptyFortune, ...part, schemaVersion: "reading.v1" as const }
    : { ...emptyIdentity, ...part, schemaVersion: "reading.v1" as const };
  const scopedFacts: ChartFacts = {
    ...facts,
    allowedTopics: taskId === "identity"
      ? { ...facts.allowedTopics, currentLuck: false, annualYears: [] }
      : { ...facts.allowedTopics, personality: false, zodiac: false },
  };
  const validated = validateReading(reading, scopedFacts);
  if (!validated.ok) return validated;
  return { ok: true, part: taskId === "identity"
    ? { personality: validated.reading.personality, zodiacNote: validated.reading.zodiacNote }
    : { overview: validated.reading.overview, currentLuck: validated.reading.currentLuck, annualReadings: validated.reading.annualReadings } };
}
