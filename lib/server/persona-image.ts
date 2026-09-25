import { PERSONA_BY_GAN, type DayMaster } from "@/lib/shared/persona";
import { signById, type SignId } from "@/lib/shared/signs";
import { zodiacProfile } from "@/lib/shared/zodiac-reading";

const IMAGE_URL = "https://model-api.maas.com.cn/v1/images/generations";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export function personaImagePrompt(dayMaster: DayMaster, gender: "male" | "female", signId: SignId | null): string {
  const profile = PERSONA_BY_GAN[dayMaster];
  const sign = signId ? signById(signId) : null;
  const signNature = signId ? zodiacProfile(signId)?.nature : null;
  return `竖版新中式人物肖像插画，主角是一位约20岁、明确已成年的东方${gender === "male" ? "年轻男子" : "年轻女子"}，黑色或深棕色头发，面容清秀有朝气，皮肤和五官呈现二十岁左右的自然年轻状态。气质体现${profile.keywords.join("、")}，以${profile.image}为背景意象，呼应${profile.element}元素和“${profile.title}”的意境；沉稳、担当、松树等意象只体现在神态和环境中，不要把人物画成中年或老年。${sign && signNature ? `兼取${sign.name}的意象：${signNature}画面用人物神态、姿势与环境表达，不画星座图标。` : ""}工笔人物与淡彩水墨结合，细致但克制，年轻而真实自然的面容与姿态，雅致服饰，宣纸肌理，墨绿、暖米色与赭红点缀，柔和光线，高级编辑设计感，人物清晰，背景有层次。不要白发、灰发、皱纹、明显法令纹或沧桑感；不要幼童面容。不要文字、汉字、字母、标识、边框或水印。并非任何真实人物的肖像。`;
}

export async function generatePersonaImage(dayMaster: DayMaster, gender: "male" | "female", signId: SignId | null, apiKey: string, signal: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<string> {
  const response = await fetchImpl(IMAGE_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "wan2.7-image-pro", prompt: personaImagePrompt(dayMaster, gender, signId), size: "1024x1536", n: 1 }),
    signal,
    cache: "no-store",
  });
  if (!response.ok) throw new Error("IMAGE_MODEL_FAILED");
  const payload = await response.json() as { data?: { url?: string; b64_json?: string | null }[] };
  const item = payload.data?.[0];
  if (item?.b64_json) {
    if (item.b64_json.length > MAX_IMAGE_BYTES * 1.4) throw new Error("IMAGE_TOO_LARGE");
    return `data:image/png;base64,${item.b64_json}`;
  }
  if (!item?.url) throw new Error("IMAGE_MISSING");
  const url = new URL(item.url);
  if (url.protocol !== "https:" || !url.hostname.endsWith(".aliyuncs.com")) throw new Error("IMAGE_HOST_INVALID");
  const image = await fetchImpl(url, { signal, redirect: "error", cache: "no-store" });
  const mime = image.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
  if (!image.ok || !["image/png", "image/jpeg", "image/webp"].includes(mime)) throw new Error("IMAGE_DOWNLOAD_FAILED");
  if (Number(image.headers.get("content-length") ?? 0) > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.byteLength > MAX_IMAGE_BYTES) throw new Error("IMAGE_TOO_LARGE");
  return `data:${mime};base64,${bytes.toString("base64")}`;
}
