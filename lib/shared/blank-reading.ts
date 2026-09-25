import type { ChartFacts, Reading } from "@/lib/shared/chart-types";

export function blankReading(facts: ChartFacts): Reading {
  return {
    schemaVersion: "reading.v1",
    overview: { text: "", basisRefs: [] },
    personality: { status: "unavailable", summary: null, strengths: [], blindSpots: [], relationshipAdvice: null, cardSentence: null },
    currentLuck: { status: "unavailable", periodId: null, theme: null, summary: null, opportunity: null, attention: null },
    annualReadings: facts.reportYears.map((year) => ({ year, status: "unavailable", summary: null, outlooks: [], career: null, relationships: null, finance: null, actions: [], segments: [] })),
    zodiacNote: null,
    mbtiNote: null,
    mbtiProfile: null,
  };
}
