import cities from "@/data/cities.json";
import divisions from "@/data/china-provinces-cities.json";

export type CityRecord = {
  readonly id: string;
  readonly name: string;
  readonly timeZone: string;
};

export type ProvinceRecord = {
  readonly code: string;
  readonly name: string;
  readonly cities: readonly CityRecord[];
};

const TAIWAN_CITIES = [
  "台北市", "新北市", "桃园市", "台中市", "台南市", "高雄市", "基隆市", "新竹市", "嘉义市",
  "新竹县", "苗栗县", "彰化县", "南投县", "云林县", "嘉义县", "屏东县", "宜兰县", "花莲县", "台东县", "澎湖县", "金门县", "连江县",
];

export const PROVINCES: readonly ProvinceRecord[] = [
  ...divisions.map((province) => ({
    code: String(province.c),
    name: province.n,
    cities: province.ch.map((city) => ({
      id: `cn-${city.c}`,
      name: city.n,
      timeZone: province.c === 65 ? "Asia/Urumqi" : "Asia/Shanghai",
    })),
  })),
  { code: "81", name: "香港特别行政区", cities: cities.filter((city) => city.id.startsWith("hk-")) },
  { code: "82", name: "澳门特别行政区", cities: cities.filter((city) => city.id.startsWith("mo-")) },
  { code: "71", name: "台湾地区", cities: TAIWAN_CITIES.map((name) => ({ id: `tw-${name}`, name, timeZone: "Asia/Taipei" })) },
];

export const OTHER_CITIES: readonly CityRecord[] = cities.filter((city) => !/^(cn|hk|mo|tw)-/.test(city.id));
export const CITIES: readonly CityRecord[] = [...cities, ...PROVINCES.flatMap((province) => province.cities)];

export const MANUAL_TIME_ZONES: readonly string[] = [
  ...new Set(CITIES.map((city) => city.timeZone)),
  "UTC",
  "Pacific/Honolulu",
  "America/Sao_Paulo",
  "Africa/Cairo",
  "Asia/Kathmandu",
];

export function findCity(cityId: string): CityRecord | null {
  return CITIES.find((city) => city.id === cityId) ?? null;
}
