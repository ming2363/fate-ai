import type { ChartFacts } from "@/lib/shared/chart-types";
import { birthMomentLabel, readableMoment, zodiacComparison } from "@/lib/shared/display";
import { GlossaryText } from "@/components/GlossaryText";
import { zodiacProfile } from "@/lib/shared/zodiac-reading";

export function ZodiacPanel({ chart, cultureNote }: { readonly chart: ChartFacts; readonly cultureNote?: string }) {
  const { zodiac } = chart;
  const comparison = zodiacComparison(chart);
  const profile = zodiac.status === "determined" && !zodiac.nearBoundary && zodiac.sign ? zodiacProfile(zodiac.sign.id) : null;
  const scenes = cultureNote?.replace(/\s*(?=(?:人际关系|日常生活)[：:])/g, "\n").split(/\n+/).map((item) => item.trim()).filter(Boolean) ?? [];
  return <section id="zodiac" className="reading zodiac-reading">
    <h2><span className="idx">星</span>太阳星座</h2>
    <div className="zodiac-result"><span>你的太阳星座</span><strong>{zodiac.sign?.name ?? "交界待确认"}</strong><span>{zodiac.nearBoundary ? "出生时刻靠近交界" : "按出生时间与地点核算"}</span></div>
    {profile ? <details><summary>星座性格侧写</summary><div className="zodiac-profile">
      <div><h3>性格底色</h3><p>{profile.nature}</p></div>
      <div><h3>做事与学习</h3><p>{profile.work}</p></div>
      <div><h3>相处方式</h3><p>{profile.relationships}</p></div>
      <div><h3>留意与成长</h3><p>{profile.growth}</p></div>
    </div></details> : null}
    {scenes.length ? <div className="zodiac-scenarios"><h3>近期可留意的事</h3><div>{scenes.map((scene, index) => {
      const separator = scene.search(/[：:]/);
      const label = separator > 0 && separator < 8 ? scene.slice(0, separator) : `观察 ${index + 1}`;
      const detail = separator > 0 && separator < 8 ? scene.slice(separator + 1).trim() : scene;
      return <article key={`${label}-${index}`}><h4>{label}</h4><p><GlossaryText text={detail} /></p></article>;
    })}</div></div> : null}
    <details><summary>如何确定这个星座</summary>
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
    </details>
  </section>;
}
