# FeedMob Reporting：通用查询与 Client Report 对账

**状态：静态源码/文档核对，尚未实测。** 用于查询授权对象的基础资料、已录入 Spend、历史配置或对照 Client Report；不代表当前 Agent 已接入。任务需要客户及已确认的 Click URL、日期/时区、报表名称或定位线索、币种、要比较的层级以及本人已授权身份。缺必要范围则停止，不查其他客户。

## 接入与工具选择

先确认本人环境已发现 `feedmob-reporting` 并查看当前只读工具 schema、身份和对象权限；仅通过本人受保护的认证方式访问，不安装配置或复制凭据。源码包括本地服务和 Admin 的远程服务，实际部署、认证和权限未知。

按问题选最少工具：查对象可用 `get_click_urls`（有分页时取齐）；查规则可用 `get_click_url_histories`、`get_direct_spend_requests`；查已录入记录可用 `get_direct_spends`；查日报可用 `get_client_report_spend_report_names` 和 `get_client_report_spends`。名称和 schema 以实际发现为准。静态研究显示前者 `get_click_url_histories` 的 `click_url_ids` 是整数数组，而 `get_direct_spends` 是字符串数组；不得把不同系统的内部 ID 混用。`get_direct_spends` 不返回 created_at、created_by、币种或分页状态，不能证明结果完整，也不能推断创建人。

服务器同时有写工具和单家 Partner 报表工具；默认流程不使用它们。`partner_net_spends/report_ids` 的 GET 可能创建外部报表，其他网关分支的下游副作用未知；均不纳入默认流程。Spend Lens 查询也可能触发异步外部报告，出现相关行为或要求时停止并记录。

## Client Report 对账步骤

1. 确认任务客户、实体映射、报表名、时间区间/时区、币种、Net/Gross 指标及目标层级。检查本人身份、实际 schema、所需来源与分页能力；无法确认时停止。
2. 按实际 schema 使用 `get_client_report_spend_report_names` 找到目标报表，再用 `get_client_report_spends` 取目标日期数据。静态研究显示名称查询范围为最近三个月，工具未暴露客户/Click URL 筛选和分页参数；名称不在范围、需要精确过滤或无法确认完整性时，按 [Workspace](../admin-workspace/README.md) 实际 schema 使用 `/api/v1/client_report_spends` 的过滤和分页，或标记范围不全。不能把报表名称当成客户归属证据。
3. 核实需比较的层级：只比较 L1 时，`get_direct_spends` 可作为 L1 候选，仍须核实记录完整性；**包含 L0 时不能用它冒充全部 Admin**，改查 Workspace `/api/v1/all_spends`，按实际 schema、来源、日期、权限和分页核实 L0/L1 覆盖。不可用或口径无法对应时，标记比较范围不全，不能宣称全量对账。
4. 分别保留两侧原始记录，确认相同实体、Spend Date、币种、指标和层级；先按同一 `(日期, Click URL)` 聚合每侧原始金额及行数，再比较同口径数值。范围不匹配的行单列，缺数据不当作零。接口金额可能已转浮点；记录精度限制、来源及刷新时间。
5. 对差异按需核对历史价格、需求单与调整，保留证据；日报落库行数或时间不证明邮件/S3 已成功生成或送达。月度结算需单独核对相应月度调整。

`vendor_managed` 的 skills 文档和脚本注释写乘法，同脚本 SQL 写除法，互相冲突；依据合同与需求单核实之前，不用任一式作为默认计算。Admin 标准 Gross 分母反解只在该定义及非零分母条件下成立，见[系统地图](../spend-system-map.md)，不泛化其他合同。

## 判定、失败及交付

- **成功**：任务所需两侧同实体、日期、币种、指标、层级及完整性已核实，原始聚合与差异有证据。
- **部分完成**：仅取到一侧、L0 或分页覆盖不明、币种/刷新未知且影响任务、或外部对账未完成；不得称全部一致。
- **受阻**：缺必要范围或身份、对象不可见、工具/schema 不可用。记录具体失败，不换身份或猜参数。

证据模板：`状态 | 客户/实体映射 | 日期/时区 | 两侧来源、层级、币种及刷新 | 原始记录覆盖/分页 | 分组汇总及差异 | 已证实原因 | 未知和下一步`。数据仅留在授权位置。

来源：Scout 静态研究的 [AI MCP 服务](https://github.com/feed-mob/fm-mcp-servers/tree/92280dd570094caa74c4340d68012718ad76486c/src/feedmob-reporting)、[Admin API](https://github.com/feed-mob/feedmob_admin/tree/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/controllers/api/v1)、[skills 脚本](https://github.com/feed-mob/skills/blob/f46404fe0e21d79ea76b8abe66423cfc97796de8/skills/feedmob-reporting-skills/scripts/calculate_gross_spend_datafusion.py)。现网 schema、数据覆盖及结果未实测。
