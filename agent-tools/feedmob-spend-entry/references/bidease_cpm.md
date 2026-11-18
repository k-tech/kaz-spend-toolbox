# Bidease / Binance CPM

历史案例：[spend tracking #14484](https://github.com/feed-mob/feedmob/issues/14484)，VN Click URL 23951、TR 23952；这些映射及历史 margin 不代表当前值。先核对工单、实体、目标日和生效 margin，遵循 [共通规则](../SKILL.md)。

Bidease Reporting API 的历史报表使用目标 UTC 完整日，按 country 区分 VNM/TUR，取对应 spend 为 Net、impressions 为 CPM 指标。来源是否完整、映射及日期边界须核实；缺行不是零。Gross 按确认的 margin 规则计算，逐 URL 处理；旧案例的 55% / 40% 只是历史值，不作默认。

准备 Spend Date、Click URL、Net、Gross 和 Impressions，核对已有记录、授权范围及回读。可在用户要求时基于实际结果报告工单；不得预先宣称已录入。原包的旧网络脚本含默认 margin、静默回退和提前宣称成功，未纳入；这里保留 Bidease 业务流程，不新增 Bidease 专项 MCP 工具。
