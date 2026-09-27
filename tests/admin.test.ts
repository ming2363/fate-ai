import { existsSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";

const { query, execute, getConnection, commit, rollback, release } = vi.hoisted(() => ({
  query: vi.fn(), execute: vi.fn(), getConnection: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
}));
vi.mock("@/lib/server/db", () => ({ database: () => ({ query, execute, getConnection }) }));

import { GET as stats } from "@/app/api/admin/stats/route";
import { GET as history } from "@/app/api/admin/history/route";
import { openRegionLookup } from "@/lib/server/ip-region";

const token = "test-admin-token-".repeat(3);
const request = (queryString = "") => new Request(`http://localhost/api/admin/history${queryString}`, { headers: { authorization: `Bearer ${token}` } });
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });

it("管理员接口默认关闭，错误凭证不查询数据库", async () => {
  vi.stubEnv("ADMIN_API_TOKEN", "");
  expect((await stats(request())).status).toBe(503);
  vi.stubEnv("ADMIN_API_TOKEN", token);
  expect((await stats(new Request("http://localhost/api/admin/stats"))).status).toBe(401);
  expect((await history(new Request("http://localhost/api/admin/history"))).status).toBe(401);
  expect(getConnection).not.toHaveBeenCalled();
  expect(query).not.toHaveBeenCalled();
});

it("统计保留未知地区，解读重试不会重复计算历史条数", async () => {
  vi.stubEnv("ADMIN_API_TOKEN", token);
  getConnection.mockResolvedValue({ query, commit, rollback, release });
  query.mockResolvedValueOnce([])
    .mockResolvedValueOnce([[{ status: "complete", count: 1 }, { status: "charted", count: 1 }]])
    .mockResolvedValueOnce([[{ event: "page_view", outcome: "success", count: 3 }, { event: "reading", outcome: "success", count: 4 }]])
    .mockResolvedValueOnce([[{ ip: null, visits: "3", readingCalls: "4" }]])
    .mockResolvedValueOnce([[{ ip: null, count: 2 }]]);
  const response = await stats(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  const data = await response.json();
  expect(data.totals).toEqual({ histories: 2, visits: 3, readingCalls: 4, operationLogs: 7, uniqueVisitIps: 0 });
  expect(data.regions).toEqual([{ country: "未知地区", province: "", city: "", visits: 3, histories: 2, readingCalls: 4, uniqueVisitIps: 0 }]);
  expect(commit).toHaveBeenCalledOnce();
  expect(release).toHaveBeenCalledOnce();
});

it("历史查询验证参数、分页，并返回完整文字结果", async () => {
  vi.stubEnv("ADMIN_API_TOKEN", token);
  expect((await history(request("?limit=101"))).status).toBe(422);
  expect((await history(request("?id=invalid"))).status).toBe(422);
  expect(query).not.toHaveBeenCalled();
  query.mockResolvedValueOnce([[{ id: "first" }, { id: "second" }]]);
  expect(await (await history(request("?limit=1"))).json()).toEqual({ items: [{ id: "first" }], nextOffset: 1 });
  execute.mockResolvedValueOnce([[{ reading_json: { summary: "完整解读" }, has_image: 1 }]]);
  expect((await (await history(request("?id=4282e888-6631-438f-a76a-d7d553cfae4b"))).json()).reading_json.summary).toBe("完整解读");
});

it("日报日期覆盖前一日零点到次日零点，拒绝不存在的日期", async () => {
  vi.stubEnv("ADMIN_API_TOKEN", token);
  expect((await stats(request("?date=2026-02-30"))).status).toBe(422);
  expect(getConnection).not.toHaveBeenCalled();
  getConnection.mockResolvedValue({ query, commit, rollback, release });
  query.mockResolvedValueOnce([]).mockResolvedValue([[]]);
  const response = await stats(request("?date=2026-12-31"));
  expect(response.status).toBe(200);
  expect((await response.json()).period.endExclusive).toBe("2027-01-01T00:00:00+08:00");
  for (const [, params] of query.mock.calls.slice(1)) expect(params).toEqual(["2026-12-31 00:00:00", "2027-01-01 00:00:00"]);
});

it.skipIf(!existsSync("data/ip-region/ip2region_v4.xdb"))("本地地区库正确解析 IPv4、映射地址和未知地址", async () => {
  const lookup = openRegionLookup();
  try {
    expect(await lookup.lookup("222.139.31.18")).toEqual({ country: "中国", province: "河南省", city: "安阳市" });
    expect(await lookup.lookup("::ffff:222.139.31.18")).toEqual(await lookup.lookup("222.139.31.18"));
    expect((await lookup.lookup(null)).country).toBe("未知地区");
    expect((await lookup.lookup("invalid")).country).toBe("未知地区");
  } finally { lookup.close(); }
});
