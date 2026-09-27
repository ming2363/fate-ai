import { randomInt } from "node:crypto";

import { PERSONA_BY_GAN, type DayMaster } from "@/lib/shared/persona";
import { signById, type SignId } from "@/lib/shared/signs";
import { zodiacProfile } from "@/lib/shared/zodiac-reading";
import { HttpError } from "@/lib/server/errors";

const IMAGE_URL = "https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const FACE_VARIATIONS = [
  ["偏长鹅蛋脸，下颌线柔和", "清秀椭圆脸，下巴略圆", "脸颊略饱满，颧骨柔和", "窄长脸，颧骨与下颌转折清晰", "略方的鹅蛋脸，轮廓舒展"],
  ["舒展平眉，细长内双眼", "微挑长眉，眼尾略扬的凤眼", "自然弧眉，清澈杏眼", "略浓剑眉，眼窝稍深", "纤细柳叶眉，眼尾平缓"],
  ["鼻梁纤秀，鼻尖微圆", "鼻梁挺直，鼻尖轮廓清晰", "鼻梁柔和，鼻尖微翘"],
  ["唇峰清晰，上唇略薄", "唇形柔和，下唇饱满", "唇形修长，嘴角轻扬"],
];
const HAIR_VARIATIONS = {
  male: ["黑发高束半披，额前斜落几缕碎发", "深棕长发低束，侧分长刘海，鬓边散发", "黑色长发半挽小髻，露额，发尾随风", "黑发束成高马尾，额前不规则短碎发"],
  female: ["深色长发蓬松挽髻，鬓边几缕卷曲散发", "黑色长发半挽半披，侧分长刘海", "深棕长发斜挽低髻，额前轻薄碎发", "黑色长发高挽云髻，两侧有自然垂发"],
};

const PERSONA_ART_DIRECTION: Record<DayMaster, string> = {
  甲: "松青、玉白为主，朱砂红与浅金点睛；挺拔松枝、松针暗纹、玉质发饰，身姿舒展，目光坚定而温和",
  乙: "青碧、月白为主，藕粉与浅金点睛；藤蔓与花叶刺绣、轻盈飘带，姿态灵动，眉眼柔和而有韧劲",
  丙: "朱砂红、暖白为主，日光金点睛；朝阳与流云纹样，衣袖舒展，目光明朗，笑意自然，充满行动力",
  丁: "胭脂红、象牙白为主，琥珀金点睛；灯火与细小花枝、精细织纹，暖光映面，神态专注而亲切",
  戊: "深墨绿、暖白为主，赭红与古金点睛；层叠山岳与山纹金线锦绣，衣服轮廓利落，神态从容可靠，年轻而不老成",
  己: "杏黄、奶油白为主，嫩绿与浅金点睛；田园花穗与细密织锦，衣料柔软，目光温暖，姿态自然亲切",
  庚: "银白、墨蓝为主，朱砂红点睛；金属饰件、利落衣领与刀剑意象，神态清朗果断，有精神但不凶狠",
  辛: "珍珠白、香槟金为主，胭脂红点睛；珠玉发饰与精巧花纹，衣料有细腻光泽，眉眼精致，仪态优雅而有分寸",
  壬: "海蓝、月白为主，青碧与浅金点睛；江海、远帆与流动水纹，衣袖迎风，目光开阔洒脱，有探索感",
  癸: "雾蓝、玉白为主，淡紫与银色点睛；雨露、清荷与透明水光，细致轻纱，神态清澈敏锐，安静但有生气",
};

