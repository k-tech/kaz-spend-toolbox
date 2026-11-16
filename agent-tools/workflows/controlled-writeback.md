# 补录、修改和历史调价：受控写回参考

**状态：静态源码/文档核对，尚未实测。** 本文是后续治理参考，不属于默认只读执行流程；本轮无生产写入授权，也不提供生产提交命令或参数。适用问题：某记录需要新增、修改，或历史价格需要纠正。输入包括客户与实体、日期、目标字段及金额、合同依据、生效规则、现有记录、影响范围和已获授权范围；缺任何必要依据则不执行。

## 源码所示硬限制（以线上实际部署为准）

| 入口 | 静态代码中的鉴权/限制 |
|---|---|
| AI Direct Spend 创建/修改控制器 | API Key 鉴权并检查 `AI_DIRECT_SPEND_CREATE_ALLOWED_EMAILS`；不支持代操作字段。已开票月份禁止非零新增或修改 Gross；创建检查重复、Spend Date 与 Click URL 创建日期；更新不可改日期和关联。 |
| AI Click URL 历史价格 | API Key 和 `AI_DIRECT_SPEND_CREATE_ALLOWED_EMAILS`；提供 `on_behalf_of_user_id` 时另检查 `AI_ON_BEHALF_OF_ALLOWED_EMAILS`。日期需早于当天且不早于 Click URL 创建日期；仅修改历史价格，不改当前价格或已有 Spend；某些 Margin 告警要求额外确认才能保存。 |
| AI Spend Request 创建/修改 | API Key 和 `AI_DIRECT_SPEND_CREATE_ALLOWED_EMAILS`；提供代操作字段时另检查 `AI_ON_BEHALF_OF_ALLOWED_EMAILS`。非测试客户创建可能触发邮件和 Slack 通知，通知警告不代表数据回滚。 |
| AI Campaign 创建/修改 | 此控制器源码未检查上述两个邮箱白名单；仍有 API Key 鉴权，更新受允许字段及预览令牌限制。 |
| Femini 手工 Spend | 静态源码显示需要工具开关、`pricings:write` 及对象权限；创建时本地或外部已有记录会拒绝。线上权限及双侧行为未实测。 |

## 受控操作建议（不是服务器强制规则）

1. 依照已获授权范围明确目标和预期；核实实体、币种、Spend Date、现有记录、历史规则、开票状态及潜在通知。不将本文写成每条操作都必须重新向用户询问的规则。
2. 在另行获权的实施阶段选择与业务一致的入口，先核实实际 schema、服务硬限制及最新权限；区分仅改历史价格、修改已有 Spend 和新增记录，不能假定修改一侧自动完成其他侧。
3. 操作后建议按记录 ID 回读实际字段、审计和受影响侧，核对状态；超时、`unverified`、通知警告或响应不明时先查是否已落地，不盲目重试。
4. 记录计划、实际结果、证据、异常及未覆盖字段；无读取权限或不能核实落地时标受阻或部分完成，不宣称成功。

Created At 不等于 Created By；缺 create 审计则创建人 `unknown`，Audit 账号不是实际操作者或人工次数；按 Spend Date 不能保证创建期间存量完整。费率必须有合同依据；`vendor_managed` 文档乘法与 SQL 除法冲突，待确认。仅在 Gross 分母定义成立且 `m = margin/100`、`1-m ≠ 0` 时才可代数反解，不能强套合同。

来源：Scout 静态研究的 [AI 控制器](https://github.com/feed-mob/feedmob_admin/tree/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/controllers/ai/api)、[Campaign 更新](https://github.com/feed-mob/feedmob_admin/blob/8876ed80d674cba6234cdbe48ade4141a1d388bb/app/services/ai/campaign_update.rb)、[Femini](https://github.com/feed-mob/assistant/blob/067870b2315fed2984b5d33fc960c5e9bd842b5a/app/tools/create_manual_spend_tool.rb)。实际白名单、权限、部署版本和业务写回尚未验证。
