# 某天为什么没有数或金额异常

**状态：静态源码/文档核对，尚未实测。** 适合定位缺失日期、突变或与预期不一致；目标是分层证据，不保证一定能证明根因。

## 输入及前提

客户、已确认归属的 Click URL、目标日期和业务时区、期望值/异常现象、现有证据，以及本人已授权的浏览器或只读工具。缺客户范围、日期或归属时停止；可先读[系统地图](../spend-system-map.md)。不触发外部报表、上传、写入或 `partner_net_spends` 系列接口。

## 排查顺序

1. **查事实**：在 [Admin Workspace](../admin-workspace/README.md) 查询目标日期已录入记录并取齐分页，记录 ID、Net/Gross、来源、币种、创建时间；若可能包含 L0，分别核对 `all_spends` 的来源。也可用 [Spend Lens](../spend-lens/README.md) 做 L1 检查并复核底层结果。无记录、空值不是零消耗或漏录的证明。
2. **查配置和每日执行**：按当前 schema 查询 `/api/v1/direct_spend_job_stats` 或 `get_direct_spend_job_stats`，核对目标实体、状态及生效窗口；AI MCP 版本仅返回 live 配置。API 不提供每日具体报错，没返回任务不能证明从未有任务，也不能证明任务成功。需要日报状态或漏录清单时，有权限且可操作浏览器的 Agent 可在 Admin Web `/direct_spend_job_stats`、`/direct_spend_input_audits` 正常查看并保存可核实证据；无权限或无浏览器则记录待有权限者核对。
3. **查规则、需求及工单**：核实目标日 Click URL 历史价格、paid action、stage、margin、适用期及相关 Spend Request 中的公式/任务配置。查看有权限的对应 GitHub/HubSpot 工单，记录链接和时间；[tracking_admin 旧快照](https://github.com/feed-mob/tracking_admin/tree/6797bedb833e462d7ebbb5760a2aedb79a720d56) 不证明其工单无效。费率或公式冲突时列未知，不用当前配置代替历史事实。`vendor_managed` 的文档乘法与 SQL 除法冲突，不能作为默认算法。
4. **查变更**：按记录 ID 检查完整的 create 与 update 审计，分开报告，缺 create 或账号时创建人 `unknown`。Created At 不等于 Created By，Audit 账号不等于实际操作者或人工次数；Spend Date 筛选不保证创建期间记录齐全。
5. **关联独立证据**：需要月度调整时按 [Femini](../femini/README.md) 分开查月度数据；需要客户报告时转[对账](../feedmob-reporting/README.md)。Relay 确认记录是独立表，不等于已写入 Admin L1。

## 失败分支与完成判定

接口不可用、无法核实对象或无权限为受阻；完成部分事实但每日状态、历史规则、外部来源或原因未知为部分完成；若无法完成外部对账，取数成功仍是部分完成。只有任务范围内事实及其原因均由足够证据支持、必要来源已覆盖，才能称该问题已查明；不能推断无异常、无任务或零消耗。

交付：`状态 | 客户/实体及日期/时区 | 记录与覆盖 | 配置/每日状态及来源 | 历史规则与工单 | create/update 审计 | 已证实原因 | 未知/失败 | 下一步`。

来源：Scout 静态研究的 [Admin API 控制器](https://github.com/feed-mob/feedmob_admin/tree/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/controllers/api/v1)、[任务状态模型](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/models/daily_direct_spend_stat.rb)、[漏录审计](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/commands/direct_spend_input_audit_command.rb)、[AI MCP](https://github.com/feed-mob/fm-mcp-servers/tree/92280dd570094caa74c4340d68012718ad76486c/src/feedmob-reporting)。线上页面、权限和返回字段未验证。
