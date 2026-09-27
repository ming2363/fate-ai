# 报告恢复、后台任务与发布说明

原表历史不删除，页面仍无历史列表。不改“信息只用于本次解读”文案。以下为部署与验收步骤，实际发布状态以部署记录为准。

## 迁移与启动

1. 先备份当前应用数据库及运行配置，核对已有备份定时任务和可恢复样本。不要重复建立邮件/备份定时任务。
2. 已有数据库按序执行 `db/migrations/003-report-tasks.sql`，只执行一次；新库使用 `db/schema.sql`。先检查 002 的 token 字段已存在。003 只增加字段与索引，旧记录保留。迁移不在应用启动时偷偷执行。
3. Web 与 worker 使用同一 MySQL 配置及稳定的 `REPORT_SESSION_SECRET`（至少 32 字符随机密钥）。密钥放服务环境，不提交 Git。
4. 用户确认 `DAILY_MODEL_BUDGET_CNY`；核对供应商账户的单张图片价格，设置 `IMAGE_PRICE_CNY`、`IMAGE_PRICE_VERSION`（最多 16 字符）。预算/价格缺失时 worker 拒绝启动，不默认无限费用。测试中的价格仅为假数据，不是生产报价。
5. 安装依赖、执行 `pnpm test`、`pnpm typecheck`、`pnpm build`。Web 仍使用现有启动方式。独立 worker 使用 `pnpm worker`，需要 Node **24.7+**，命令启用 TypeScript 转换。部署源码、prompts、data 与依赖，不能只复制 `.next`。
6. `ops/fate-worker.service` 为模板；核实实际部署目录、Node 路径及服务用户后再安装，不能盲目覆盖已有服务。`.data/mbti` 只允许应用用户读写，可用 `MBTI_CACHE_DIR` 指向稳定的私有数据目录。不要放 public。
7. 仅启动一个 worker。MySQL named lock 防止重复实例；默认文字并发 2、生图并发 1，可用两个 MODEL_*_CONCURRENCY 环境变量调整。MySQL 连接池至少要能容纳 worker 锁连接和短事务。
8. 同时发布 Web 和 worker；旧 `/api/reading`、`/api/persona-image` 返回 410，请旧页面刷新，避免绕开新费用与任务保护。

## 访问与状态

- POST `/api/session` 初始化七天签名 HttpOnly cookie，先于访问埋点及任务请求。同源检查；HTTPS 使用 Secure。`NEXT_PUBLIC_BASE_PATH` 必须与 Web 构建路径一致。
- POST `/api/reports` 只接收出生输入、关注信息、选填称呼和客户端请求 UUID。排盘与 asOf 由服务端固定。相同 UUID/输入幂等，不同输入冲突；同一会话的相同输入正在生成时返回已有报告。
- GET `/api/reports/:id` 返回已验证模块和任务快照；图片通过 GET `/api/reports/:id/image` 单独读取。两个接口均验证所有者 cookie，no-store。只知道 ID 不能看报告。旧 unsigned cookie 不授予历史访问权；旧历史仍由管理员接口读取。
- POST `/api/reports/:id/tasks` 接收 requestId + action（retry/year/portrait/cancel）和对应 task/year。GET、刷新和恢复不触发付费请求。
- POST `/api/reports/:id/followups` 接收 requestId、question，限三问，每问 200 字，基于已保存事实与结果；不重新排盘/生图。
- POST `/api/reports/:id/feedback` 接收 module、value（有帮助/太笼统/术语看不懂）。同模块保留最新选择，写现有操作表，不调用模型。
- 浏览器只保存最近报告 ID；刷新轮询恢复。窗口隐藏降低轮询频率，回前台刷新，所有已请求任务终态后停止定时轮询。跨设备、清空 cookie、七天后不恢复；未增加账号体系。

任务在短事务中认领和合并；网络调用不占用数据库事务。lease 六分钟，单次调用五分钟。过期执行标记 interrupted，只能手动重试，排队任务可继续。每次实际请求单独 call_id；取消后版本递增，旧结果不能覆盖新任务。换图成功后才替换旧图，最多成功更换三次，技术重试另有限额。

## 费用与缓存

每次请求发送前先严格落库并预留保守额度。全局短锁序列化预算核验；保留完整输出上限及最大思考设置。模型 usage 收到后立即落库，结构验证失败仍记调用费用。图片上游已返回图时先记估算费用，即使随后下载失败也保留这笔账。未知 usage/网络结果保留 NULL 和预留额度，不能记 0；重试是新 call_id。预算按北京时间归日，公开价格估算不能替代供应商硬额度/实付账单。

MBTI 仅缓存 16 型通用侧写，按类型、模型、提示词版本校验；单进程同类型合并请求，默认 30 天。缓存没有用户生日、问题或姓名。每种类型最多一个私有文件，写临时文件后原子替换。数据库不可写时拒绝新付费调用。

## 统计

原 `/api/admin/stats` 和 `/api/admin/history` 保留。新增 `/api/admin/metrics?date=YYYY-MM-DD`，或 `?reportId=UUID`，沿用 ADMIN_API_TOKEN Bearer 鉴权；不在用户页面展示。

历史 created_at/updated_at 延续旧统计的北京时间口径，连接明确设置 +08:00；新增 next_run_at 单独使用 UTC_TIMESTAMP，状态内时间用 epoch 毫秒。上线前核对旧数据库的 DATETIME 原本是否采用北京时间，若不是，需先确定历史统计转换口径，不自动改写旧时间。

返回：报告总估算费用、完成率、图片完成率、模块成功/失败、报告完成状态、图片数、访问/创建/保存事件、文字/图片 token 与估算费用、未知费用和预留额；成功延迟 p50/p95 与样本数。card_save 表示导出/预览成功，不能证明微信相册保存成功。旧行没有 call_id，因此旧费用继续通过原日志读取，不能把新统计当作迁移前的完整账单。

## 运维检查与回滚

上线前由运维核对：应用与 worker 内存、swap/OOM、磁盘可用空间、MySQL备份落盘与异机副本、Nginx超时及转发头可信边界、日志轮换。只操作本服务目录、服务和数据库表。检查现有日报是否调用新的统计字段，不重复创建邮件定时任务。域名/DNS 未提供时不购买、不伪造 HTTPS；HTTP 复制已有手动兜底。

回滚先停 worker，部署上一版 Web，保留新增列及所有调用/历史数据。未完成的任务不自动重放，未确认费用不回填 0。新增字段无需立即删除；若要删除，先备份并单独审核数据影响。旧代码恢复后不会读取 v2 队列，恢复前明确用户重试行为，避免重新收费。

## 本地验收

运行 `pnpm test` 默认不会连接真实 MySQL。集成测试用独立本地容器：名称 fate-ai-report-test、127.0.0.1:33379、数据库 fate_integration_test；`RUN_REPORT_DB_TESTS=1 pnpm test tests/reports.integration.test.ts` 只连接该测试地址。测试调用 mock 模型，没有真实付费生成。不要把生产 env 注入测试。

发布前仍需供应商真实调用与微信真机验收，以及用户确认预算与图片计价。浏览器模拟宽度不能替代真机验证。


本地验收：类型检查、单元测试、独立 MySQL 集成测试与生产构建。旧 `/api/chart` 仅保留签名会话下的只读排盘，不再创建历史，报告写入统一走新接口。
