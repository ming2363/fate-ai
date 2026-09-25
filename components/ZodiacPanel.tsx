import type { ChartFacts } from "@/lib/shared/chart-types";
import { birthMomentLabel, readableMoment, zodiacComparison } from "@/lib/shared/display";
import { GlossaryText } from "@/components/GlossaryText";
import { zodiacProfile } from "@/lib/shared/zodiac-reading";

export function ZodiacPanel({ chart, cultureNote }: { readonly chart: ChartFacts; readonly cultureNote?: string }) {
  const { zodiac } = chart;
  const comparison = zodiacComparison(chart);
  const profile = zodiac.status === "determined" && !zodiac.nearBoundary && zodiac.sign ? zodiacProfile(zodiac.sign.id) : null;
  return <section className="reading zodiac-reading">
    <h2><span className="idx">星</span>太阳星座</h2>
    <div className="zodiac-result"><span>你的太阳星座</span><strong>{zodiac.sign?.name ?? "交界待确认"}</strong><span>{zodiac.nearBoundary ? "出生时刻靠近交界" : "按出生时间与地点核算"}</span></div>
    {profile ? <div className="zodiac-profile">
      <div><h3>性格底色</h3><p>{profile.nature}</p></div>
      <div><h3>做事与学习</h3><p>{profile.work}</p></div>
      <div><h3>相处方式</h3><p>{profile.relationships}</p></div>
      <div><h3>留意与成长</h3><p>{profile.growth}</p></div>
    </div> : null}
    {cultureNote ? <p className="zodiac-culture"><strong>星座补充　</strong><GlossaryText text={cultureNote} /></p> : null}
    <p className="zodiac-method-title">如何确定这个星座</p>
    <p>星座在具体时刻交接，同一天出生的人也可能属于不同星座。</p>
    <dl className="zodiac-evidence">
      <div><dt>本次采用的出生时间</dt><dd>{birthMomentLabel(chart)}</dd><dd className="fine">公历 {chart.timeBasis.solarDateLabel} · 时区 {chart.timeBasis.birthTimeZone}</dd></div>
      {zodiac.ingresses.map((event) => <div key={event.startUtc}>
        <dt>当年的交接时刻（系统推算）</dt>
        <dd>{event.previousSignName} → {event.signName}</dd>
        <dd>{readableMoment(event.birthZoneLabel, true)}</dd>
        <dd className="fine">与出生时间使用同一时区 · {event.term}</dd>
      </div>)}
    </dl>
    {comparison ? <p className="zodiac-conclusion">{comparison}</p> : null}
    {zodiac.notice ? <p className="hint">{zodiac.notice}</p> : null}
  </section>;
}
