import { describe, expect, it } from "vitest";

import { generatePersonaImage, personaImagePrompt } from "@/lib/server/persona-image";

describe("国风人物画", () => {
  it("按命盘意象与已核定星座生成提示，下载图片前限制来源", async () => {
    const prompt = personaImagePrompt("戊", "male", "sagittarius");
    expect(prompt).toContain("山岳");
    expect(prompt).toContain("射手座");
    expect(prompt).not.toContain("1999");

    const calls: string[] = [];
    const fetchImage = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (calls.length === 1) {
        expect(url).toBe("https://maas.qianwenaiapi.com/api/v1/services/aigc/multimodal-generation/generation");
        expect(JSON.parse(String(init?.body))).toMatchObject({ model: "wan2.7-image-pro", parameters: { size: "1024*1536" } });
        return Response.json({ output: { choices: [{ message: { content: [{ type: "image", image: "https://example.aliyuncs.com/portrait.png" }] } }] } });
      }
      return new Response(Uint8Array.from([137, 80, 78, 71]), { headers: { "content-type": "image/png" } });
    }) as typeof fetch;
    const image = await generatePersonaImage("戊", "male", "sagittarius", "test-key", new AbortController().signal, fetchImage);
    expect(image).toBe("data:image/png;base64,iVBORw==");
    expect(calls).toHaveLength(2);

    const unsafeFetch = (async () => Response.json({ output: { choices: [{ message: { content: [{ image: "https://evil.example/portrait.png" }] } }] } })) as typeof fetch;
    await expect(generatePersonaImage("戊", "male", null, "test-key", new AbortController().signal, unsafeFetch)).rejects.toThrow("IMAGE_HOST_INVALID");
  });
});
