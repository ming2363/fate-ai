export const TROPICAL_SIGNS = [
  { id: "aries", name: "白羊座", term: "春分", longitude: 0 },
  { id: "taurus", name: "金牛座", term: "谷雨", longitude: 30 },
  { id: "gemini", name: "双子座", term: "小满", longitude: 60 },
  { id: "cancer", name: "巨蟹座", term: "夏至", longitude: 90 },
  { id: "leo", name: "狮子座", term: "大暑", longitude: 120 },
  { id: "virgo", name: "处女座", term: "处暑", longitude: 150 },
  { id: "libra", name: "天秤座", term: "秋分", longitude: 180 },
  { id: "scorpio", name: "天蝎座", term: "霜降", longitude: 210 },
  { id: "sagittarius", name: "射手座", term: "小雪", longitude: 240 },
  { id: "capricorn", name: "摩羯座", term: "冬至", longitude: 270 },
  { id: "aquarius", name: "水瓶座", term: "大寒", longitude: 300 },
  { id: "pisces", name: "双鱼座", term: "雨水", longitude: 330 },
] as const;

export type SignId = (typeof TROPICAL_SIGNS)[number]["id"];

export const ZHONG_QI = TROPICAL_SIGNS.map((item) => item.term);

export const JIE_TERMS = [
  "立春",
  "惊蛰",
  "清明",
  "立夏",
  "芒种",
  "小暑",
  "立秋",
  "白露",
  "寒露",
  "立冬",
  "大雪",
  "小寒",
] as const;

export function signByTerm(term: string): (typeof TROPICAL_SIGNS)[number] | null {
  return TROPICAL_SIGNS.find((item) => item.term === term) ?? null;
}

export function signById(id: string): (typeof TROPICAL_SIGNS)[number] | null {
  return TROPICAL_SIGNS.find((item) => item.id === id) ?? null;
}

export function allSignNames(): readonly string[] {
  return TROPICAL_SIGNS.map((item) => item.name);
}
