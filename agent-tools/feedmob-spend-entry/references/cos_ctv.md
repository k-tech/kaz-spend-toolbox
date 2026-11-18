# COS CTV 事件计费

历史案例：[spend tracking #14464](https://github.com/feed-mob/feedmob/issues/14464)：LG 23886、Samsung 23884；2026-10-06 的记录曾采用每个 `extPermissionsGranted` 事件 $15，Samsung Net 曾按 $7 CPM。均为案例，不是当前或其他 URL 的默认值。先按 [共通规则](../SKILL.md) 查工单/负责人确认映射、费率、范围、生效期及 Net 来源。

LG 历史来源为官方日报的 Spend 和 Impressions；Samsung 为其报表成本或经确认的 CPM。Kochava 事件数须核实账号上下文、app、事件、目标日和时区。Gross 按计费 events × 已确认费率；`CLIENT PAID ACTION COUNT` 必填为该事件数，Net 来自确认的实际来源。Clicks、Installs 不必填；不要把 Partner paid action 当作事件数。

历史页面可能在保存后要求确认原因或工单链接；按实际页面处理并回读。已有记录按共通规则判断，不能因可能是 upsert 就直接覆盖。截图及工单汇报仅在获授权且实际完成相应步骤后进行。
