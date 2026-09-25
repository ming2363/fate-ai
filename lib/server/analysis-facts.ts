import { LunarUtil } from "lunar-javascript";
import type { FactItem } from "@/lib/shared/chart-types";

/** Only calculate named relationships; a combination is not proof of transformation or good fortune. */
export function analysisFacts(prefix: string, label: string, pillar: string, dayGan: string, targets: readonly { id: string; label: string; pillar: string }[]): FactItem[] {
  const gan = pillar.slice(0, 1);
  const zhi = pillar.slice(1);
  const hidden = LunarUtil.ZHI_HIDE_GAN[zhi] ?? [];
  const facts: FactItem[] = [{
    id: `${prefix}.ten_gods`, status: "determined",
    description: `${label}${pillar}：相对日主${dayGan}，天干${gan}${LunarUtil.WU_XING_GAN[gan]}为${LunarUtil.SHI_SHEN[dayGan + gan]}；地支${zhi}${LunarUtil.WU_XING_ZHI[zhi]}藏${hidden.map((stem, index) => `${stem}（${LunarUtil.SHI_SHEN[dayGan + stem]}${index === 0 ? "，本气" : ""}）`).join("、")}。`,
  }];
  for (const target of targets) {
    const targetGan = target.pillar.slice(0, 1);
    const targetZhi = target.pillar.slice(1);
    const relations: string[] = [];
    if (LunarUtil.HE_GAN_5[LunarUtil.GAN.indexOf(gan) - 1] === targetGan) relations.push(`天干${gan}${targetGan}五合`);
    if (LunarUtil.HE_ZHI_6[LunarUtil.ZHI.indexOf(zhi) - 1] === targetZhi) relations.push(`地支${zhi}${targetZhi}六合`);
    if (LunarUtil.CHONG[LunarUtil.ZHI.indexOf(zhi) - 1] === targetZhi) relations.push(`地支${zhi}${targetZhi}六冲`);
    if (zhi === targetZhi) relations.push(`地支${zhi}重复`);
    if (relations.length) facts.push({
      id: `${prefix}.relation.${target.id}`, status: "determined",
      description: `${label}${pillar}与${target.label}${target.pillar}存在${relations.join("、")}。`,
    });
  }
  return facts;
}
