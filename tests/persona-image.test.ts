import { describe, expect, it, vi } from "vitest";
import { randomInt } from "node:crypto";

import { generatePersonaImage, personaImagePrompt } from "@/lib/server/persona-image";
import { DAY_MASTERS, PERSONA_BY_GAN } from "@/lib/shared/persona";

vi.mock("node:crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:crypto")>();
  return { ...actual, randomInt: vi.fn(actual.randomInt) };
});

describe("国风人物画", () => {
  it("重试连接前失败和图片下载，不重复提交结果未知的付费生成", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const output = () => Response.json({ output: { choices: [{ message: { content: [{ image: "https://example.aliyuncs.com/card.png" }] } }] } });
    try {
      const fetchImage = vi.fn<typeof fetch>()
        .mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "EAI_AGAIN" } }))
        .mockResolvedValueOnce(output())
        .mockRejectedValueOnce(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }))
        .mockResolvedValueOnce(new Response(Uint8Array.from([137, 80, 78, 71]), { headers: { "content-type": "image/png" } }));
      await expect(generatePersonaImage("辛", "female", null, "test-key", new AbortController().signal, fetchImage)).resolves.toBe("data:image/png;base64,iVBORw==");
      expect(fetchImage).toHaveBeenCalledTimes(4);
      expect(fetchImage.mock.calls[0]?.[1]?.body).toBe(fetchImage.mock.calls[1]?.[1]?.body);
      const uncertain = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("fetch failed", { cause: { code: "ECONNRESET" } }));
      await expect(generatePersonaImage("辛", "female", null, "test-key", new AbortController().signal, uncertain)).rejects.toMatchObject({ code: "IMAGE_CONNECTION_FAILED" });
      expect(uncertain).toHaveBeenCalledTimes(1);
      const cancelled = new AbortController();
      cancelled.abort(new DOMException("Timed out", "TimeoutError"));
      const aborted = vi.fn<typeof fetch>().mockRejectedValue(cancelled.signal.reason);
      await expect(generatePersonaImage("辛", "female", null, "test-key", cancelled.signal, aborted)).rejects.toMatchObject({ name: "TimeoutError" });
      expect(aborted).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(log.mock.calls)).not.toContain("test-key");
    } finally {
      log.mockRestore();
    }
  });
  it("同一输入重新抽取相貌和发型，保持人格内容不变", () => {
    const random = vi.mocked(randomInt);
    const original = random.getMockImplementation()!;
    try {
      random.mockImplementation(() => 0);
      const first = personaImagePrompt("辛", "female", "sagittarius");
      random.mockImplementation(() => 1);
      const second = personaImagePrompt("辛", "female", "sagittarius");
      expect(first).not.toBe(second);
      expect(first).toContain("偏长鹅蛋脸");
      expect(second).toContain("清秀椭圆脸");
      expect(first).toContain("蓬松挽髻");
      expect(second).toContain("半挽半披");
      for (const prompt of [first, second]) {
        expect(prompt).toContain("珠玉含光");
        expect(prompt).toContain("珍珠白、香槟金");
        expect(prompt).toContain("射手座");
      }
    } finally {
      random.mockImplementation(original);
    }
  });
  it("十种人格保留各自意象与配色，男女都保持成年青年形象", () => {
    const directions = new Set<string>();
    for (const gan of DAY_MASTERS) {
      for (const gender of ["male", "female"] as const) {
        const prompt = personaImagePrompt(gan, gender, null);
        expect(prompt).toContain(PERSONA_BY_GAN[gan].title);
        expect(prompt).toContain(PERSONA_BY_GAN[gan].image);
        expect(prompt).toContain(PERSONA_BY_GAN[gan].keywords.join("、"));
        expect(prompt).toContain("约20岁、明确已成年");
        expect(prompt).toContain(gender === "male" ? "年轻男子" : "年轻女子");
        expect(prompt).not.toMatch(/undefined|null|星座仅作/);
        directions.add(prompt.match(/美术方向：([^。]+)/)![1]!);
      }
    }
    expect(directions.size).toBe(10);
    expect(personaImagePrompt("甲", "female", null)).toContain("松青、玉白");
    expect(personaImagePrompt("辛", "female", null)).toContain("珍珠白、香槟金");
  });
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
        expect(JSON.parse(String(init?.body))).toMatchObject({ model: "qwen-image-3.0-pro", parameters: { size: "1024*1536" } });
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
