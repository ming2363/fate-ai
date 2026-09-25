import { Solar } from "lunar-javascript";

import type { FestivalMotif, FestivalTheme } from "@/lib/shared/festival";

const PUBLIC_FESTIVALS = new Set(["元旦节", "妇女节", "植树节", "劳动节", "青年节", "儿童节", "建党节", "建军节", "教师节", "国庆节"]);

const FESTIVAL_MOTIFS: Record<string, readonly FestivalMotif[]> = {
  中秋节: ["moon", "mooncake", "rabbit", "change"],
  春节: ["lantern", "flower", "sun"],
  除夕: ["lantern", "flower", "moon"],
  元宵节: ["lantern", "moon", "flower"],
  端午节: ["boat", "zongzi", "leaf"],
  七夕节: ["moon", "flower", "change"],
  重阳节: ["flower", "leaf", "sun"],
  腊八节: ["grain", "snow", "lantern"],
  龙头节: ["leaf", "sun", "flower"],
  清明节: ["flower", "leaf", "moon"],
  国庆节: ["flag", "flower", "sun"],
  元旦节: ["sun", "lantern", "flower"],
  劳动节: ["grain", "sun", "flower"],
  妇女节: ["flower", "moon", "leaf"],
  植树节: ["leaf", "sun", "flower"],
  青年节: ["sun", "book", "flower"],
  儿童节: ["flower", "sun", "lantern"],
  建党节: ["flag", "sun", "flower"],
  建军节: ["flag", "sun", "flower"],
  教师节: ["book", "flower", "sun"],
};

const SPRING = new Set(["立春", "雨水", "惊蛰", "春分", "清明", "谷雨"]);
const SUMMER = new Set(["立夏", "小满", "芒种", "夏至", "小暑", "大暑"]);
const AUTUMN = new Set(["立秋", "处暑", "白露", "秋分", "寒露", "霜降"]);
const WINTER = new Set(["立冬", "小雪", "大雪", "冬至", "小寒", "大寒"]);

function motifsFor(name: string): readonly FestivalMotif[] {
  if (FESTIVAL_MOTIFS[name]) return FESTIVAL_MOTIFS[name];
  if (SPRING.has(name)) return ["flower", "leaf", "sun"];
  if (SUMMER.has(name)) return ["sun", "leaf", "grain"];
  if (AUTUMN.has(name)) return ["leaf", "grain", "moon"];
  if (WINTER.has(name)) return ["snow", "moon", "lantern"];
  if (/灯|神|祭|社|岁|年|节/.test(name)) return ["lantern", "flower", "moon"];
  return ["flower", "leaf", "moon"];
}

export function festivalThemeForDate(year: number, month: number, day: number): FestivalTheme | null {
  const solar = Solar.fromYmd(year, month, day);
  const lunar = solar.getLunar();
  const lunarFestival = lunar.getFestivals()[0] ?? lunar.getOtherFestivals()[0];
  const publicFestival = solar.getFestivals().find((name) => PUBLIC_FESTIVALS.has(name));
  const term = lunar.getJieQi();
  const name = lunarFestival ?? publicFestival ?? (term === "清明" ? "清明节" : term);
  if (!name) return null;
  const caption = lunarFestival
    ? `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`
    : publicFestival ? "今日节日" : "二十四节气";
  return { name, caption, motifs: motifsFor(name) };
}

export function todayFestivalTheme(now = new Date()): FestivalTheme | null {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const value = (type: "year" | "month" | "day") => Number(parts.find((part) => part.type === type)?.value);
  return festivalThemeForDate(value("year"), value("month"), value("day"));
}
