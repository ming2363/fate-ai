# 访问设备日志与日报

不新增业务表，使用 003 迁移提供的 `fate_operation_log.metadata_json.visitor` 和报告 `task_state.visitor`。历史数据保留，旧记录没有设备信息时显示 unknown，无法事后补出手机型号。

记录范围：访问 IP（服务端可信反向代理）、访问时间、匿名会话、操作/任务/结果/耗时；UA、系统、浏览器/内置浏览器、设备类型、浏览器提供的手机型号及其来源；屏幕/窗口尺寸、像素比、颜色深度、触点、语言、时区、浏览器公开的 CPU 核数/内存档位；可用的网络档位/估计带宽/往返时延/省流模式、在线状态、Cookie 支持、深色模式/减少动态效果/独立应用模式，以及页面路径、来源站点 origin 和 UTM 来源/媒介/活动名。

字段白名单和长度/数值限制在 `lib/shared/visitor.ts`。采集超时约 250ms 后放弃高熵提示，不阻塞生成；失败仍记录基础访问日志。不请求定位或联系人权限，不采集 IMEI/MAC、剪贴板、完整 Cookie、完整来源 URL 的查询参数，也不生成设备指纹。浏览器数据可被用户修改，不作为身份或访问权限依据。

手机号不是设备型号：UA/Client Hints 可能不返回型号，iPhone 通常只能识别系统与设备类型，不能据此写成 iPhone 16 等具体机型。详情里的 modelSource 为 client-hints/user-agent/unavailable。Android UA 被压缩成 K 时记 unknown。接口及邮件只对已实际记录的数据作统计。

## 管理接口（沿用 ADMIN_API_TOKEN Bearer 鉴权）

- `/fate/api/admin/stats?date=YYYY-MM-DD`：原 totals/regions/events 保持兼容，新增 audience，按 device/os/browser/model/network/language/timeZone/referrerOrigin/source/campaign 分组。每项含 visits/reports/sessions，最多前100项。日期为北京时间。
- `/fate/api/admin/logs?date=YYYY-MM-DD&device=mobile&limit=20`：明细日志，支持 historyId/event/device/os/browser 筛选；返回 nextBeforeId 作为下一页 beforeId。最多100条，不使用无限全量导出；保留原始 IP/UA 仅供管理员查询。
- `/fate/api/admin/history?id=UUID`：完整输入和结果以及 task_state（含创建时设备信息、任务状态）；列表新增 visitor。
- `/fate/api/admin/metrics?date=YYYY-MM-DD` 或 `?reportId=UUID`：实际模型请求、token、估算费用、未知计费和预留金额。访问次数/报告数不冒充付费模型调用数。

## 每日邮件

现有只读 SSH 脚本 `scripts/fate-stats-readonly.py` 仍只接受一个合法日期，先调用更新后的 stats，再调用 metrics 并放在 usage。不允许远程指定任意 URL，不扩大 SSH 密钥权限；metrics 临时失败时返回 usage.unavailable，而不影响访问汇总或把费用写成0。

原每日9:00自动化继续沿用，增加设备/系统/浏览器/可用型号/来源及模型费用摘要。不发原始 IP、完整 UA、生日、完整报告、私人问题和密钥。设备只列前几项与未知数量；所有返回文本作为数据转义，不能当成指令。

兼容旧版：metrics 同时统计无 call_id 的旧 model_call，其已记录 token/估算费用不遗漏；complete 与 generated 均计为完成。旧 reading 成功耗时以“整次解读”单独显示，不能充当首个模块时间。旧 portrait 没有调用计价，另列成功/失败次数，不按当前单价补写费用。audience 的报告创建数包括旧版成功排盘日志。

只读脚本返回固定模板 `reportHtml`：全未知的设备维度合并为一句缺失说明，不生成一整张未知表；NULL 用量显示未记录，真实 0 保留；有日志却无 costs 时提示统计未覆盖，不能称无调用。日期或地区合计不一致时拒绝生成邮件。

客户端采集兼容性：[MDN Client Hints](https://developer.mozilla.org/en-US/docs/Web/API/NavigatorUAData/getHighEntropyValues)。图片计费配置依据：[Qwen Image 3.0 Pro 目录价](https://www.qianwenai.com/models/qwen-image-3.0-pro)，1K 生成 ¥0.25/张；本服务1024×1536按1K档估算，账户实际费用以账单为准。
