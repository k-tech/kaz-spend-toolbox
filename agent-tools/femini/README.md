# Femini / Feed AI Assistant：查询与试算

## 入口、身份与状态

面向本人的原生 Streamable HTTP MCP：`https://assistant.feedmob.ai/mcp`（个人 Bearer），另有 OAuth 入口 `/mcp/oauth`；Web 为 https://assistant.feedmob.ai 。这不是历史的 `femini-reporting` 包装服务。先检查自己当前 Agent 是否已发现原生 Femini 工具；只使用本人被授予的权限，不使用 Admin 的 KEY/SECRET 代替 Femini 凭据，不输出或提交密钥，不启用写权限。

2026-11-14 Kaz 可登录 Web；本机 Codex 已登记原生 Bearer 入口，令牌取自启动环境 `FEMINI_API_TOKEN`，配置中无令牌。实际运行时需通过本人安全方式提供；已有会话可能需新开。OAuth 自动注册尝试被服务器拒绝（不支持动态客户端注册），不代表所有 OAuth 方式不可用。随后使用本人已登录网页会话中的现有个人凭据，在页面内临时调用原生 MCP：initialize、工具发现及一个已确认实体的只读快照查询成功；凭据未输出或写入文件。此验证不等于本机 Codex 已认证，也不代表其他用户可调用。其他 Agent 或 Codex 会话只有完成操作者本人授权的接入后才能直接调用原生工具；仅能打开网页时只能核对网页可读字段，不能视为原生调用验收。已登记入口不等于已认证或可用。不要提取安装页令牌作为自动补救，不要重新索取已被拒绝的凭据，不要将凭据写入命令参数、仓库、配置、日志或聊天。

配置方式参见 [Codex MCP 官方说明](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) 和产品自身的安装说明；每位操作者配置自己的身份与受限安全存储。认证失败时区分 401、无权限和服务不可用，勿更换账号或反复触发钥匙串提示。无凭据或需人类登录时走所在环境的安全流程。

## 操作

1. 优先使用任务指定的 legacy Click URL；若未给定，通过本人有权访问的产品对象列表或已发现的 `list_click_urls` 等原生只读实体工具，按任务客户范围筛选并核实归属。不得擅选无关客户或假定历史样本对所有人可用。缺任务客户范围或无法确认归属时停止并写明缺项。明确日期及本人可访问范围，先列工具并读取实际 schema；工具不存在、未认证或 schema 不符就停止并记录。源码描述供参考，不保证线上或本人可用。
2. 使用实际发现的实体查询确认 Click URL 所属实体。源码将 Click URL 的 `click_url_name` 表示为 legacy ID 字符串；Client、Partner、Campaign ID 使用 Rails 内部 ID，不能混用。若对象不匹配或无法确认，停止。
3. 若可见 `get_click_url_spend_metrics`，按实际 schema 传 `click_url_name`、`start_date`、`end_date`，日期范围最多 93 天（以当前服务约束为准）。记录按日 Spend、事件及已导入 Partner Cost、源及覆盖；这是 Femini 存储的快照，不代表外部实时抓取。`null` 为缺失，数值 `0` 才是记录为零；无返回不等于零。输出币种、单位及数据刷新时间：未返回时明确未知。
4. 按需查 `list_daily_campaign_metrics`，并以当前 schema 确认 metric 与筛选。日度不含 Makegood 等月度调整；涉及月度结算时核对 `list_monthly_campaign_metrics` 和 `list_monthly_spend_adjustments`，不得以日度总和替代月度口径。分页接口须确认总页数并取齐。
5. 以实际可见 schema 为准，先从已确认的 `get_click_url` 详情、相关 Spend Request、适用定价和事件来源的本人可访问只读业务入口，核对计算方法、费率、生效日期及事件路由。仅当这些资料与 schema 均已确认时，可调用只读 `preview_campaign_spend`；如果缺任何条件，停止试算、逐项列明缺失并标记待验证，不假造参数或结果。记录输入、逐日现值/拟算值、状态、警告和预览路径；未计算行即使计入总额为零，也不是确认的零金额或可执行的调整额。缺少规则时标记待验证，不猜参数。
6. 复核同范围原始工具输出和页面；报告查询时间、操作者、实体、范围、来源、单位、覆盖与新鲜度、结果和缺失。客户明细仅放受控的私有记录。

## 快照完成判定与交付模板

- **成功**：本人原生工具完成指定实体与日期的只读查询，所需字段、来源、覆盖和限制已对照原始输出，任务要求均已满足。
- **部分完成**：只获得部分日期/字段，或已有快照但所需外部对账无法完成；仅浏览器页面可读时只能报告页面核对，不能称原生查询成功。刷新时间未返回要写未知；若它是任务必需条件，则为部分完成。
- **受阻**：缺必要客户/日期、实体归属无法确认、原生工具缺失、未认证、无权限或 schema 不符；记录具体步骤及错误，不换身份。

交付：`状态 | 目标、身份及实体映射证据 | 日期/时区 | 查询时间 | 来源与覆盖/刷新 | 逐日指标、币种及单位 | null/0 和缺失 | 原始证据位置 | 未验证/失败及原因 | 下一步`。快照不代表实时数据；证据仅放授权的私有位置。试算属于独立待验收项，未执行时单列。

## 常见阻碍

- 401：身份或凭据无效；按个人安全方式重新认证。403/对象不可见：按实际授权处理，不申请扩大权限作为自动修复。
- 找不到工具：核对连接、服务发布与本人工具偏好；源码存在不是可调用证明。
- 空记录、源未覆盖、延迟或缺刷新时间：分别说明，不能合并为零或实时完整。
- 试算 warning / 未算出：保留原文和未计算行，不推导最终调整金额。
- 写入工具即使可见也不调用。本期不创建或更新 Spend；后续阶段需另行授权。

来源：Femini 源码 [routes](https://github.com/feed-mob/assistant/blob/067870b2315fed2984b5d33fc960c5e9bd842b5a/config/routes.rb)、[snapshot tool](https://github.com/feed-mob/assistant/blob/067870b2315fed2984b5d33fc960c5e9bd842b5a/app/tools/get_click_url_spend_metrics_tool.rb)、[preview tool](https://github.com/feed-mob/assistant/blob/067870b2315fed2984b5d33fc960c5e9bd842b5a/app/tools/preview_campaign_spend_tool.rb)，版本 `067870b2315fed2984b5d33fc960c5e9bd842b5a`；当前线上版本未核实。
