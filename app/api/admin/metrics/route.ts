import { z } from "zod";
import { Temporal } from "@js-temporal/polyfill";
import type { RowDataPacket } from "mysql2/promise";
import { assertAdmin } from "@/lib/server/admin";
import { database } from "@/lib/server/db";
import { errorResponse, jsonResponse } from "@/lib/server/http";
export const runtime = "nodejs";
export async function GET(request: Request): Promise<Response> {
  try {
    assertAdmin(request);
    const input = z.object({ date: z.iso.date().optional(), reportId: z.string().uuid().optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const day = input.date ?? Temporal.Now.zonedDateTimeISO("Asia/Shanghai").toPlainDate().toString();
    const bounds = [`${day} 00:00:00`, `${Temporal.PlainDate.from(day).add({ days: 1 })} 00:00:00`];
    const c = await database().getConnection();
    try {
      await c.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      const condition = input.reportId ? "history_id=?" : "created_at>=? AND created_at<?";
      const params = input.reportId ? [input.reportId] : bounds;
      const [costs] = await c.query<RowDataPacket[]>(`SELECT model,price_version,metadata_json->>'$.kind' AS kind,COUNT(*) AS calls,SUM(outcome='started') AS inFlight,SUM(estimated_cost_cny IS NULL) AS unknownCosts,SUM(prompt_tokens) AS promptTokens,SUM(completion_tokens) AS completionTokens,SUM(estimated_cost_cny) AS estimatedCny,SUM(CASE WHEN estimated_cost_cny IS NULL THEN CAST(metadata_json->>'$.reservedCny' AS DECIMAL(12,6)) ELSE 0 END) AS outstandingReservedCny FROM fate_operation_log WHERE call_id IS NOT NULL AND ${condition} GROUP BY model,price_version,metadata_json->>'$.kind'`, params);
      const [events] = await c.query<RowDataPacket[]>(`SELECT event,outcome,COUNT(*) AS count,COUNT(DISTINCT history_id) AS reports FROM fate_operation_log WHERE ${condition} GROUP BY event,outcome`, params);
      const historyCondition = input.reportId ? "id=?" : "created_at>=? AND created_at<?";
      const [completion] = await c.query<RowDataPacket[]>(`SELECT status,COUNT(*) AS count,SUM(image_data IS NOT NULL) AS images FROM fate_reading_history WHERE ${historyCondition} GROUP BY status`, params);
      const [timing] = await c.query<RowDataPacket[]>(`WITH durations AS (
        SELECT 'image' AS metric,duration_ms AS ms FROM fate_operation_log WHERE ${condition} AND event='module' AND task_id='portrait' AND outcome='success'
        UNION ALL SELECT 'first_text',LEAST(CASE WHEN task_state->>'$.tasks.identity.status'='completed' THEN CAST(task_state->>'$.tasks.identity.finishedAt' AS UNSIGNED) ELSE 18446744073709551615 END,CASE WHEN task_state->>'$.tasks.fortune_current.status'='completed' THEN CAST(task_state->>'$.tasks.fortune_current.finishedAt' AS UNSIGNED) ELSE 18446744073709551615 END)-CAST(task_state->>'$.createdAt' AS UNSIGNED) FROM fate_reading_history WHERE ${historyCondition} AND (task_state->>'$.tasks.identity.status'='completed' OR task_state->>'$.tasks.fortune_current.status'='completed')
        UNION ALL SELECT 'complete',(SELECT MAX(j.finished) FROM JSON_TABLE(task_state, '$.tasks.*' COLUMNS(finished BIGINT PATH '$.finishedAt' NULL ON EMPTY)) j)-CAST(task_state->>'$.createdAt' AS UNSIGNED) FROM fate_reading_history WHERE ${historyCondition} AND status='generated'
      ), ranked AS (SELECT metric,ms,ROW_NUMBER() OVER(PARTITION BY metric ORDER BY ms) AS r,COUNT(*) OVER(PARTITION BY metric) AS n FROM durations WHERE ms>=0)
      SELECT metric,MAX(n) AS samples,MAX(CASE WHEN r=CEIL(n*0.5) THEN ms END) AS p50Ms,MAX(CASE WHEN r=CEIL(n*0.95) THEN ms END) AS p95Ms FROM ranked GROUP BY metric`, [...params, ...params, ...params]);
      await c.commit();
      const totalReports = completion.reduce((n, row) => n + Number(row.count), 0);
      const completedReports = completion.filter((row) => row.status === "generated").reduce((n, row) => n + Number(row.count), 0);
      const imageReports = completion.reduce((n, row) => n + Number(row.images), 0);
      const total = {
        reports: totalReports, completedReports, imageReports,
        completionRate: totalReports ? completedReports / totalReports : null,
        imageRate: totalReports ? imageReports / totalReports : null,
        estimatedCny: costs.some((row) => row.estimatedCny !== null) ? costs.reduce((n, row) => n + Number(row.estimatedCny ?? 0), 0) : null,
        unknownCosts: costs.reduce((n, row) => n + Number(row.unknownCosts), 0),
        outstandingReservedCny: costs.reduce((n, row) => n + Number(row.outstandingReservedCny ?? 0), 0),
      };
      return jsonResponse({ total, date: day, timeZone: "Asia/Shanghai", reportId: input.reportId ?? null, completion, events, costs, timing, definitions: { cost: "供应商公开/配置价格估算；未知费用保留预算预留，不计为0；未冒充账单实付。", completion: "generated 为所有已请求模块完成，未点击年度不计失败。", firstText: "人格或当年解读首个模块完成时间。", save: "card_save 只代表导出或预览成功，不代表微信相册已保存。", sample: "延迟仅计成功样本；调用失败和未知数见 events/costs。" } });
    } catch (error) { await c.rollback(); throw error; } finally { c.release(); }
  } catch (error) { return errorResponse(error); }
}
