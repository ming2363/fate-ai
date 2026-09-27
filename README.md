# 知命

简体中文、手机优先、免登录的八字解读单页。程序先排盘，DeepSeek 官方 `deepseek-flash` 只负责白话解读。

## 启动

```bash
pnpm install
pnpm dev
```

浏览器打开 [http://127.0.0.1:3000](http://127.0.0.1:3000)。生产构建：

```bash
pnpm build
pnpm start
```

密钥只放在项目根目录 `.env.local`，权限建议 `0600`。服务端读取 `DEEPSEEK_API_KEY`，不要使用 `NEXT_PUBLIC_` 前缀，也不要提交密钥。变量名见 `.env.example`。

没有密钥时，`/api/chart` 仍可排盘；`/api/reading` 返回 `AI_NOT_CONFIGURED`，页面保留基础卡并提示“AI 解读尚未配置”。

## 历史记录与操作日志

设置 `.env.local` 中的 `MYSQL_HOST`、`MYSQL_PORT`、`MYSQL_USER`、`MYSQL_PASSWORD`、`MYSQL_DATABASE`，再在目标库执行 `db/schema.sql`。系统只写入 `fate_reading_history` 和 `fate_operation_log` 两张表：排盘后创建匿名历史，文字解读与人物画完成后补全；访问、排盘、解读、出图和保存卡片写操作日志。历史记录不在用户页面展示。部署在可信反向代理后设置 `TRUST_PROXY_HEADERS=true`，日志才会采用代理传入的真实访问 IP。数据库写入失败会记录服务端错误，不中断用户解读。

管理员只读接口统一要求 `Authorization: Bearer <ADMIN_API_TOKEN>`，在服务端配置至少 32 位随机凭证，不放在 URL 或前端。未配置时接口关闭，响应禁止缓存：

- `GET /api/admin/stats`：全部历史条数、访问埋点数、解读调用次数、操作日志数及各地区分布。地区按日志 IP 查询，未知 IP 不用出生地补全；历史按第一条关联日志归属，重试不会增加历史条数。访问次数不是访问人数。
- `GET /api/admin/stats?date=2026-09-26`：北京时间该日零点至次日零点（不含）的新增历史和操作事件。生产 MySQL 的 DATETIME 写入时区为北京时间；历史状态是查询时的最新状态，不代表完成发生在当天。
- `GET /api/admin/history?limit=20&offset=0`：历史列表，最多 100 条，使用 `nextOffset` 翻页。
- `GET /api/admin/history?id=<UUID>`：该次输入、排盘、完整文字解读和图片是否存在，不返回图片二进制。

部署在 `/fate` 时为 `/fate/api/admin/...`。地区库安装见 [data/ip-region/README.md](data/ip-region/README.md)。公网暂为 HTTP 时，请通过 SSH 隧道或服务器本机调用管理接口，避免明文传输凭证和出生信息。

## 验证

```bash
pnpm test
pnpm typecheck
```

## 计算口径

- 出生时刻按出生地当年 IANA 时区还原为 UTC，再换算成固定 UTC+08:00 排盘。不计算真太阳时。
- 日柱 `EightChar sect=2`：晚子时仍属当天。起运单独使用 `getYun(gender, 2)`，性别映射为库文档的 1 男、0 女，不取反。
- 太阳星座使用中气交接的 UTC 时刻，区间为 `[start, next)`。禁止用 `Solar.getXingZuo()` 判定。
- 交界缓冲 `boundaryGuardSeconds=120`。参考资料只有分钟精度时，不声称秒级天文精度。

## 限流

单 Node 进程内，默认每来源每 10 分钟 5 次解读。未设置 `TRUST_PROXY_HEADERS=true` 时不信任 `X-Forwarded-For`，直连请求共用一个额度桶。多实例部署前必须把限流交给共享网关，不能把这个内存计数器当成全站上限。进程重启会清空额度。

## 已核对的差异

- 总览字数按运行时合同校验为 1–120 字，产品文案里的 80–120 是写作目标，不是硬失败条件。
- 起运时刻采用库的 `getStartSolar()`，不是独立天文复核到分钟。
- 省市两级选项来自 [cn-division 2026.0.1](https://github.com/kk-418/cn-division) 的 `pc.json`（MIT，许可见 `data/china-provinces-cities.LICENSE`）；地点只用于映射 IANA 时区，不是地理编码。新疆出生记录若采用北京时间，可在表单中切换为 `Asia/Shanghai`。
- 主按钮底色略深于 `#A5362A`，以保证白字对比度。强调色仍是朱红。

## 未完成或未在本环境验证

- 没有发起真实 DeepSeek 付费调用。请求体、思考档位和失败分支由模拟流锁定。
- 没有在真实浏览器和反向代理上验证思考片段的实时送达。
- 独立分钟级节气样本目前是香港天文台 2025、2026 年中气，不是多个历史年代。更早的只有日期、没有时刻的表没有拿来声称分钟精度。
- 八字四柱没有第二套独立历法源的分钟级对照，只验证了锁定引擎和流派规则。
- 人格卡 PNG 依赖本机中文字体，尚未做截图验收。
