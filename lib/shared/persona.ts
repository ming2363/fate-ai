export const DAY_MASTERS = [
  "甲",
  "乙",
  "丙",
  "丁",
  "戊",
  "己",
  "庚",
  "辛",
  "壬",
  "癸",
] as const;

export type DayMaster = (typeof DAY_MASTERS)[number];

export type PersonaProfile = {
  readonly gan: DayMaster;
  readonly element: "木" | "火" | "土" | "金" | "水";
  readonly image: string;
  readonly title: string;
  readonly keywords: readonly [string, string, string];
};

export const PERSONA_BY_GAN: Record<DayMaster, PersonaProfile> = {
  甲: { gan: "甲", element: "木", image: "大树", title: "苍松立岳", keywords: ["生长", "担当", "原则"] },
  乙: { gan: "乙", element: "木", image: "藤萝", title: "青藤知风", keywords: ["灵活", "细腻", "韧性"] },
  丙: { gan: "丙", element: "火", image: "太阳", title: "曜日明行", keywords: ["热情", "表达", "行动"] },
  丁: { gan: "丁", element: "火", image: "灯火", title: "灯火映心", keywords: ["专注", "体察", "温度"] },
  戊: { gan: "戊", element: "土", image: "山岳", title: "山岳守衡", keywords: ["稳重", "承载", "边界"] },
  己: { gan: "己", element: "土", image: "田园", title: "沃野藏秀", keywords: ["务实", "照料", "积累"] },
  庚: { gan: "庚", element: "金", image: "刀剑", title: "砺锋开路", keywords: ["决断", "执行", "直接"] },
  辛: { gan: "辛", element: "金", image: "珠玉", title: "珠玉含光", keywords: ["细致", "审美", "分寸"] },
  壬: { gan: "壬", element: "水", image: "江海", title: "江海行舟", keywords: ["开阔", "探索", "应变"] },
  癸: { gan: "癸", element: "水", image: "雨露", title: "清露知微", keywords: ["敏锐", "观察", "含蓄"] },
};

export function isDayMaster(value: string): value is DayMaster {
  return Object.prototype.hasOwnProperty.call(PERSONA_BY_GAN, value);
}

export function typeLabel(gan: DayMaster, gender: "male" | "female"): string {
  const profile = PERSONA_BY_GAN[gan];
  return `${gan}${profile.element}${gender === "male" ? "男" : "女"}`;
}

export function allTypeLabels(): readonly string[] {
  return DAY_MASTERS.flatMap((gan) => [typeLabel(gan, "male"), typeLabel(gan, "female")]);
}
