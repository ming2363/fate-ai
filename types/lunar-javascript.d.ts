declare module "lunar-javascript" {
  export const LunarUtil: {
    GAN: readonly string[];
    ZHI: readonly string[];
    SHI_SHEN: Readonly<Record<string, string>>;
    ZHI_HIDE_GAN: Readonly<Record<string, readonly string[]>>;
    WU_XING_GAN: Readonly<Record<string, string>>;
    WU_XING_ZHI: Readonly<Record<string, string>>;
    HE_GAN_5: readonly string[];
    HE_ZHI_6: readonly string[];
    CHONG: readonly string[];
  };
  export type LunarSolar = {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getHour(): number;
    getMinute(): number;
    getSecond(): number;
    toYmd(): string;
    toYmdHms(): string;
    getLunar(): LunarLike;
    getFestivals(): string[];
  };

  export type LunarLike = {
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getYearInChinese(): string;
    getSolar(): LunarSolar;
    getEightChar(): EightCharLike;
    getJieQiTable(): Record<string, LunarSolar>;
    getJieQiList(): string[];
    getJieQi(): string;
    getFestivals(): string[];
    getOtherFestivals(): string[];
  };

  export type EightCharLike = {
    getSect(): number;
    setSect(sect: number): void;
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getYearGan(): string;
    getMonthGan(): string;
    getDayGan(): string;
    getTimeGan(): string;
    getYearZhi(): string;
    getMonthZhi(): string;
    getDayZhi(): string;
    getTimeZhi(): string;
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getTimeShiShenGan(): string;
    getYun(gender: number, sect: number): YunLike;
  };

  export type YunLike = {
    isForward(): boolean;
    getStartSolar(): LunarSolar;
    getDaYun(count?: number): DaYunLike[];
  };

  export type DaYunLike = {
    getGanZhi(): string;
    getStartYear(): number;
    getEndYear(): number;
  };

  export type LunarMonthLike = {
    getDayCount(): number;
  } | null;

  export const Solar: {
    fromYmd(year: number, month: number, day: number): LunarSolar;
    fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): LunarSolar;
  };

  export const Lunar: {
    fromYmd(year: number, month: number, day: number): LunarLike;
    fromYmdHms(
      year: number,
      month: number,
      day: number,
      hour: number,
      minute: number,
      second: number,
    ): LunarLike;
  };

  export const LunarYear: {
    fromYear(year: number): {
      getLeapMonth(): number;
      getMonth(month: number): LunarMonthLike;
    };
  };
}
