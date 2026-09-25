export const SHICHEN = [
  { id: "early_zi", label: "早子时 00:00–00:59", start: "00:00", end: "01:00" },
  { id: "chou", label: "丑时 01:00–02:59", start: "01:00", end: "03:00" },
  { id: "yin", label: "寅时 03:00–04:59", start: "03:00", end: "05:00" },
  { id: "mao", label: "卯时 05:00–06:59", start: "05:00", end: "07:00" },
  { id: "chen", label: "辰时 07:00–08:59", start: "07:00", end: "09:00" },
  { id: "si", label: "巳时 09:00–10:59", start: "09:00", end: "11:00" },
  { id: "wu", label: "午时 11:00–12:59", start: "11:00", end: "13:00" },
  { id: "wei", label: "未时 13:00–14:59", start: "13:00", end: "15:00" },
  { id: "shen", label: "申时 15:00–16:59", start: "15:00", end: "17:00" },
  { id: "you", label: "酉时 17:00–18:59", start: "17:00", end: "19:00" },
  { id: "xu", label: "戌时 19:00–20:59", start: "19:00", end: "21:00" },
  { id: "hai", label: "亥时 21:00–22:59", start: "21:00", end: "23:00" },
  { id: "late_zi", label: "晚子时 23:00–23:59", start: "23:00", end: "24:00" },
] as const;

export type ShichenId = (typeof SHICHEN)[number]["id"];

export function findShichen(id: string): (typeof SHICHEN)[number] | null {
  return SHICHEN.find((item) => item.id === id) ?? null;
}
