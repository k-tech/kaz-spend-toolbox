# Spend 系统与口径地图

**状态：静态源码/文档核对，尚未实测。** 适合第一次接手 Spend、需要判断数据从哪里来及应比较哪一层的 Agent。先准备客户、Click URL、日期/时区、问题及现有证据；缺客户范围或无法确定归属时停止。

## 先认识各处数据

| 位置 | 可回答什么 | 不可直接推断 |
|---|---|---|
| Admin 记录和配置 | 已录入金额、来源、需求单、任务配置、历史价格及审计 | 配置存在不证明某天任务成功；审计账号不自动等于实际执行人 |
| Admin `direct_spends` 接口 | L1 已录入记录（`net_spends`） | 不是含 L0 的完整 Admin Spend；名称中的 direct 不保证包含所有层级 |
| Admin `all_spends` 接口 | 源码中的 `DirectSpend` 视图，包含 L0 `v4_stat_records` 和录入来源 | 查询范围、测试实体排除及线上返回完整性仍要核实；不自动包含每种结算调整 |
| Femini | 本地存储的日度快照、来源及部分月度调整 | 不是实时外部源；内部 ID 与 Admin ID 不一定相同 |
| Spend Lens | 基于 Admin L1 及可用证据检查异常 | 不覆盖 L0、L2 或 Client Report；外部源未验证不等于一致 |
| Spend Relay | 供应方数据经确认后存入独立的 `relay_net_spends` | 不自动写入或覆盖 Admin `net_spends` |
| Client Report / 账单 | 前者是客户日报落库数据，后者面向月度结算 | 报告数据行数不能证明投递；日报总计不能代替账单与月度调整 |

以上是静态角色边界，并非对所有线上数据流的部署证明。遇 L0/L1 混合时使用 [对账指南](feedmob-reporting/README.md) 的分支；先查实际返回来源，不凭名称假定覆盖范围。

## 金额、日期和证据

- Net、Gross 的合同含义及适用计算以当期业务规则为准。Admin 代码中一种定义是 `margin% = (Gross - Net) / Gross × 100`，Gross 为 0 时不可计算。在**采用该定义**且 `m = margin% / 100`、`1 - m ≠ 0` 时，代数反解为 `Gross = Net / (1 - m)`；它不是未知合同的默认公式。
- `vendor_managed` 的 skills 文档/脚本注释写乘以 `(1 - margin/100)`，同脚本 SQL 却除以该值；两者冲突，待业务及维护者确认，不作为默认金额算法。
- Spend Date 是消费归属日，Created At 是创建时间，Created By 是创建人；按 Spend Date 查询不能保证覆盖某创建期间的全部存量。没有创建审计时创建人是 `unknown`；Audit 账号不等于实际操作者或人工次数。
- 明确实体映射、币种、时间范围/时区、来源和刷新；`null`、空结果与缺日不等于数值 0。浮点接口结果不能恢复上游精度。

事件 × 固定费率计费的 Gross 取计费 events × 已确认费率，Net 来自实际来源；不假设固定 margin。录入、补录和纠错按 [Spend 录入技能](feedmob-spend-entry/SKILL.md) 核实费率、适用日期和授权。

## 怎么用及完成判定

1. 根据问题在[新人入口](README.md)选择工作流，确定是已录入事实、某日异常、报表还是结算。
2. 对照上表列出每一侧的实体、层级、日期、币种、来源和时间，再按指南查授权范围内的原始证据。
3. 所需口径和证据均齐全才可报告相应结论；缺层级、来源或刷新时间时报告部分完成，缺身份或对象归属则受阻。取数成功但不能完成外部对账是部分完成。

证据模板：`目标 | 客户与实体映射 | 范围/时区 | 层级 | 原始来源与查询时间 | 币种/刷新 | 已证实 | 未知与下一步`。

## 固定来源和限制

根据 Scout 的静态研究整理：[Admin DirectSpend](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/models/direct_spend.rb)、[Admin NetSpend](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/models/net_spend.rb)、[Relay](https://github.com/feed-mob/feedmob-spend-relay/tree/63a0ff730fee314140472f2e199a4e9727d595d5)、[Femini](https://github.com/feed-mob/assistant/tree/067870b2315fed2984b5d33fc960c5e9bd842b5a)、[skills 冲突脚本](https://github.com/feed-mob/skills/blob/f46404fe0e21d79ea76b8abe66423cfc97796de8/skills/feedmob-reporting-skills/scripts/calculate_gross_spend_datafusion.py)。Client Report 与账单角色来自研究时的仓库 README，未固定版本；线上版本和数据流未验证。早期 [tracking_admin](https://github.com/feed-mob/tracking_admin/tree/6797bedb833e462d7ebbb5760a2aedb79a720d56) 代码快照较旧，不证明系统或其 GitHub 工单库退役，相关工单仍可作为证据。
