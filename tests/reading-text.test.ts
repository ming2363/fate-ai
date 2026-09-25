import { expect, it } from "vitest";

import { cleanReadingText } from "@/lib/shared/reading-text";

it("去除重复免责声明，同时保留实际解读", () => {
  expect(cleanReadingText("日主为戊，适合先稳住节奏。只作文化语境下的倾向参考，不作具体事件断定。"))
    .toBe("日主为戊，适合先稳住节奏。");
  expect(cleanReadingText("正财偏向务实积累，十年里可以定期复盘预算。"))
    .toBe("正财偏向务实积累，十年里可以定期复盘预算。");
  expect(cleanReadingText("2026年可能出现进修安排，可留意课程或考证信息，而非结果必然兑现。"))
    .toBe("2026年可能出现进修安排，可留意课程或考证信息。");
});
