"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

import { cleanReadingText } from "@/lib/shared/reading-text";

const EXPLANATIONS: Record<string, string> = {
  四柱: "把出生的年、月、日、时各写成两个字的干支，一共四组，所以叫四柱。例如“己卯、丙子、戊申、丁巳”就是四柱。它是后面解读的基础。",
  年柱: "四柱中的第一组，表示出生年份对应的干支。年柱按立春等节气交接，不是简单在农历正月初一换年。",
  月柱: "四柱中的第二组，表示出生时所在的节气月份。这里的“月”按节气划分，和公历月份、农历月份都不完全一样。",
  日柱: "四柱中的第三组，表示出生日对应的干支。它前面的天干就是“日主”，后面的地支是日支。",
  时柱: "四柱中的第四组，表示出生时辰对应的干支。出生时间不清楚时，时柱可能无法唯一确定。",
  日主: "日柱前面的那个字，是整份八字解读的参照点。例如“戊申”日柱的日主是“戊土”。正财、正印等名称都要相对这个字来判断。",
  原局: "出生时排出的四柱，也叫本命盘。它本身不随年份改变；大运和流年是后来叠加进来比较的时间阶段。",
  干支: "传统历法用一个天干加一个地支组成两个字，例如“癸酉”。十天干和十二地支依次配对，共循环出六十组，用来标记年、月、日、时和大运。",
  天干: "干支两个字中的前一个字，十天干依次是甲、乙、丙、丁、戊、己、庚、辛、壬、癸。例如“癸酉”的“癸”是天干。",
  地支: "干支两个字中的后一个字，共十二个：子、丑、寅、卯、辰、巳、午、未、申、酉、戌、亥。例如“癸酉”的“酉”是地支。",
  藏干: "传统规则会给每个地支配上一个或几个天干，称为“藏干”。例如“午”里列出丁、己；这是排盘用的对应表，不是说字里真的藏着东西。",
  本气: "一个地支若有多个藏干，排在主要位置的那个叫本气。例如“午”藏丁和己时，丁是本气。它不表示这个人一定更强或更幸运。",
  透干: "某个地支的藏干，同时出现在四柱上方的天干位置，叫“透干”。简单说，就是同一个天干既在藏干里，也明确写在天干上。",
  十神: "不是十位神仙，而是以日主为参照，把其他天干与它的关系分成十种名称，如正财、正印、比肩。名称是传统分类，不能直接当成收入、职位或经历。",
  正财: "十神的一种。可以把它理解成“按规则管理和积累资源”的意象，解读时常延伸到预算、责任和稳定投入；看到正财不代表已经赚到钱。",
  偏财: "十神的一种。偏向资源流动、机会和灵活调配的意象；“偏”是分类名称，不等于偏门收入或突然发财。",
  正印: "十神的一种。常用来谈学习、吸收经验、获得支持和建立知识体系；它不是学历、证书或贵人的保证。",
  偏印: "十神的一种。常用来谈独立思考、跨领域学习和不同寻常的做法；“偏”不代表好坏，只是分类方式。",
  正官: "十神的一种。常用来谈规则、责任、秩序和对自己的要求；不表示一定当官、升职或受约束。",
  七杀: "十神的一种，也叫偏官。常用来谈压力、竞争、行动和边界；名字里有“杀”，并不是危险或灾祸的预告。",
  偏官: "也叫七杀，是十神中的一个名称。解读时常借它讨论压力、竞争和行动方式，不表示现实里有危险。",
  伤官: "十神的一种。常用来谈表达、创意、技能输出和对旧做法的质疑；名字里有“伤”，并不是受伤或坏事。",
  食神: "十神的一种。常用来谈表达、手艺、持续产出和把想法慢慢做出来；与吃饭或神灵没有直接关系。",
  比肩: "十神的一种，表示与日主同类的关系。解读时常借它谈自主性、同伴和协作，也可能谈意见相近时怎样分工。",
  劫财: "十神的一种，表示与日主同类、但阴阳属性不同的关系。常借它谈竞争、协作和资源分配；不表示钱财会被抢走。",
  财星: "正财与偏财的合称，是相对日主得出的十神类别。这里的“财”是传统意象，不等于银行存款或未来收入。",
  印星: "正印与偏印的合称，是相对日主得出的十神类别。解读里通常借它谈学习、支持和吸收经验。",
  官星: "正官与偏官的合称，是相对日主得出的十神类别。解读里通常借它谈规则、责任和压力。",
  大运: "传统排盘把人生分成一段段约十年的阶段，叫大运。例如“2024—2034”是一整段大运；若页面显示十天左右的范围，那是交运日期的不确定范围，不是大运只有十天。",
  流年: "排盘中逐年看的阶段，通常从当年的立春交接到下一年立春。它和公历一月一日到十二月三十一日不完全重合。",
  起运: "出生后进入第一段正式大运的时间。起运早晚由传统规则计算；出生时间只知道一个区间时，起运日也可能显示成范围。",
  交运: "从一段大运进入下一段大运的交接时刻。它是两个约十年阶段之间的边界，不是说大运只持续交接那几天。",
  顺排: "排大运时，按干支顺序往后推的一种方向。它由传统排运规则决定，只说明怎样排列，不代表运势更好。",
  逆排: "排大运时，按干支顺序往前推的一种方向。它由传统排运规则决定，只说明怎样排列，不代表运势更差。",
  立春: "二十四节气之一，通常在公历二月初。本网站用具体的立春交接时刻划分流年，因此二月初同一天出生的人也可能分属不同流年。",
  节气: "按太阳在一年中的位置划出的时间节点，一年有二十四个。排八字的年份和月份要看相关节气交接时刻。",
  五合: "五组固定的天干配对关系，例如“戊”和“癸”是一组。报告提到五合，只是在说明盘里有这组关系，不能直接推断结婚、合作成功或好运。",
  六合: "六组固定的地支配对关系，例如“巳”和“申”是一组。出现六合是排盘结构上的关系，不代表现实中的两个人一定合得来。",
  六冲: "六组固定的地支相对关系，例如“子”和“午”相冲。它可以提示解读时留意变化或拉扯，但不能直接推断事故、搬家或分手。",
  合冲: "“合”与“冲”是干支之间不同的配对关系。报告会把它们当作解释阶段主题的线索，不能单凭一个合或冲判断吉凶。",
  相冲: "两个地支落在传统的相对配对中，例如“子午冲”。这里先表示盘里的对应关系，具体会不会有变化，不能靠这两个字断定。",
  五行: "木、火、土、金、水五类传统分类，天干和地支都可对应到其中一类。它是描述关系的语言，不是数一数哪个字少就该补哪个。",
};

