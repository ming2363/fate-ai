import type { RowDataPacket } from "mysql2";
import { Temporal } from "@js-temporal/polyfill";
import { z } from "zod";

import { assertAdmin } from "@/lib/server/admin";
import { database } from "@/lib/server/db";
import { errorResponse, jsonResponse } from "@/lib/server/http";
import { openRegionLookup, type Region } from "@/lib/server/ip-region";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  try {
    assertAdmin(request);
    const { date } = z.object({ date: z.iso.date().optional() }).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
    const end = date ? Temporal.PlainDate.from(date).add({ days: 1 }).toString() : null;
    const where = date ? " WHERE created_at >= ? AND created_at < ?" : "";
    const historyWhere = date ? " WHERE h.created_at >= ? AND h.created_at < ?" : "";
    const bounds = date ? [`${date} 00:00:00`, `${end} 00:00:00`] : [];
    const db = database();
    // A consistent snapshot keeps totals and regional breakdowns aligned during new readings.
    const connection = await db.getConnection();
    let history: RowDataPacket[], events: RowDataPacket[], ips: RowDataPacket[], historyIps: RowDataPacket[];
    const audience: Record<string, RowDataPacket[]> = {};
    try {
      await connection.query("START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY");
      [history] = await connection.query<RowDataPacket[]>(`SELECT status, COUNT(*) AS count FROM fate_reading_history${where} GROUP BY status`, bounds);
      [events] = await connection.query<RowDataPacket[]>(`SELECT event, outcome, COUNT(*) AS count FROM fate_operation_log${where} GROUP BY event, outcome ORDER BY event, outcome`, bounds);
      [ips] = await connection.query<RowDataPacket[]>(`SELECT ip, SUM(event = 'page_view') AS visits, SUM(event IN ('reading','report_created')) AS readingCalls FROM fate_operation_log${where} GROUP BY ip`, bounds);
      [historyIps] = await connection.query<RowDataPacket[]>(`SELECT (SELECT l.ip FROM fate_operation_log l WHERE l.history_id = h.id ORDER BY l.id LIMIT 1) AS ip, COUNT(*) AS count FROM fate_reading_history h${historyWhere} GROUP BY ip`, bounds);
      for (const field of ["device", "os", "browser", "model", "network", "language", "timeZone", "referrerOrigin", "source", "campaign"] as const) {
        [audience[field]] = await connection.query<RowDataPacket[]>(`SELECT COALESCE(NULLIF(NULLIF(metadata_json->>'$.visitor.${field}','null'),''),'unknown') AS name,SUM(event='page_view') AS visits,SUM(event='report_created') AS reports,COUNT(DISTINCT CASE WHEN event='page_view' THEN session_id END) AS sessions FROM fate_operation_log WHERE event IN ('page_view','report_created')${date ? " AND created_at>=? AND created_at<?" : ""} GROUP BY name ORDER BY visits DESC,reports DESC,name LIMIT 100`, bounds);
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }

    const lookup = openRegionLookup();
    const regions = new Map<string, Region & { visits: number; histories: number; readingCalls: number; uniqueVisitIps: number }>();
    try {
      const regionFor = async (ip: string | null) => {
        const location = await lookup.lookup(ip);
        const key = JSON.stringify(location);
        let group = regions.get(key);
        if (!group) {
          group = { ...location, visits: 0, histories: 0, readingCalls: 0, uniqueVisitIps: 0 };
          regions.set(key, group);
        }
        return group;
      };
      for (const row of ips) {
        if (!Number(row.visits) && !Number(row.readingCalls)) continue;
        const group = await regionFor(row.ip);
        group.visits += Number(row.visits);
        group.readingCalls += Number(row.readingCalls);
        if (row.ip && Number(row.visits)) group.uniqueVisitIps++;
      }
      for (const row of historyIps) (await regionFor(row.ip)).histories += Number(row.count);
    } finally { lookup.close(); }
    const countEvent = (event: string) => events.filter((row) => row.event === event).reduce((sum, row) => sum + Number(row.count), 0);
    return jsonResponse({
      generatedAt: new Date().toISOString(),
      period: { date: date ?? null, start: date ? `${date}T00:00:00+08:00` : null, endExclusive: end ? `${end}T00:00:00+08:00` : null, timeZone: "Asia/Shanghai" },
      totals: {
        histories: history.reduce((sum, row) => sum + Number(row.count), 0),
        visits: countEvent("page_view"), readingCalls: countEvent("reading") + countEvent("report_created"),
        operationLogs: events.reduce((sum, row) => sum + Number(row.count), 0),
        uniqueVisitIps: ips.filter((row) => row.ip && Number(row.visits)).length,
      },
      historyStatuses: history, events, audience,
      regions: [...regions.values()].sort((a, b) => b.visits - a.visits || b.histories - a.histories),
      definitions: {
        histories: "每条排盘历史计一次，包含未完成解读；按该历史第一条操作日志的 IP 归属地区。",
        visits: "page_view 埋点次数，不是人数，不包含未触发埋点的页面请求。",
        readingCalls: "旧 reading 请求及新 report_created 次数；实际模型调用和费用见 /api/admin/metrics。",
        region: "离线 IP 库的网络出口地区，不是出生地或精确定位；缺失 IP 归入未知地区。",
        audience: "各维度独立统计，最多显示前100项；sessions 是匿名浏览器会话数。旧日志及浏览器未提供的字段归为 unknown，不推测手机具体型号；设备信息来自浏览器，可被修改。",
      },
    });
  } catch (error) { return errorResponse(error); }
}
