# FreeWheel / Beeswax PMP vendor-managed CPM

历史案例：[tracking #14523](https://github.com/feed-mob/feedmob/issues/14523)，Click URL 23879、line items 65/124；并非默认映射或当前状态。遵循 [共通规则](../SKILL.md) 并确认工单、每个 line item、日期和适用价格。自动化 mapping、job 或开关变更不属于本录入流程，须另有明确授权。

从 Performance Report 核实 UTC 完整日、精确 campaign/line item 筛选、普通 Impressions、Media Spend、Vendor Fees、Bid Shading Fee；同 URL 同日的指定行先分别汇总。已确认采用组件规则时 `Net = Media Spend + Vendor Fees + Bid Shading Fee`；报表总 Spend 只作对账，差异需保留并报告，除非工单明确指定其他规则。确认本任务按 margin 计费及目标日有效 margin，再计算 Gross。历史的 40% 仅为案例；统一补录例外和普通历史漏录依共通规则。

CPM 填 Impressions；Clicks、Installs 非必填，其他计数按适用规则及来源填写。核对现有记录、实际授权并保存后回读。页面对 dashboard/report 的生效窗口需以实际情况核实。

## 离线试算

`scripts/freewheel_spend.js` 接受已确认的聚合数据，不访问网络。`--margin` 是百分数，例如 1 表示 1%，40 表示 40%；输出只是草稿。脚本使用 JavaScript 浮点数，需按适用的金额精度和舍入规则复核，不能单独作为财务依据。

```sh
node agent-tools/feedmob-spend-entry/scripts/freewheel_spend.js --date 2026-01-01 --click-url-id 123 --impressions 1000 --media-spend 10 --vendor-fees 1 --bid-shading-fee 1 --margin 40 --line-items 1,2 --json
```

示例数字为虚构值；缺字段或规则未知不得靠默认值补齐。
