import { Temporal } from "@js-temporal/polyfill";

import type { ChartFacts, LuckPeriodView, ModuleStatus, PillarSlot } from "@/lib/shared/chart-types";
import { isDayMaster, PERSONA_BY_GAN, typeLabel } from "@/lib/shared/persona";
import type { BirthInput } from "@/lib/shared/schemas";
import {
  BOUNDARY_GUARD_SECONDS,
  CHART_SCHEMA_VERSION,
  ENGINE_VERSION,
  LUNAR_GENDER,
  RULES_VERSION,
} from "@/lib/shared/versions";

import { chartFingerprint } from "@/lib/server/fingerprint";
import { analysisFacts } from "@/lib/server/analysis-facts";
import { luckAt, periodById, type LuckPeriod, type LuckSnapshot } from "@/lib/server/luck";
import { chartAt, samplePillars, type PillarSample } from "@/lib/server/pillars";
import { ingressEvents, jieEvents } from "@/lib/server/terms";
import { formatBeijing, formatZoned, resolveBirth, type UtcInterval } from "@/lib/server/time";

type SignRef = { readonly id: string; readonly name: string };

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function pillarSlot(values: readonly string[]): PillarSlot {
  const candidates = unique(values);
  const only = candidates.length === 1 ? candidates[0] ?? null : null;
  const status: ModuleStatus = candidates.length === 0 ? "unavailable" : candidates.length === 1 ? "determined" : "ambiguous";
  return {
    status,
    value: only,
    candidates,
    gan: only ? only.slice(0, 1) : null,
    zhi: only ? only.slice(1) : null,
  };
}

function timeExtent(instants: readonly Temporal.Instant[]): { utc: string | null; label: string } {
  const values = [...instants].sort(Temporal.Instant.compare);
  const first = values[0]!;
  const last = values[values.length - 1]!;
  const exact = Temporal.Instant.compare(first, last) === 0;
  const firstLabel = formatBeijing(first);
  const lastLabel = formatBeijing(last);
  return { utc: exact ? first.toString() : null, label: firstLabel.slice(0, 16) === lastLabel.slice(0, 16) ? firstLabel : `${firstLabel} 至 ${lastLabel}` };
}

function periodView(period: LuckPeriod, snapshots: readonly LuckSnapshot[] = []): LuckPeriodView {
  const variants = snapshots.flatMap((snapshot) => {
    const item = periodById(snapshot, period.id);
    return item ? [item] : [];
  });
  const start = timeExtent((variants.length ? variants : [period]).map((item) => item.start));
  const end = timeExtent((variants.length ? variants : [period]).map((item) => item.end));
  return {
    id: period.id,
    formal: period.formal,
    pillar: period.pillar,
    startUtc: start.utc,
    endUtc: end.utc,
    startLabel: start.label,
    endLabel: end.label,
  };
}

function neighbor(snapshot: LuckSnapshot, id: string | null, step: -1 | 1): LuckPeriod | null {
  const index = snapshot.periods.findIndex((period) => period.id === id);
  if (index < 0) return null;
  return snapshot.periods[index + step] ?? null;
}

function lichunEvents(fromYear: number, toYear: number): readonly { readonly year: number; readonly instant: Temporal.Instant }[] {
  return jieEvents(fromYear, toYear)
    .filter((event) => event.name === "立春")
    .map((event) => ({ year: event.instant.toZonedDateTimeISO("+08:00").year, instant: event.instant }));
}

function currentLiunianYear(asOf: Temporal.Instant, lichuns: readonly { year: number; instant: Temporal.Instant }[]): number {
  let year = lichuns[0]?.year ?? asOf.toZonedDateTimeISO("+08:00").year;
  for (const item of lichuns) {
    if (Temporal.Instant.compare(asOf, item.instant) >= 0) year = item.year;
  }
  return year;
}

