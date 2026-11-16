# Admin Workspace：记录、历史配置与审计

**状态：静态源码/文档核对，尚未实测。** 适合查某条 Admin 记录何时创建、配置在目标日是什么、记录如何变化；不是对创建人或人工录入次数的完整统计。

## 输入及前提

需要目标客户及已核实的 Click URL、Spend Date 闭区间/时区、业务问题、本人已授权身份与可用 Workspace。`fm workspace` 是 Admin `/api/v1/*` 的 GET 入口；操作者自行完成其个人身份认证，不使用他人凭据。当前 Agent 是否安装、认证、具备对象权限及线上接口版本均未知；不因源码存在就认为可调用。以下是固定来源支持的入口，参数以当前 OpenAPI 和响应为准，缺失时停止，不猜命令或 schema。已记录入口：`fm workspace openapi`、`fm workspace request get <api-v1-path>`。

**HTTP GET 不保证无副作用**：`/api/v1/partner_net_spends` 及其分支全部移出默认流程。`report_ids` 在某些伙伴缓存未命中时可创建外部异步报表；其他同步分支经过内部网关，其下游副作用未知。不得以 GET 名称自动调用。

## 执行顺序

1. 查看当前 OpenAPI 和本人访问范围，核实客户及 Click URL 归属、币种、日期和层级；缺任一任务必需项则停下。
2. 以实际 schema 查询 `/api/v1/direct_spends` 的目标日期记录，保存 ID、Spend Date、金额、`created_at`、来源及需求单线索；如目标包含 L0，按实际 schema 另查 `/api/v1/all_spends`，对齐来源和范围。静态研究显示该列表以 `start_date`、`end_date` 筛选 Spend Date，支持客户、Campaign、Vendor、Click URL 等筛选；两个接口排除测试客户/供应方；线上以返回和实际契约为准。它们的金额已转浮点，币种需另核实。
3. 对列表检查 `meta.current_page`、`total_pages`、`total_count` 并逐页读取，记录总页数、筛选和任何截断；分页或完整性不能确认时标部分完成。确认并保存记录 ID 后，按实际 schema 查询 `/api/v1/direct_spends/changes`；研究指出每批最多 100 个 ID，逐批并检查可能的分页/覆盖，勿自行假定完整；静态序列化会过滤部分空变更及字段，因此无返回不证明没有任何审计。
4. 对每条 ID 分开列 `action=create` 和 `action=update` 的时间、审计账号、变更前后及注释。列表 `created_at` 不是 `created_by`；`changes` 的账号是审计字段，不能直接当真实执行人或人工次数。缺 create 审计或账号时创建人 `unknown`，不能从 update 或 source 反推。
5. 按实际 schema 查 `/api/v1/click_urls/:id/histories` 的目标日价格/规则，以及 `/api/v1/direct_spend_requests` 中相关需求、公式和工单。核对生效期、分页、字段与证据；当前值不能自动当历史值。任务每日状态不足时按[异常排查](../workflows/missing-and-anomaly-triage.md)查授权的 Admin 页面。

## 失败、结果及证据

认证、权限、接口缺失或对象不匹配：受阻，记录步骤与错误，不换账号。页数不全、缺币种、审计、历史配置或所需外部对账：部分完成；无 create 审计如实记 `unknown`。成功须满足任务所需范围与证据、分页及时间口径均已核实，不能由查询返回即认定成功。

交付：`状态 | 客户/ID及归属 | Spend Date/时区 | 查询时间 | 来源、分页和覆盖 | 币种与金额 | create/update 分列证据 | 历史规则/需求单 | 未知与下一步`。原始证据只保存在受控位置。

来源：Scout 静态研究的 [Workspace CLI](https://github.com/feed-mob/feedmob-cli/blob/991577305c6e3595549fbf5689860f1dc514fbbd/lib/feedmob/cli/commands/workspace.rb)、[Admin 控制器](https://github.com/feed-mob/feedmob_admin/tree/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/controllers/api/v1)、[审计序列化](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/services/api/v1/direct_spend_change_serializer.rb)；线上部署、认证及数据完整性未验证。