export function personaImagePrompt(dayMaster: DayMaster, gender: "male" | "female", signId: SignId | null): string {
  const profile = PERSONA_BY_GAN[dayMaster];
  const sign = signId ? signById(signId) : null;
  const signNature = signId ? zodiacProfile(signId)?.nature : null;
  const face = FACE_VARIATIONS.map((choices) => choices[randomInt(choices.length)]!).join("；");
  const hair = HAIR_VARIATIONS[gender][randomInt(HAIR_VARIATIONS[gender].length)]!;
  return [
    "2:3竖版单人国风商业插画，古风幻想人物收藏卡的主视觉，唯美半写实数字绘画（romantic semi-realistic painterly illustration）。人物用细腻色块与柔和晕染塑造体积，面部轮廓融入光影，发丝与金线刺绣局部精刻；背景才用传统水墨山水。画风优先于其他装饰要求。",
    `主角是一位约20岁、明确已成年的东方${gender === "male" ? "年轻男子，俊美清朗，配小巧古金发冠" : "年轻女子，清丽明艳，柔润朱唇和淡淡桃色眼妆，配呼应人格意象的金玉步摇与耳坠"}。本次原创人物的相貌设计：${face}。发型：${hair}，发根蓬松。请依据这组五官比例设计新角色，不要套用固定人物脸型；人格类型不绑定某一张脸。眼睛大小自然，眼神鲜活有情绪；暖玉般肤色，脸颊透淡红，柔和侧光勾出鼻梁、唇形与面颊体积。${randomInt(2) === 0 ? "身体向左侧转，轻轻回眸" : "身体向右侧转，微微抬头"}，肩线有倾斜，神态自然舒展，呈现古风画集封面般的精致美感。`,
    `这是“${dayMaster}${profile.element}”人格类型的艺术化角色，称号“${profile.title}”，关键词为${profile.keywords.join("、")}，核心意象为${profile.image}。美术方向：${PERSONA_ART_DIRECTION[dayMaster]}。人格差异通过神态、姿势、服饰纹样和背景意象表达，不把人格类型当成真实外貌预测；沉稳、担当等关键词不通过皱纹或年龄感表达。`,
    "汉服为华丽而雅致的多层丝绸织锦，衣领交叠，宽袖自然垂坠，肩袖上有呼应人格的金线纹样与精细刺绣，疏密错落、有可辨识的细节；装饰集中在发饰、衣领与肩部。严格采用上述人格配色：主色覆盖大部分衣料，点缀色仅用于小面积刺绣、发饰和系带，不得另加大面积其他颜色。暖象牙色纸感背景与深色头发形成鲜明对比。纸张颗粒只在背景轻微出现，皮肤保持细腻。",
    "单人半身至腰部构图，肩身自然形成斜线，脸位于画面上半部，完整发髻与发饰入画，人物占画面约三分之二；下方三分之一用衣袖与简洁山水延伸，为后续文字叠加留出空间。背景山水、云气与人格意象植物虚实相间，点缀侧边，脸部周围干净。仅输出铺满画幅的人物插画，不绘制实体卡牌、倾斜相框、双卡拼贴或海报。",
    sign && signNature ? `星座仅作次要气质补充：${sign.name}，${signNature}。不得盖过上述人格意象和配色，不画星座图标。` : "",
    "避免传统工笔仕女画式的平面勾线填色、面部黑色描边、僵硬证件照、紧贴头皮的发型、灰绿滤镜、全画面泛黄、3D塑料感、真人摄影和夸张动漫大眼。不要中老年或幼童面容、白发、胡须、皱纹。不要文字、汉字、字母、标识、边框、水印或多个人物。并非任何真实人物的肖像。",
  ].filter(Boolean).join("\n");
}

export async function generatePersonaImage(dayMaster: DayMaster, gender: "male" | "female", signId: SignId | null, apiKey: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(IMAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "wan2.7-image-pro", input: { messages: [{ role: "user", content: [{ text: personaImagePrompt(dayMaster, gender, signId) }] }] }, parameters: { size: "1024*1536", n: 1, watermark: false } }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new HttpError(response.status === 429 ? 503 : 502, response.status === 429 ? "IMAGE_BUSY" : "IMAGE_MODEL_FAILED", response.status === 429 ? "绘画服务正忙，请稍后重试。" : "绘画服务暂时没有完成，请稍后重试。", true);
  const payload = await response.json() as { output?: { choices?: { message?: { content?: { image?: string }[] } }[] } };
  const imageUrl = payload.output?.choices?.[0]?.message?.content?.find((item) => item.image)?.image;
  if (!imageUrl) throw new Error("IMAGE_MISSING");
  const url = new URL(imageUrl);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".aliyuncs.com")) throw new Error("IMAGE_HOST_INVALID");
  const image = await fetchImpl(url, { signal, redirect: "error", cache: "no-store" });
  const mime = image.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!image.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("IMAGE_DOWNLOAD_FAILED");
  if (Number(image.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