export function buildChart(input: BirthInput, asOf: Temporal.Instant): ChartFacts {
  const birth = resolveBirth(input, asOf);
  const samples = samplePillars(birth.ranges);
  const year = pillarSlot(samples.map((item) => item.year));
  const month = pillarSlot(samples.map((item) => item.month));
  const day = pillarSlot(samples.map((item) => item.day));
  const time = pillarSlot(samples.map((item) => item.time));
  const dayMasters = unique(samples.map((item) => item.dayGan)).filter(isDayMaster);
  const gender = input.genderForCalculation;
  const personaCandidates = dayMasters.map((gan) => {
    const profile = PERSONA_BY_GAN[gan];
    return { dayMaster: gan, typeLabel: typeLabel(gan, gender), title: profile.title, keywords: profile.keywords };
  });
  const personaStatus: ModuleStatus = personaCandidates.length === 1 ? "determined" : personaCandidates.length > 1 ? "ambiguous" : "unavailable";
  const onlyPersona = personaStatus === "determined" ? personaCandidates[0] ?? null : null;

  const years = birth.ranges.flatMap((range) => [range.start, range.end].map((instant) => instant.toZonedDateTimeISO("+08:00").year));
  const minYear = Math.min(...years, asOf.toZonedDateTimeISO("+08:00").year) - 1;
  const maxYear = Math.max(...years, asOf.toZonedDateTimeISO("+08:00").year) + 2;
  const ingresses = ingressEvents(minYear, maxYear);
  const signMap = new Map<string, SignRef>();
  for (const range of birth.ranges) {
    for (let index = 0; index < ingresses.length - 1; index += 1) {
      const current = ingresses[index];
      const next = ingresses[index + 1];
      if (!current || !next) continue;
      const overlaps = Temporal.Instant.compare(range.start, next.instant) < 0 && Temporal.Instant.compare(range.end, current.instant) > 0;
      if (overlaps) signMap.set(current.signId, { id: current.signId, name: current.signName });
    }
  }
  const signCandidates = [...signMap.values()];
  const nearBoundary = birth.ranges.some((range) => ingresses.some((event) => {
    const guardStart = event.instant.subtract({ seconds: BOUNDARY_GUARD_SECONDS });
    const guardEnd = event.instant.add({ seconds: BOUNDARY_GUARD_SECONDS });
    return Temporal.Instant.compare(range.start, guardEnd) < 0 && Temporal.Instant.compare(range.end, guardStart) > 0;
  }));
  const zodiacStatus: ModuleStatus = signCandidates.length === 1 ? "determined" : signCandidates.length > 1 ? "ambiguous" : "unavailable";
  const zodiacSign = zodiacStatus === "determined" ? signCandidates[0] ?? null : null;
  const relevantIngresses = ingresses.filter((event) => birth.ranges.some((range) => {
      const windowStart = range.start.subtract({ hours: 48 });
      const windowEnd = range.end.add({ hours: 48 });
      return Temporal.Instant.compare(event.instant, windowStart) >= 0 && Temporal.Instant.compare(event.instant, windowEnd) <= 0;
    }));

  const knownTime = birth.precision !== "unknown";
  const pillarsStable = year.status === "determined" && month.status === "determined" && day.status === "determined" && time.status === "determined";
  const lunarGender = LUNAR_GENDER[gender];
  // getYun(…, 2) changes its offset at minute boundaries; sample both ends of each minute.
  const endpoints = knownTime && pillarsStable ? birth.ranges.flatMap((range) => {
    const points: Temporal.Instant[] = [];
    let cursor = range.start;
    while (Temporal.Instant.compare(cursor, range.end) < 0) {
      const nextMinute = cursor.add({ milliseconds: 60_000 - (cursor.epochMilliseconds % 60_000 + 60_000) % 60_000 });
      const end = Temporal.Instant.compare(nextMinute, range.end) < 0 ? nextMinute : range.end;
      points.push(cursor, end.subtract({ milliseconds: 1 }));
      cursor = end;
    }
    return points;
  }) : [];
  const snapshots = endpoints.map((instant) => luckAt(instant, lunarGender, asOf));
  const currentIds = unique(snapshots.map((item) => item.currentId ?? ""));
  let luckStatus: ModuleStatus = "unavailable";
  let representative: LuckSnapshot | null = null;
  if (!knownTime || !pillarsStable) {
    luckStatus = "unavailable";
  } else if (snapshots.length > 0 && currentIds.length === 1 && currentIds[0]) {
    luckStatus = "determined";
    representative = snapshots[0] ?? null;
  } else if (snapshots.length > 0) {
    luckStatus = "ambiguous";
    representative = snapshots[0] ?? null;
  }
  const startInstants = unique(snapshots.map((item) => item.start.toString())).sort();
  const currentPeriod = representative ? periodById(representative, representative.currentId) : null;
  const luckNotice = !knownTime
    ? "本次选择了“时间不清楚”，系统按全天范围计算。补充钟点或时辰后，可进一步确认当前大运。"
    : !pillarsStable
      ? "所选出生时间范围跨过了四柱边界，当前不能给出唯一大运；请缩小时间范围。"
    : luckStatus === "ambiguous"
      ? "出生时间范围会使当前是否交运产生分歧，这里只列出候选，不给唯一阶段。"
      : luckStatus === "unavailable"
        ? "当前时点不在可计算的大运范围内。"
      : null;

  const lichuns = lichunEvents(minYear - 1, maxYear + 1);
  const currentYear = currentLiunianYear(asOf, lichuns);
  const birthStart = birth.ranges.reduce((earliest, range) => Temporal.Instant.compare(range.start, earliest) < 0 ? range.start : earliest, birth.ranges[0]?.start ?? asOf);
  const birthEnd = birth.ranges.reduce((latest, range) => Temporal.Instant.compare(range.end, latest) > 0 ? range.end : latest, birth.ranges[0]?.end ?? asOf);
  const annualItems = ([-1, 0, 1] as const).map((offset) => {
    const yearNumber = currentYear + offset;
    const start = lichuns.find((item) => item.year === yearNumber)?.instant;
    const end = lichuns.find((item) => item.year === yearNumber + 1)?.instant;
    if (!start || !end) {
      throw new Error(`缺少 ${yearNumber} 年立春事件`);
    }
    const pillar = chartAt(start.add({ seconds: 1 })).sample.year;
    const role: "previous" | "current" | "next" = offset === -1 ? "previous" : offset === 0 ? "current" : "next";
    if (luckStatus !== "determined" || !representative) {
      return {
        role, year: yearNumber, pillar, startUtc: start.toString(), endUtc: end.toString(),
        startLabel: formatBeijing(start), endLabel: formatBeijing(end),
        personalStatus: luckStatus === "ambiguous" ? "ambiguous" as const : "luck-unavailable" as const,
        segments: [],
      };
    }
    if (Temporal.Instant.compare(birthStart, end) >= 0) {
      return {
        role, year: yearNumber, pillar, startUtc: start.toString(), endUtc: end.toString(),
        startLabel: formatBeijing(start), endLabel: formatBeijing(end),
        personalStatus: "before-birth" as const, segments: [],
      };
    }
    const personalStart = Temporal.Instant.compare(birthEnd, start) > 0 ? birthEnd : start;
    if (Temporal.Instant.compare(personalStart, end) >= 0) {
      return {
        role, year: yearNumber, pillar, startUtc: start.toString(), endUtc: end.toString(),
        startLabel: formatBeijing(start), endLabel: formatBeijing(end),
        personalStatus: "ambiguous" as const, segments: [],
      };
    }
    const segmentsFor = (snapshot: LuckSnapshot) => snapshot.periods.flatMap((period) => {
      const segStart = Temporal.Instant.compare(period.start, personalStart) > 0 ? period.start : personalStart;
      const segEnd = Temporal.Instant.compare(period.end, end) < 0 ? period.end : end;
      if (Temporal.Instant.compare(segStart, segEnd) >= 0) return [];
      return [{ periodId: period.id, pillar: period.pillar, startUtc: segStart.toString(), endUtc: segEnd.toString() }];
    });
    const variants = snapshots.map(segmentsFor);
    const segments = segmentsFor(representative);
    const stagesStable = variants.every((items) => items.map((item) => item.periodId).join(",") === segments.map((item) => item.periodId).join(","));
    return {
      role, year: yearNumber, pillar, startUtc: start.toString(), endUtc: end.toString(),
      startLabel: formatBeijing(start), endLabel: formatBeijing(end),
      personalStatus: segments.length > 0 && stagesStable ? "applicable" as const : "ambiguous" as const,
      segments: stagesStable ? segments.map((segment, index) => ({
        ...segment,
        startUtc: variants.every((items) => items[index]?.startUtc === segment.startUtc) ? segment.startUtc : null,
        endUtc: variants.every((items) => items[index]?.endUtc === segment.endUtc) ? segment.endUtc : null,
      })) : [],
    };
  });

  const limitations: string[] = [];
  if (birth.precision === "unknown") limitations.push("出生时间不详，只保留全天范围内稳定的事实。");
  if (birth.precision === "shichen") limitations.push("出生时间为时辰范围；仅解读范围内一致的大运与年度阶段，起运及交运日期不作单一时刻断言。");
  if (birth.clipped) limitations.push("尚未发生的时刻已从可计算范围中排除。");
  if (day.status !== "determined") limitations.push("日柱在当前时间范围内不唯一，日主待确认。");
  if (time.status !== "determined") limitations.push("时柱在当前时间范围内不唯一。");
  if (zodiacStatus === "ambiguous") limitations.push("出生时间范围跨过太阳星座交接，不能确定唯一星座。");
  if (nearBoundary) limitations.push("出生时刻靠近星座交界缓冲，不把交界结果写成确定文化判词。");
  if (luckStatus !== "determined") limitations.push("当前大运没有唯一结论。");
  if (representative && currentPeriod && !currentPeriod.formal) limitations.push("目前仍在起运前，还没有进入正式第一步大运。");

  const zodiacNotice = zodiacStatus === "ambiguous"
    ? `你的出生时间范围跨过星座交接，可能是${signCandidates.map((item) => item.name).join("或")}。补充更准确的时间后，可以进一步确认。`
    : nearBoundary && zodiacSign
      ? `算法上属于${zodiacSign.name}，但距离交界不足 ${BOUNDARY_GUARD_SECONDS} 秒的缓冲，不能把这一结果当成精确到秒的天文结论。`
      : zodiacStatus === "unavailable"
        ? "现有节气事件没有覆盖这个出生范围，星座暂不可用。"
        : relevantIngresses.length && zodiacSign
          ? `你出生在星座交接附近，按当年的交接时刻计算为${zodiacSign.name}。常见月日表是简化划分，同一天在交接前后可能属于不同星座。`
          : null;

  const facts = buildFacts({
    samples, year, month, day, time, onlyPersona, personaStatus, zodiacSign, zodiacStatus, nearBoundary,
    signCandidates, luckStatus, representative, currentPeriod, annualItems, limitations,
  });
  const allowedAnnual = annualItems.filter((item) => item.personalStatus === "applicable").map((item) => item.year);
  const asOfUtc = asOf.toString();
  return {
    schemaVersion: CHART_SCHEMA_VERSION,
    rulesVersion: RULES_VERSION,
    engineVersion: ENGINE_VERSION,
    asOfUtc,
    chartFingerprint: chartFingerprint(input, asOfUtc),
    birthUtcRanges: birth.ranges.map((range) => ({ startUtc: range.start.toString(), endUtc: range.end.toString() })),
    timeBasis: {
      inputPrecision: birth.precision,
      birthTimeZone: birth.timeZone,
      chartClock: "UTC+08:00",
      trueSolarTime: false,
      dayPillarSect: 2,
      yunSect: 2,
      localLabels: birth.ranges.map((range) => `${formatZoned(range.start, birth.timeZone)} 至 ${formatZoned(range.end, birth.timeZone)}`),
      beijingLabels: birth.ranges.map((range) => `${formatBeijing(range.start)} 至 ${formatBeijing(range.end)}`),
      clippedToAsOf: birth.clipped,
      lunarLabel: birth.lunarLabel,
      solarDateLabel: `${birth.solarYear}-${String(birth.solarMonth).padStart(2, "0")}-${String(birth.solarDay).padStart(2, "0")}`,
      notes: [
        "排盘先把出生地当地时间按当年 IANA 时区还原为 UTC，再换算成固定 UTC+08:00。",
        "日柱使用 EightChar sect=2：晚子时仍属当天。起运单独使用 getYun(gender, 2)，两个数字不是同一项设置。",
        "太阳星座使用出生瞬间的 UTC，不使用八字换日或真太阳时。",
      ],
    },
    bazi: {
      year, month, day, time,
      dayMaster: {
        status: personaStatus,
        value: onlyPersona?.dayMaster ?? null,
        candidates: dayMasters,
        source: "日柱天干",
      },
    },
    persona: {
      status: personaStatus,
      typeLabel: onlyPersona?.typeLabel ?? null,
      title: onlyPersona?.title ?? null,
      keywords: onlyPersona?.keywords ?? [],
      element: onlyPersona && isDayMaster(onlyPersona.dayMaster) ? PERSONA_BY_GAN[onlyPersona.dayMaster].element : null,
      image: onlyPersona && isDayMaster(onlyPersona.dayMaster) ? PERSONA_BY_GAN[onlyPersona.dayMaster].image : null,
      candidates: personaCandidates,
    },
    zodiac: {
      system: "tropical-geocentric",
      status: zodiacStatus,
      nearBoundary,
      sign: zodiacSign,
      candidates: signCandidates,
      boundaryGuardSeconds: 120,
      ingresses: relevantIngresses.slice(0, 4).map((event) => ({
        term: event.name,
        previousSignName: ingresses[ingresses.indexOf(event) - 1]?.signName ?? "上一星座",
        signName: event.signName,
        startUtc: event.instant.toString(),
        birthZoneLabel: formatZoned(event.instant, birth.timeZone),
        beijingLabel: formatBeijing(event.instant),
      })),
      source: `${ENGINE_VERSION} 中气时刻，按固定 UTC+08:00 转为 UTC`,
      notice: zodiacNotice,
    },
    luck: {
      status: luckStatus,
      started: currentPeriod ? currentPeriod.formal : null,
      direction: representative ? (representative.forward ? "forward" : "backward") : null,
      startUtc: startInstants.length === 1 ? startInstants[0] ?? null : null,
      startLabel: representative ? timeExtent(snapshots.map((item) => item.start)).label : null,
      current: currentPeriod && luckStatus === "determined" ? periodView(currentPeriod, snapshots) : null,
      previous: representative && luckStatus === "determined" ? optionalView(neighbor(representative, representative.currentId, -1), snapshots) : null,
      next: representative && luckStatus === "determined" ? optionalView(neighbor(representative, representative.currentId, 1), snapshots) : null,
      candidates: luckStatus === "ambiguous" && representative ? currentIds.flatMap((id) => {
        const period = periodById(representative, id);
        return period ? [periodView(period, snapshots)] : [];
      }) : [],
      notice: luckNotice,
    },
    annuals: { currentYear, items: annualItems },
    factCatalog: facts.catalog,
    allowedTopics: {
      personality: personaStatus === "determined",
      currentLuck: luckStatus === "determined",
      zodiac: zodiacStatus === "determined" && !nearBoundary,
      annualYears: allowedAnnual,
    },
    limitations,
    reportYears: annualItems.map((item) => item.year),
  };
}

