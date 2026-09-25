import { expect, it } from "vitest";
import { daysInBirthMonth } from "@/components/BirthDatePicker";

it("日期下拉按当前历法限制日数，闰月与大小月不混用", () => {
  expect(daysInBirthMonth("solar", "2024", "2", false)).toBe(29);
  expect(daysInBirthMonth("solar", "2023", "2", false)).toBe(28);
  expect(daysInBirthMonth("lunar", "2020", "4", false)).toBe(30);
  expect(daysInBirthMonth("lunar", "2020", "4", true)).toBe(29);
  expect(daysInBirthMonth("lunar", "2023", "4", true)).toBe(0);
  expect(daysInBirthMonth("lunar", "1999", "11", false)).toBe(30);
});
