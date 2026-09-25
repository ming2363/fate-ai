import type { AnnualView, ChartFacts } from "@/lib/shared/chart-types";

export function readableMoment(label: string, withSeconds = false): string {
  if (label.includes(" 至 ")) return label.split(" 至 ").map((part) => readableMoment(part, withSeconds)).join(" 至 ");
  const matched = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/.exec(label);
  if (!matched) return label;
  const year = matched[1] ?? "";
  const month = Number(matched[2]);
  const day = Number(matched[3]);
  const hour = matched[4] ?? "";
  const minute = matched[5] ?? "";
  const zone = label.includes("北京时间") ? "北京时间" : "当地时间";
  return `${year}年${month}月${day}日 ${hour}:${minute}${withSeconds && matched[6] ? `:${matched[6]}` : ""} · ${zone}`;
}

export function birthMomentLabel(chart: ChartFacts): string {
  const precise = chart.timeBasis.inputPrecision === "second" || chart.timeBasis.inputPrecision === "minute";
  return chart.timeBasis.localLabels.map((label) => precise
    ? readableMoment(label.split(" 至 ")[0]!, chart.timeBasis.inputPrecision === "second")
    : `${readableMoment(label)}（不含结束时刻）`).join("；");
}

export function zodiacComparison(chart: ChartFacts): string | null {
  const boundary = chart.zodiac.ingresses[0];
  if (!boundary || !chart.zodiac.sign || chart.zodiac.nearBoundary) return null;
  const instant = Date.parse(boundary.startUtc);
  if (chart.birthUtcRanges.every((range) => Date.parse(range.endUtc) <= instant)) {
    return `你提供的出生时间范围全部在交接之前，因此按本系统的热带黄道规则属于${chart.zodiac.sign.name}。到这个交接时刻，才进入${boundary.signName}。`;
  }
  if (chart.birthUtcRanges.every((range) => Date.parse(range.startUtc) >= instant)) {
    return `你提供的出生时间范围全部在交接之后，因此按本系统的热带黄道规则属于${chart.zodiac.sign.name}。紧邻交接之前出生的人，仍属于${boundary.previousSignName}。`;
  }
  return null;
}

export function annualStatusMessage(status: AnnualView["personalStatus"]): string | null {
  switch (status) {
    case "before-birth": return "这一流年在出生之前，因此只展示历法信息，不写个人经历。";
    case "luck-unavailable": return "当前出生时间范围尚不能确定大运，本年度暂只展示历法信息。请查看左侧大运说明，补充更准确的时间后重新解读。";
    case "ambiguous": return "出生时间范围会影响本年度的大运阶段划分，暂不生成唯一的个人流年解读；缩小出生时间范围后可进一步确认。";
    default: return null;
  }
}