const TERMS = Object.keys(EXPLANATIONS).sort((a, b) => b.length - a.length);
const MATCH = new RegExp(`${TERMS.join("|")}|[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]|[子丑寅卯辰巳午未申酉戌亥]{2}冲`, "g");
const GANZHI = /^[甲乙丙丁戊己庚辛壬癸][子丑寅卯辰巳午未申酉戌亥]$/;
const BRANCH_CLASH = /^[子丑寅卯辰巳午未申酉戌亥]{2}冲$/;

export function GlossaryText({ text }: { readonly text: string }) {
  const cleaned = cleanReadingText(text);
  const popupId = useId();
  const [open, setOpen] = useState<{ term: string; top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popupRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (triggerRef.current?.contains(event.target as Node) || popupRef.current?.contains(event.target as Node)) return;
      setOpen(null);
    };
    const close = () => setOpen(null);
    document.addEventListener("pointerdown", dismiss);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", close, true);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", onKeyDown); window.removeEventListener("scroll", close, true); };
  }, [open]);

  const pieces: ReactNode[] = [];
  const seen = new Set<string>();
  let last = 0;
  for (const match of cleaned.matchAll(MATCH)) {
    const term = match[0];
    const index = match.index;
    if (index > last) pieces.push(cleaned.slice(last, index));
    if (seen.has(term)) pieces.push(term);
    else {
      seen.add(term);
      pieces.push(<button type="button" className="glossary-term" key={`${term}-${index}`} aria-label={`查看${term}的解释`} aria-expanded={open?.term === term} aria-controls={open?.term === term ? popupId : undefined} onClick={(event) => {
        if (open?.term === term) { setOpen(null); return; }
        const rect = event.currentTarget.getBoundingClientRect();
        triggerRef.current = event.currentTarget;
        const width = Math.min(330, window.innerWidth - 24);
        const height = Math.min(360, window.innerHeight * 0.5);
        const top = rect.bottom + height + 12 <= window.innerHeight ? rect.bottom + 8 : Math.max(12, rect.top - height - 8);
        setOpen({ term, top, left: Math.max(12, Math.min(rect.left - 90, window.innerWidth - width - 12)) });
      }}>{term}</button>);
    }
    last = index + term.length;
  }
  if (last < cleaned.length) pieces.push(cleaned.slice(last));
  const explanation = open ? EXPLANATIONS[open.term] ?? (GANZHI.test(open.term) ? `“${open.term[0]}”是天干，“${open.term[1]}”是地支；合起来是一组干支。它可用来标记年、月、日、时或一段大运，具体指什么要看它在句子中的位置。` : BRANCH_CLASH.test(open.term) ? `“${open.term[0]}”与“${open.term[1]}”是两个地支，在传统规则中属于相冲的一组。这里说的是命盘里的对应关系，不能直接推断现实中发生了什么事。` : "这是传统排盘中的术语，需要结合它在句子里的位置理解。") : "";
  return <>{pieces}{open ? <span id={popupId} ref={popupRef} className="glossary-popover" role="tooltip" aria-live="polite" style={{ top: open.top, left: open.left }}><small>术语小注</small><strong>{open.term}</strong><span>{explanation}</span></span> : null}</>;
}
