export const MBTI_TYPES = [
  "ISTJ", "ISFJ", "INFJ", "INTJ", "ISTP", "ISFP", "INFP", "INTP",
  "ESTP", "ESFP", "ENFP", "ENTP", "ESTJ", "ESFJ", "ENFJ", "ENTJ",
] as const;

export type MbtiType = (typeof MBTI_TYPES)[number];

export type MbtiProfile = {
  readonly type: MbtiType;
  readonly overview: string;
  readonly strengths: string;
  readonly blindSpots: string;
  readonly communication: string;
  readonly growth: string;
};
