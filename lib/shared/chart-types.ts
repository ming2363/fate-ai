export type ModuleStatus = "determined" | "ambiguous" | "unavailable";

export type IsoRange = {
  readonly startUtc: string;
  readonly endUtc: string;
};

export type PillarSlot = {
  readonly status: ModuleStatus;
  readonly value: string | null;
  readonly candidates: readonly string[];
  readonly gan: string | null;
  readonly zhi: string | null;
};

export type FactItem = {
  readonly id: string;
  readonly description: string;
  readonly status: "determined" | "limitation";
};

export type LuckPeriodView = {
  readonly id: string;
  readonly formal: boolean;
  readonly pillar: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;
  readonly startLabel: string;
  readonly endLabel: string;
};

export type AnnualSegmentView = {
  readonly periodId: string;
  readonly pillar: string | null;
  readonly startUtc: string | null;
  readonly endUtc: string | null;
};

export type AnnualView = {
  readonly role: "previous" | "current" | "next";
  readonly year: number;
  readonly pillar: string;
  readonly startUtc: string;
  readonly endUtc: string;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly personalStatus: "applicable" | "before-birth" | "luck-unavailable" | "ambiguous";
  readonly segments: readonly AnnualSegmentView[];
};

export type ChartFacts = {
  readonly schemaVersion: "chart.v1";
  readonly rulesVersion: string;
  readonly engineVersion: string;
  readonly asOfUtc: string;
  readonly chartFingerprint: string;
  readonly birthUtcRanges: readonly IsoRange[];
  readonly timeBasis: {
    readonly inputPrecision: "second" | "minute" | "shichen" | "unknown";
    readonly birthTimeZone: string;
    readonly chartClock: "UTC+08:00";
    readonly trueSolarTime: false;
    readonly dayPillarSect: 2;
    readonly yunSect: 2;
    readonly localLabels: readonly string[];
    readonly beijingLabels: readonly string[];
    readonly clippedToAsOf: boolean;
    readonly lunarLabel: string | null;
    readonly solarDateLabel: string;
    readonly notes: readonly string[];
  };
  readonly bazi: {
    readonly year: PillarSlot;
    readonly month: PillarSlot;
    readonly day: PillarSlot;
    readonly time: PillarSlot;
    readonly dayMaster: {
      readonly status: ModuleStatus;
      readonly value: string | null;
      readonly candidates: readonly string[];
      readonly source: "日柱天干";
    };
  };
  readonly persona: {
    readonly status: ModuleStatus;
    readonly typeLabel: string | null;
    readonly title: string | null;
    readonly keywords: readonly string[];
    readonly element: string | null;
    readonly image: string | null;
    readonly candidates: readonly {
      readonly dayMaster: string;
      readonly typeLabel: string;
      readonly title: string;
      readonly keywords: readonly string[];
    }[];
  };
  readonly zodiac: {
    readonly system: "tropical-geocentric";
    readonly status: ModuleStatus;
    readonly nearBoundary: boolean;
    readonly sign: { readonly id: string; readonly name: string } | null;
    readonly candidates: readonly { readonly id: string; readonly name: string }[];
    readonly boundaryGuardSeconds: 120;
    readonly ingresses: readonly {
      readonly term: string;
      readonly previousSignName: string;
      readonly signName: string;
      readonly startUtc: string;
      readonly birthZoneLabel: string;
      readonly beijingLabel: string;
    }[];
    readonly source: string;
    readonly notice: string | null;
  };
  readonly luck: {
    readonly status: ModuleStatus;
    readonly started: boolean | null;
    readonly direction: "forward" | "backward" | null;
    readonly startUtc: string | null;
    readonly startLabel: string | null;
    readonly current: LuckPeriodView | null;
    readonly previous: LuckPeriodView | null;
    readonly next: LuckPeriodView | null;
    readonly candidates: readonly LuckPeriodView[];
    readonly notice: string | null;
  };
  readonly annuals: {
    readonly currentYear: number;
    readonly items: readonly AnnualView[];
  };
  readonly factCatalog: readonly FactItem[];
  readonly allowedTopics: {
    readonly personality: boolean;
    readonly currentLuck: boolean;
    readonly zodiac: boolean;
    readonly annualYears: readonly number[];
  };
  readonly limitations: readonly string[];
  readonly reportYears: readonly number[];
};

export type Paragraph = {
  readonly text: string;
  readonly basisRefs: readonly string[];
};

export type Reading = {
  readonly schemaVersion: "reading.v1";
  readonly overview: Paragraph;
  readonly personality: {
    readonly status: "generated" | "unavailable";
    readonly summary: Paragraph | null;
    readonly strengths: readonly Paragraph[];
    readonly blindSpots: readonly Paragraph[];
    readonly relationshipAdvice: Paragraph | null;
    readonly cardSentence: Paragraph | null;
  };
  readonly currentLuck: {
    readonly status: "generated" | "unavailable";
    readonly periodId: string | null;
    readonly theme: Paragraph | null;
    readonly summary: Paragraph | null;
    readonly opportunity: Paragraph | null;
    readonly attention: Paragraph | null;
  };
  readonly annualReadings: readonly {
    readonly year: number;
    readonly status: "generated" | "unavailable";
    readonly summary: Paragraph | null;
    readonly outlooks: readonly Paragraph[];
    readonly career: Paragraph | null;
    readonly relationships: Paragraph | null;
    readonly finance: Paragraph | null;
    readonly actions: readonly Paragraph[];
    readonly segments: readonly { readonly periodId: string; readonly summary: Paragraph }[];
  }[];
  readonly zodiacNote: Paragraph | null;
};

export type ReadingTaskId = "identity" | "fortune";
export type IdentityReading = Pick<Reading, "personality" | "zodiacNote">;
export type FortuneReading = Pick<Reading, "overview" | "currentLuck" | "annualReadings">;
