import type { ChartFacts, Reading, ReadingTaskId } from "@/lib/shared/chart-types";
import { SITE_NAME } from "@/lib/shared/versions";
import { annualStatusMessage, zodiacComparison } from "@/lib/shared/display";
import { cleanReadingText } from "@/lib/shared/reading-text";

function paragraph(title: string, text: string | null | undefined): string {
  return text ? `${title}\n${cleanReadingText(text)}` : "";
}

export function copyReport(chart: ChartFacts, reading: Reading | null, annualYear: number, missingTasks: readonly ReadingTaskId[] = []): string {
  const annual = reading?.annualReadings.find((item) => item.year === annualYear) ?? null;
  const lines = [
    chart.persona.typeLabel && chart.persona.title ? `${chart.persona.typeLabel} · ${chart.persona.title}` : "日主待确认",
    chart.persona.keywords.length > 0 ? chart.persona.keywords.join("、") : "",
    chart.zodiac.sign && !chart.zodiac.nearBoundary ? chart.zodiac.sign.name : "星座待确认",
    zodiacComparison(chart) ?? "",
    chart.zodiac.notice ?? "",
    paragraph("总览", reading?.overview.text),
    paragraph("人格", reading?.personality.summary?.text),
    reading?.personality.strengths.map((item) => cleanReadingText(item.text)).join("\n") ?? "",
    paragraph("相处", reading?.personality.relationshipAdvice?.text),
    reading?.mbtiProfile ? `你填写的 MBTI · ${reading.mbtiProfile.type}\n${reading.mbtiProfile.overview}\n${reading.mbtiProfile.strengths}\n${reading.mbtiProfile.blindSpots}\n${reading.mbtiProfile.communication}\n${reading.mbtiProfile.growth}` : "",
    reading?.mbtiNote ? `结合中式人格\n${reading.mbtiNote.commonGround}\n${reading.mbtiNote.difference}\n${reading.mbtiNote.practice}` : "",
    paragraph("当前阶段", reading?.currentLuck.summary?.text),
    paragraph("机会与可用方向", reading?.currentLuck.opportunity?.text),
    paragraph("需要留意与如何应对", reading?.currentLuck.attention?.text),
    paragraph(`${annualYear} 流年`, annual?.summary?.text),
    paragraph("这一年可能遇到的事", annual?.outlooks.map((item) => item.text).join("\n")),
    annual?.segments.map((item) => cleanReadingText(item.summary.text)).join("\n") ?? "",
    annualStatusMessage(chart.annuals.items.find((item) => item.year === annualYear)?.personalStatus ?? "luck-unavailable") ?? "",
    cleanReadingText(annual?.career?.text ?? ""),
    cleanReadingText(annual?.relationships?.text ?? ""),
    cleanReadingText(annual?.finance?.text ?? ""),
    annual?.actions.map((item) => cleanReadingText(item.text)).join("\n") ?? "",
    cleanReadingText(reading?.zodiacNote?.text ?? ""),
    ...missingTasks.map((taskId) => taskId === "identity" ? "人格与星座解读未完成" : "大运与流年解读未完成"),
    SITE_NAME,
  ];
  return lines.filter((line) => line.length > 0).join("\n\n");
}
