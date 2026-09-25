const REDUNDANT_ASIDES = [
  /[，；]?(?:只作|仅作|仅为|只作为)[^。！？]{0,60}(?:参考|提醒)[。！？]?/g,
  /(?:以上|以下)?仅(?:供|作)[^。！？]{0,80}(?:参考|提醒|断定)[。！？]?/g,
  /(?:以上|以下)?仅为文化语境[^。！？]{0,80}[。！？]?/g,
  /不必当作唯一标签[。！？]?/g,
  /不(?:作|做|据此)[^。！？]{0,80}具体事件(?:断定|预测)?[。！？]?/g,
  /不构成[^。！？]{0,80}(?:决策|建议|依据)[。！？]?/g,
  /[，；]?而非[^。！？]{0,40}必然[^。！？]*/g,
  /传统文化与自我探索，仅供娱乐参考[。！？]?/g,
];

export function cleanReadingText(text: string): string {
  return REDUNDANT_ASIDES.reduce((current, pattern) => current.replace(pattern, ""), text)
    .replace(/^[，；、\s]+|[，；、\s]+$/g, "")
    .trim();
}
