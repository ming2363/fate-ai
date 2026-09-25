import type { ChartFacts } from "@/lib/shared/chart-types";
import { GlossaryText } from "@/components/GlossaryText";

export function AnalysisBasis({ chart, prefix }: { readonly chart: ChartFacts; readonly prefix: string }) {
  const facts = chart.factCatalog.filter((item) => item.id.startsWith(`${prefix}.`) && (item.id.endsWith(".ten_gods") || item.id.includes(".relation.")));
  if (!facts.length) return null;
  return <details className="analysis-basis"><summary>查看十神与合冲依据 · {facts.length} 项</summary><ul>{facts.map((item) => <li key={item.id}><GlossaryText text={item.description} /></li>)}</ul></details>;
}
