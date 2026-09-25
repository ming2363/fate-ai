import { Solar } from "lunar-javascript";
import { describe, expect, it } from "vitest";

import { festivalThemeForDate, todayFestivalTheme } from "@/lib/server/festival";

describe("节日与节气装饰", () => {
  it("按中国日期识别中秋、农历小节日和公历公共节日", () => {
    expect(festivalThemeForDate(2026, 9, 25)).toMatchObject({ name: "中秋节", motifs: ["moon", "mooncake", "rabbit", "change"] });
    expect(festivalThemeForDate(2026, 2, 23)?.name).toBe("人日");
    expect(festivalThemeForDate(2026, 10, 1)?.name).toBe("国庆节");
    expect(festivalThemeForDate(2026, 9, 26)).toBeNull();
    expect(todayFestivalTheme(new Date("2026-09-24T16:00:00Z"))?.name).toBe("中秋节");
    expect(todayFestivalTheme(new Date("2026-09-24T15:59:59Z"))?.name).not.toBe("中秋节");
  });

  it("全年二十四节气当天均有装饰", () => {
    const terms = new Set<string>();
    for (let month = 1; month <= 12; month += 1) {
      const days = new Date(2026, month, 0).getDate();
      for (let day = 1; day <= days; day += 1) {
        const term = Solar.fromYmd(2026, month, day).getLunar().getJieQi();
        if (!term) continue;
        terms.add(term);
        expect(festivalThemeForDate(2026, month, day), `${month}/${day} ${term}`).not.toBeNull();
      }
    }
    expect(terms.size).toBe(24);
    expect(festivalThemeForDate(2026, 4, 5)?.name).toBe("清明节");
  });
});
