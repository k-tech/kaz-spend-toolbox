# Remerge / Binance reward

历史案例：[tracking #14629](https://github.com/feed-mob/feedmob/issues/14629)、[规则 #14478](https://github.com/feed-mob/feedmob/issues/14478)。逐 Click URL 核实对应 campaign、目标 UTC 日 Remerge Cost、reward 规则和 margin；不同 URL 不可共用假设。依 [共通规则](../SKILL.md) 处理已有记录与补录。

历史规则案例：2026-10-12 起 #14657 曾使用当天金额 × 0.90 算 Net，之前曾按月累计分层（0.95 / 0.925 / 0.90）；部分历史日期后来曾统一修正。这些不是当前默认值，须核查本次工单明确范围和目标日生效规则；普通漏录及统一补录按共通规则区分。Gross 若确属 margin 模式，使用已确认的该 URL 和适用日期的 margin；Net 和 reward 与 margin 不同。

历史案例仅录 Net/Gross，Impressions 留空或零；不能把这一事实推广到其他 CPM pattern。Audit comment 记录原因、工单、来源和计算；按实际界面要求填写，保存后回读。需要更新历史记录时依用户明确指示和实际入口能力操作，不能假设所有提交都是安全覆盖。
