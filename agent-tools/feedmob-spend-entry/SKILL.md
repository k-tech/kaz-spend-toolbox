---
name: feedmob-spend-entry
description: 准备、核对并在用户授权范围内录入 FeedMob direct spend；按供应商及计费方式选择来源与计算规则，适用于新增、补录和纠错。
---

# FeedMob Spend 录入

基于 FeedMob Kaz 原始共享包的 SKILL v1.5.3 整合；原包 SETUP-SHARE 写 v1.2.0，与 SKILL 版本不一致，不能据此断言整个包的版本。以下规则包含用户 2026-11-18 的澄清。历史 ID、费率和状态仅是案例，执行前核实当次范围及生效期。先读 [系统地图](../spend-system-map.md) 和 [受控写回](../workflows/controlled-writeback.md)。只读检查与预览不授权写入；实际写入须在用户明确授权的对象、日期、字段及操作范围内，使用本人权限。工单评论、通知和自动化配置也需要各自授权。

## 路由

根据实际 vendor、计费方式和工单选择；不把一个 pattern 的数据源、指标或费率套到另一个：

- [Bidease / Binance CPM](references/bidease_cpm.md)
- [COS CTV 事件计费](references/cos_ctv.md)
- [FreeWheel / Beeswax PMP](references/freewheel_pmp.md)
- [Kayzen / Binance CPM](references/kayzen_cpm.md)
- [Remerge / Binance reward](references/remerge_reward_tier.md)

## 准备与计算

1. 核实客户、Click URL 映射、Spend Date、时区、币种、实际来源、计费指标和关联 GitHub/HubSpot spend tracking 工单；确认来源覆盖、规则、生效范围和日期。缺少必要依据时查工单、历史记录或负责人说明，仍未知就问用户，不编造。
2. 按 margin 计费时，确认目标规则及适用日；仅在合同采用 Gross 为分母的 margin 定义时，`Gross = round(Net / (1 - margin), 2)`。不要默认某个 margin。事件乘固定费率计费通常没有固定 margin：`Gross = 计费 events × 已确认固定费率`，Net 取实际来源。费率从关联工单或负责人说明确认，标明范围与生效期；未知则问用户，不套历史案例的 $15。
3. 补录先查本次工单：若明确指定某范围统一补录及统一费率，仅在确认范围内使用。普通漏录遇规则变更，使用目标 Spend Date 当时的历史规则；新规则用于其生效后的日期。信息不足查工单及历史，仍未知则问用户。
4. Clicks、Installs 非必填，不强制为零或要求 Kayzen 填写。按 events × 费率计费的 Click URL 必填 `CLIENT PAID ACTION COUNT`，等于计费 events；不可替代为 Clicks、Installs 或 Partner paid action。按具体 pattern 保留其他要求，例如 CPM 的 Impressions；没有来源的字段不要编造。

## 已有记录与提交

提交前按 Click URL 和 Spend Date 查现有记录并核实完整性。普通录入已有记录且与目标一致则跳过；不一致时告知差异并询问用户，不能自行覆盖。用户已明确要求修改、纠错或指定目标值且范围足够明确时，按要求更新，无需无端再次确认；若入口仅支持新增或拒绝已有记录，使用经核实支持更新的授权入口，不绕过限制。多条记录或目标不明确时停止并查明。

保存原因、来源、计算和相关工单；保存后按记录 ID 或日期及 URL 回读并核对实际字段，无法读取的字段标记未验证。失败、超时或结果不明时先查是否落地，保留错误和证据，不盲目重试。页面确认弹窗是否需要、入口能力和线上校验以实际界面及部署为准；不要把模拟或预览当成写入成功。不要仅因任务是录入就发评论或改配置。

FreeWheel 离线试算 helper 见对应 reference；它只消费已核实的输入，不读网络或写业务数据。它不能证明规则或来源适用。
