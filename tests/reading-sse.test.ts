import { describe, expect, it, vi } from "vitest";

import { deepseekRequestBody, readServerApiKey } from "@/lib/server/deepseek";
import { beginInflight, endInflight, resetGuards } from "@/lib/server/guard";
import { HttpError } from "@/lib/server/errors";
import { validateReading } from "@/lib/server/reading-validate";
import { parseUpstreamPayload, readUpstreamSse } from "@/lib/server/upstream";
import { buildChart } from "@/lib/server/chart";
import { copyReport } from "@/lib/shared/copy-report";
import { parseSseBlock } from "@/lib/shared/sse";
import { appendThinking } from "@/lib/shared/thinking";
import { Temporal } from "@js-temporal/polyfill";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return name === "node_modules" || name === ".next" ? [] : walk(full);
    return full.endsWith(".ts") || full.endsWith(".tsx") ? [full] : [];
  });
}

describe("解读校验与流", () => {
  it("文字解读使用现有千问 Key，缺失时不回退到其他平台 Key", () => {
    try {
      vi.stubEnv("MAAS_IMAGE_API_KEY", " shared-test-key ");
      vi.stubEnv("DEEPSEEK_API_KEY", "old-test-key");
      expect(readServerApiKey()).toBe("shared-test-key");
      vi.stubEnv("MAAS_IMAGE_API_KEY", "");
      expect(readServerApiKey()).toBeNull();
    } finally {
      vi.unstubAllEnvs();
    }
  });
  it("生产代码不调用固定月日星座函数", () => {
    const hits = walk("lib").concat(walk("app"), walk("components")).filter((file) => /getXingZuo|getXingzuo/.test(readFileSync(file, "utf8")));
    expect(hits).toEqual([]);
  });

  it("请求体使用千问 DeepSeek 最高思考档位", () => {
    const body = deepseekRequestBody([{ role: "user", content: "{}" }]);
    expect(body.model).toBe("deepseek-v4.1-flash");
    expect(body.enable_thinking).toBe(true);
    expect(body.reasoning_effort).toBe("max");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.max_tokens).toBe(131072);
    expect(body.stream).toBe(true);
    expect(body).not.toHaveProperty("temperature");
  });

  it("同一片段里的思考和正文都保留，截断不能成功", () => {
    const delta = parseUpstreamPayload({
      choices: [{ delta: { reasoning_content: "想", content: "{" }, finish_reason: null }],
    });
    expect(delta?.reasoning).toBe("想");
    expect(delta?.content).toBe("{");
    expect(parseUpstreamPayload({ choices: [{ finish_reason: "length", delta: {} }] })?.finishReason).toBe("length");
  });

  it("跨块中文和缺少 done 能被解析", async () => {
    const payload = JSON.stringify({ choices: [{ delta: { reasoning_content: "甲乙丙丁", content: null } }] });
    const bytes = new TextEncoder().encode(`data: ${payload}\n\n`);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });
    const items = [];
    for await (const item of readUpstreamSse(new Response(stream))) items.push(item);
    expect(items.some((item) => typeof item !== "string" && item.reasoning === "甲乙丙丁")).toBe(true);
    expect(items).not.toContain("done");
    expect(parseSseBlock(": ping\n")).toBeNull();
  });

  it("思考只保留最近 6000 字，复制文本不含出生信息和困惑", () => {
    const next = appendThinking("甲".repeat(5990), "乙".repeat(20));
    expect([...next.text].length).toBe(6000);
    expect(next.truncated).toBe(true);
    const facts = buildChart({
      calendar: "solar",
      birthDate: { year: 1995, month: 8, day: 23, isLeapMonth: false },
      birthTime: { precision: "minute", value: "14:35", shichen: null },
      genderForCalculation: "female",
      birthPlace: { cityId: "cn-shanghai", timeZone: "Asia/Shanghai", offsetChoice: null },
    }, Temporal.Instant.from("2026-06-15T04:00:00Z"));
    const text = copyReport(facts, null, facts.annuals.currentYear);
    expect(text).not.toContain("1995");
    expect(text).not.toContain("上海");
    expect(text).not.toContain("14:35");
    expect(text).not.toContain("忽略之前规则");
  });

  it("非法 JSON、未知事实和错误年份不能通过", () => {
    const facts = buildChart({
      calendar: "solar",
      birthDate: { year: 1995, month: 8, day: 23, isLeapMonth: false },
      birthTime: { precision: "minute", value: "14:35", shichen: null },
      genderForCalculation: "female",
      birthPlace: { cityId: "cn-shanghai", timeZone: "Asia/Shanghai", offsetChoice: null },
    }, Temporal.Instant.from("2026-06-15T04:00:00Z"));
    expect(validateReading({ schemaVersion: "reading.v1" }, facts).ok).toBe(false);
    const badYear = validateReading({
      schemaVersion: "reading.v1",
      overview: { text: "先看已确定的部分。", basisRefs: [facts.factCatalog[0]?.id ?? "missing"] },
      personality: { status: "unavailable", summary: null, strengths: [], blindSpots: [], relationshipAdvice: null, cardSentence: null },
      currentLuck: { status: "unavailable", periodId: null, theme: null, summary: null, opportunity: null, attention: null },
      annualReadings: [{ year: 1800, status: "unavailable", summary: null, outlooks: [], career: null, relationships: null, finance: null, actions: [], segments: [] }],
      zodiacNote: null,
    }, facts);
    expect(badYear.ok).toBe(false);
  });

  it("重复进行中的请求不进入第二次调用", () => {
    resetGuards();
    beginInflight("session", "11111111-1111-4111-8111-111111111111", "hash-a");
    expect(() => beginInflight("session", "11111111-1111-4111-8111-111111111111", "hash-a")).toThrow(HttpError);
    try {
      beginInflight("session", "11111111-1111-4111-8111-111111111111", "hash-b");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      if (error instanceof HttpError) expect(error.code).toBe("REQUEST_ID_CONFLICT");
    }
    endInflight("session", "11111111-1111-4111-8111-111111111111");
    expect(() => beginInflight("session", "11111111-1111-4111-8111-111111111111", "hash-a")).not.toThrow();
    endInflight("session", "11111111-1111-4111-8111-111111111111");
  });
});
