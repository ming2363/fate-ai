import { z } from "zod";

import { SHICHEN } from "@/lib/shared/shichen";
import { MBTI_TYPES } from "@/lib/shared/mbti";

const shichenIds = SHICHEN.map((item) => item.id) as [
  (typeof SHICHEN)[number]["id"],
  ...(typeof SHICHEN)[number]["id"][],
];

export const birthDateSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int(),
    day: z.number().int(),
    isLeapMonth: z.boolean(),
  })
  .strict();

export const birthTimeSchema = z.discriminatedUnion("precision", [
  z.object({ precision: z.literal("second"), value: z.string(), shichen: z.null() }).strict(),
  z.object({ precision: z.literal("minute"), value: z.string(), shichen: z.null() }).strict(),
  z.object({ precision: z.literal("shichen"), value: z.null(), shichen: z.enum(shichenIds) }).strict(),
  z.object({ precision: z.literal("unknown"), value: z.null(), shichen: z.null() }).strict(),
]);

export const birthPlaceSchema = z
  .object({
    cityId: z.string().nullable(),
    timeZone: z.string().min(1),
    offsetChoice: z.string().nullable(),
  })
  .strict();

export const birthInputSchema = z
  .object({
    calendar: z.enum(["solar", "lunar"]),
    birthDate: birthDateSchema,
    birthTime: birthTimeSchema,
    genderForCalculation: z.enum(["male", "female"]),
    birthPlace: birthPlaceSchema,
  })
  .strict();

export const chartRequestSchema = birthInputSchema.extend({ historyId: z.string().uuid().optional() });

export const readingRequestSchema = birthInputSchema
  .extend({
    requestId: z.string().uuid(),
    historyId: z.string().uuid().optional(),
    focus: z.enum(["general", "career", "relationship", "finance"]),
    question: z.string().max(200),
    mbti: z.enum(MBTI_TYPES).nullable().optional(),
    asOfUtc: z.string().min(1),
    requestedTasks: z.array(z.enum(["identity", "fortune"])).min(1).max(2).optional(),
  })
  .strict();

export type BirthInput = z.infer<typeof birthInputSchema>;
export type ReadingRequest = z.infer<typeof readingRequestSchema>;
export type Focus = ReadingRequest["focus"];