function optionalView(period: LuckPeriod | null, snapshots: readonly LuckSnapshot[]): LuckPeriodView | null {
  return period ? periodView(period, snapshots) : null;
}

function buildFacts(input: {
  samples: readonly PillarSample[];
  year: PillarSlot;
  month: PillarSlot;
  day: PillarSlot;
  time: PillarSlot;
  onlyPersona: { dayMaster: string; typeLabel: string; title: string; keywords: readonly string[] } | null;
  personaStatus: ModuleStatus;
  zodiacSign: SignRef | null;
  zodiacStatus: ModuleStatus;
  nearBoundary: boolean;
  signCandidates: readonly SignRef[];
  luckStatus: ModuleStatus;
  representative: LuckSnapshot | null;
  currentPeriod: LuckPeriod | null;
  annualItems: ChartFacts["annuals"]["items"];
  limitations: readonly string[];
}): { catalog: ChartFacts["factCatalog"] } {
  const catalog: { id: string; description: string; status: "determined" | "limitation" }[] = [];
  const add = (id: string, description: string, status: "determined" | "limitation" = "determined") => {
    catalog.push({ id, description, status });
  };
  const natal = (["year", "month", "day", "time"] as const).flatMap((id, index) => {
    const pillar = input[id].value;
    return pillar ? [{ id, label: ["原局年柱", "原局月柱", "原局日柱", "原局时柱"][index]!, pillar }] : [];
  });
  const dayGan = input.onlyPersona?.dayMaster;
  if (dayGan) {
    for (const item of natal) catalog.push(...analysisFacts(`natal.${item.id}`, item.label, item.pillar, dayGan, []));
    add("limit.analysis_scope", "已核算十神、藏干、天干五合、地支六合与六冲、地支重复；未判定旺衰、格局、喜用神、合化、刑害破或神煞。不因未列关系推断不存在其他关系。", "limitation");
  }
  if (input.year.value) add("natal.year_pillar", `年柱为${input.year.value}，以立春交接时刻划分。`);
  if (input.month.value) add("natal.month_pillar", `月柱为${input.month.value}，以十二节交接时刻划分。`);
  if (input.day.value) add("natal.day_pillar", `日柱为${input.day.value}，晚子时仍属当天。`);
  if (input.time.value) add("natal.time_pillar", `时柱为${input.time.value}。`);
  if (input.onlyPersona) {
    add("natal.day_master", `日主为${input.onlyPersona.dayMaster}，来自日柱天干，不是年干或五行数量。`);
    add("persona.type", `类型标签为${input.onlyPersona.typeLabel}。`);
    add("persona.title", `国风称号为${input.onlyPersona.title}，由日主固定映射。`);
    add("persona.keywords", `基础关键词为${input.onlyPersona.keywords.join("、")}。`);
  }
  if (input.zodiacStatus === "determined" && input.zodiacSign && !input.nearBoundary) {
    add("zodiac.sign", `热带黄道太阳星座为${input.zodiacSign.name}，且不在交界缓冲内。`);
  }
  if (input.zodiacStatus === "ambiguous") {
    add("limit.zodiac_ambiguous", `太阳星座候选为${input.signCandidates.map((item) => item.name).join("、")}，不能确定唯一星座。`, "limitation");
  }
  if (input.nearBoundary) add("limit.zodiac_near_boundary", "出生时刻靠近星座交界缓冲。", "limitation");
  if (input.personaStatus !== "determined") add("limit.day_master_ambiguous", "日主不唯一，不能写专属人格正文。", "limitation");
  if (input.luckStatus === "determined" && input.currentPeriod && input.representative) {
    add("luck.direction", input.representative.forward ? "大运顺排。" : "大运逆排。");
    add("luck.current.period", input.currentPeriod.formal ? `当前正式大运阶段编号为${input.currentPeriod.id}。` : "当前仍处于起运前。");
    if (input.currentPeriod.pillar) add("luck.current.pillar", `当前大运干支为${input.currentPeriod.pillar}。`);
    if (dayGan && input.currentPeriod.pillar) catalog.push(...analysisFacts("luck.current", "当前大运", input.currentPeriod.pillar, dayGan, natal));
    if (!input.currentPeriod.formal) add("limit.before_yun", "尚未起运，不能写成已经进入正式第一步大运。", "limitation");
  } else {
    add("limit.luck_unavailable", "没有唯一大运阶段，不能写个人大运推断。", "limitation");
  }
  for (const annual of input.annualItems) {
    add(`annual.${annual.year}.pillar`, `${annual.year} 流年干支为${annual.pillar}，区间从当年立春到下一年立春前。`);
    if (dayGan && annual.personalStatus === "applicable") {
      catalog.push(...analysisFacts(`annual.${annual.year}`, `${annual.year}流年`, annual.pillar, dayGan, natal));
      for (const segment of annual.segments) {
        if (!segment.pillar) continue;
        catalog.push(...analysisFacts(`annual.${annual.year}.stage.${segment.periodId}`, `该年${segment.periodId}大运`, segment.pillar, dayGan, []));
        catalog.push(...analysisFacts(`annual.${annual.year}.with.${segment.periodId}`, `${annual.year}流年`, annual.pillar, dayGan, [{ id: "luck", label: `该年${segment.periodId}大运`, pillar: segment.pillar }]).filter((item) => item.id.includes(".relation.")));
      }
    }
    if (annual.personalStatus === "before-birth") {
      add(`limit.annual.${annual.year}.before_birth`, `${annual.year} 流年在出生前，不生成个人经历。`, "limitation");
    }
    if (annual.personalStatus !== "applicable") {
      add(`limit.annual.${annual.year}.personal`, `${annual.year} 流年没有可生成的个人阶段解读。`, "limitation");
    }
    annual.segments.forEach((segment, index) => {
      add(`annual.${annual.year}.segment.${index + 1}`, `${annual.year} 流年第 ${index + 1} 段对应阶段 ${segment.periodId}${segment.pillar ? `，干支 ${segment.pillar}` : ""}。`);
    });
    if (annual.segments.length > 1) add(`limit.annual.${annual.year}.cross_yun`, `${annual.year} 流年内发生交运，不能全年套同一阶段。`, "limitation");
  }
  for (const limitation of input.limitations) {
    if (!catalog.some((item) => item.description === limitation)) {
      add(`limit.note.${catalog.length}`, limitation, "limitation");
    }
  }
  return { catalog };
}
