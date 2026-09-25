import { Temporal } from "@js-temporal/polyfill";
import { describe, expect, it } from "vitest";

import { buildChart } from "@/lib/server/chart";
import { database } from "@/lib/server/db";
import { logOperation, saveChart, savePortrait, saveReading } from "@/lib/server/history";
import type { RowDataPacket } from "mysql2";

describe.skipIf(process.env.RUN_MYSQL_TESTS !== "1")("MySQL 历史记录", () => {
  it("保存完整快照、分段补全结果，并记录来源 IP", async () => {
    const id = crypto.randomUUID();
    const sessionId = "a".repeat(32);
    const db = database();
    const input = {
      calendar: "lunar" as const,
      birthDate: { year: 1999, month: 11, day: 15, isLeapMonth: false },
      birthTime: { precision: "shichen" as const, value: null, shichen: "si" as const },
      genderForCalculation: "male" as const,
      birthPlace: { cityId: "cn-shanghai", timeZone: "Asia/Shanghai", offsetChoice: null },
    };
    const facts = buildChart(input, Temporal.Instant.from("2026-09-25T00:00:00Z"));
    const previousProxySetting = process.env.TRUST_PROXY_HEADERS;
    process.env.TRUST_PROXY_HEADERS = "true";
    try {
      await saveChart({ id, sessionId, input, facts });
      await saveReading(id, sessionId, { personality: { status: "unavailable", summary: null, strengths: [], blindSpots: [], relationshipAdvice: null, cardSentence: null } }, "partial", "career", "测试关注方向");
      await saveReading(id, sessionId, { zodiacNote: { text: "星座解读", basisRefs: [] } }, "complete", "career", "测试关注方向");
      await savePortrait(id, sessionId, "data:image/png;base64,dGVzdA==");
      await logOperation({ request: new Request("http://localhost/api/chart", { headers: { "x-forwarded-for": "203.0.113.7" } }), sessionId, historyId: id, event: "chart", outcome: "success" });
      await logOperation({ request: new Request("http://localhost/api/reading", { headers: { "x-forwarded-for": "203.0.113.7" } }), sessionId, historyId: id, requestId: crypto.randomUUID(), event: "model_call", outcome: "reported", taskId: "identity", attempt: 1, model: "deepseek-flash", usage: { modelMs: 120, promptTokens: 1000, cacheHitTokens: 500, cacheMissTokens: 500, completionTokens: 1000 } });
      const [history] = await db.execute<RowDataPacket[]>("SELECT input_json, chart_json, reading_json, image_mime, image_data, status FROM fate_reading_history WHERE id = ?", [id]);
      const row = history[0];
      expect(row?.input_json.question).toBe("测试关注方向");
      expect(row?.chart_json.chartFingerprint).toBe(facts.chartFingerprint);
      expect(row?.reading_json.personality.status).toBe("unavailable");
      expect(row?.reading_json.zodiacNote.text).toBe("星座解读");
      expect(row?.image_mime).toBe("image/png");
      expect((row?.image_data as Buffer).toString()).toBe("test");
      expect(row?.status).toBe("complete");
      const [logs] = await db.execute<RowDataPacket[]>("SELECT ip, event, prompt_tokens, estimated_cost_cny FROM fate_operation_log WHERE history_id = ? ORDER BY id", [id]);
      expect(logs[0]?.ip).toBe("203.0.113.7");
      expect(logs[1]?.event).toBe("model_call");
      expect(logs[1]?.prompt_tokens).toBe(1000);
      expect(Number(logs[1]?.estimated_cost_cny)).toBeGreaterThan(0);
    } finally {
      if (previousProxySetting === undefined) delete process.env.TRUST_PROXY_HEADERS;
      else process.env.TRUST_PROXY_HEADERS = previousProxySetting;
      await db.execute("DELETE FROM fate_operation_log WHERE history_id = ?", [id]);
      await db.execute("DELETE FROM fate_reading_history WHERE id = ?", [id]);
    }
  }, 30_000);
});
