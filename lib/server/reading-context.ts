import type { ChartFacts, ReadingTaskId } from "@/lib/shared/chart-types";
import type { Focus } from "@/lib/shared/schemas";
import { PROMPT_VERSION } from "@/lib/shared/versions";

export function buildReadingContext(facts: ChartFacts, focus: Focus, question: string): {
  readonly task: "generate_reading";
  readonly promptVersion: string;
  readonly trusted_context: Record<string, unknown>;
  readonly user_input: { readonly focus: Focus; readonly question: string };
} {
  return {
    task: "generate_reading",
    promptVersion: PROMPT_VERSION,
    trusted_context: {
      rulesVersion: facts.rulesVersion,
      identity: {
        status: facts.persona.status,
        typeLabel: facts.persona.typeLabel,
        title: facts.persona.title,
        keywords: facts.persona.keywords,
        element: facts.persona.element,
        candidates: facts.persona.candidates,
      },
      natalFacts: facts.bazi,
      zodiac: {
        system: facts.zodiac.system,
        status: facts.zodiac.status,
        nearBoundary: facts.zodiac.nearBoundary,
        sign: facts.zodiac.sign,
        candidates: facts.zodiac.candidates,
      },
      currentLuck: {
        status: facts.luck.status,
        periodId: facts.luck.current?.id ?? null,
        pillar: facts.luck.current?.pillar ?? null,
        formal: facts.luck.current?.formal ?? null,
        direction: facts.luck.direction,
      },
      reportYears: facts.reportYears,
      annualContexts: facts.annuals.items.map((item) => ({
        year: item.year,
        pillar: item.pillar,
        personalStatus: item.personalStatus,
        segmentPeriodIds: item.segments.map((segment) => segment.periodId),
        segments: item.segments.map((segment) => ({ periodId: segment.periodId, pillar: segment.pillar })),
      })),
      allowedTopics: facts.allowedTopics,
      limitations: facts.limitations,
      factCatalog: facts.factCatalog,
    },
    user_input: { focus, question },
  };
}

export function buildTaskContext(facts: ChartFacts, taskId: ReadingTaskId, focus: Focus, question: string) {
  const identity = taskId === "identity";
  return {
    task: identity ? "generate_identity" as const : "generate_fortune" as const,
    promptVersion: PROMPT_VERSION,
    trusted_context: identity ? {
      rulesVersion: facts.rulesVersion,
      asOfUtc: facts.asOfUtc,
      identity: facts.persona,
      natalFacts: facts.bazi,
      zodiac: { status: facts.zodiac.status, nearBoundary: facts.zodiac.nearBoundary, sign: facts.zodiac.sign, candidates: facts.zodiac.candidates },
      allowedTopics: { personality: facts.allowedTopics.personality, zodiac: facts.allowedTopics.zodiac },
      limitations: facts.limitations.filter((item) => /日主|时柱|星座|交界|出生时间/.test(item)),
      factCatalog: facts.factCatalog.filter((item) => /^(natal\.|persona\.|zodiac\.|limit\.(day_master|zodiac))/.test(item.id)),
    } : {
      rulesVersion: facts.rulesVersion,
      natalFacts: facts.bazi,
      currentLuck: { status: facts.luck.status, periodId: facts.luck.current?.id ?? null, pillar: facts.luck.current?.pillar ?? null, formal: facts.luck.current?.formal ?? null, direction: facts.luck.direction },
      reportYears: facts.reportYears,
      annualContexts: facts.annuals.items.map((item) => ({
        year: item.year, role: item.role, pillar: item.pillar, personalStatus: item.personalStatus,
        segments: item.segments.map((segment) => ({ periodId: segment.periodId, pillar: segment.pillar })),
      })),
      allowedTopics: { currentLuck: facts.allowedTopics.currentLuck, annualYears: facts.allowedTopics.annualYears },
      limitations: facts.limitations.filter((item) => !/星座|交界/.test(item)),
      factCatalog: facts.factCatalog.filter((item) => /^(natal\.|luck\.|annual\.|limit\.)/.test(item.id) && !item.id.includes("zodiac")),
    },
    user_input: { focus, question },
  };
}
