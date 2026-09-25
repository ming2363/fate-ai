export const SITE_NAME = "知命";
export const RULES_VERSION = "rules.v1.4";
export const CHART_SCHEMA_VERSION = "chart.v1";
export const READING_SCHEMA_VERSION = "reading.v1";
export const PROMPT_VERSION = "reading-prompt.v2.0";
export const ENGINE_VERSION = "lunar-javascript@1.7.7";
export const DAY_PILLAR_SECT = 2;
export const YUN_SECT = 2;
export const CHART_OFFSET = "+08:00";
export const BOUNDARY_GUARD_SECONDS = 120;
export const AS_OF_MAX_SKEW_MS = 5 * 60 * 1000;
export const READING_TIMEOUT_MS = 300_000;
export const CONTENT_BYTE_LIMIT = 256 * 1024;
export const THINKING_CHAR_LIMIT = 6000;
export const RATE_LIMIT_COUNT = 5;
export const RATE_WINDOW_MS = 10 * 60 * 1000;
export const MIN_BIRTH_YEAR = 1900;
export const BODY_BYTE_LIMIT = 16_384;

/** 6tail 文档：1 为男，0 为女。禁止取反。 */
export const LUNAR_GENDER = {
  male: 1,
  female: 0,
} as const;
