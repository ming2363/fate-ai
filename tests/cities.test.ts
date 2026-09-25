import { describe, expect, it } from "vitest";

import { findCity, PROVINCES } from "@/lib/shared/cities";

describe("省市出生地", () => {
  it("联动城市可被排盘时区校验识别", () => {
    const hebei = PROVINCES.find((province) => province.code === "13");
    const xinjiang = PROVINCES.find((province) => province.code === "65");
    expect(hebei?.cities.find((city) => city.name === "石家庄市")?.timeZone).toBe("Asia/Shanghai");
    expect(xinjiang?.cities.find((city) => city.name === "乌鲁木齐市")?.timeZone).toBe("Asia/Urumqi");
    for (const province of PROVINCES) {
      for (const city of province.cities) expect(findCity(city.id)).toEqual(city);
    }
  });
});
