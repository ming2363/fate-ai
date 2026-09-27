import { isIP } from "node:net";
import path from "node:path";
import { IPv4, IPv6, newWithFileOnly, type Searcher } from "ip2region.js";

export type Region = { country: string; province: string; city: string };

export function parseRegion(value: string): Region {
  // Current xdb format: country|province|city|ISP|country code.
  const [country, province, city] = value.split("|").map((part) => part === "0" ? "" : part);
  return { country: country || "未知地区", province: province || "", city: city || "" };
}

export function openRegionLookup() {
  const readers = new Map<number, Searcher>();
  return {
    async lookup(value: string | null): Promise<Region> {
      const ip = value?.replace(/^::ffff:/i, "") ?? "";
      const version = isIP(ip);
      if (!version) return parseRegion("");
      let reader = readers.get(version);
      if (!reader) {
        const dir = process.env.IP_REGION_DATA_DIR || path.join(process.cwd(), "data/ip-region");
        reader = newWithFileOnly(version === 4 ? IPv4 : IPv6, path.join(dir, `ip2region_v${version}.xdb`));
        readers.set(version, reader);
      }
      return parseRegion(await reader.search(ip));
    },
    close() { for (const reader of readers.values()) reader.close(); },
  };
}
