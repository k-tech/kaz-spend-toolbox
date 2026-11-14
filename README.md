# Kaz Spend Toolbox

AI-2895：Spend 工具箱提供 Admin 只读查询、统计和单条录入预览，并通过 CLI 与 MCP 暴露现有工具。实际提交单条录入须明确授权。

## Agent 任务入口

按业务任务选择 [Spend Lens 与 Femini 操作指南和案例](agent-tools/README.md)：检查已录入 Spend 和根因使用 Spend Lens；查数、多源快照与计费试算使用 Femini。两者独立运行，首期仅查询、诊断和无写入试算；Femini 需要操作者本人完成原生接入，当前本机 Codex 的持久认证仍未完成。

## 使用

需要 Node.js 18+。安装依赖后，可查看工具列表并运行测试：

```bash
npm ci
node src/cli.js list
npm test
```

## 工具一览

| CLI | 用途 |
|---|---|
| `admin-query` | 只读查询 Admin Direct Spend |
| `admin-analyze` | 查询并分析返回的 Spend 数据 |
| `admin-stats` | 按创建时间和创建人汇总已整理的记录 |
| `spend-trends` | 按 Spend Date 汇总分类和状态 |
| `admin-create` | 预览或新增单条 Spend；默认只预览 |

## 添加工具

在 `src/tools/` 添加独立模块，接受明确输入、返回含来源和范围的结构化结果；在 `src/cli.js` 的工具列表注册；补充使用说明与能验证数据处理的测试。CLI 是薄入口，模块可单独被其他程序导入。避免将凭据或用户数据放进代码、测试和日志。

## Admin Direct Spend 查询与创建记录统计

`admin-query` 依据 [FeedMob MCP 实现](https://github.com/feed-mob/fm-mcp-servers/blob/f24adfd0be6dbb94ee80b812c6573a1d84c52953/src/feedmob-reporting/src/api.ts) 和 [Admin 查询实现](https://github.com/feed-mob/feedmob_admin/blob/391c32d639066d208abcea39baa10081ee9635e4/app/commands/ai_direct_spend_index_command.rb) 只读 GET 查询，至少指定一个 Client 或 Click URL；多个过滤条件取交集。日期是 **Spend Date**，两端包含，不是 Created At。输出原始 JSON，金额在服务端已转浮点；不得假定等同数据库的原始精度。返回空数组仅表示该筛选条件下没有匹配，不代表没有其他范围数据。接口不提供创建时间、创建人或来源，因此不能用它计算录入人、系统/AI/人工占比，也不能用 Spend Date 范围推断创建期间的完整记录。

上述固定版本的后端直接返回匹配记录数组，没有分页参数或分页元数据；这不能证明运行中的服务或其他接口没有截断。HTTP 错误、非成功业务状态、非空业务错误或意外出现的分页元数据会使查询和分析失败，需核实上游契约，不能当成完整结果。该后端还支持 Campaign/Vendor ID 筛选，当前 Toolbox 未暴露这两项。

在受保护的环境提供 `FEEDMOB_KEY` 和 `FEEDMOB_SECRET`，不要放入命令、代码或日志。目标固定为 `https://admin.feedmob.com`，不跟随重定向。响应可能包含敏感业务数据，请限制文件权限；示例中的 ID 与日期仅为格式演示：

```bash
umask 077
node src/cli.js admin-query --start 2026-11-01 --end 2026-11-07 --click-url 12345 > admin-response.json
```

`admin-stats` 是独立的统计基础，**不直接读取上面的接口输出**。先从已核实的 Admin 创建记录准备 JSON 数组；每条必须包含唯一字符串 `id`、UTC `created_at`（例如 `2026-11-01T12:00:00Z`）、创建人标识 `created_by`（未知时为 `null`）和十进制字符串 `net_spend`。不要用 Last Updated By 替代 Created By。输入必须来自完整的创建时间范围；核实币种及排除范围，并自行排除已明确的测试客户/Crawler 后再运行。

```bash
node src/cli.js admin-stats --start 2026-11-01 --end 2026-11-07 --currency USD --input verified-created-records.json
```

统计按 UTC 创建日筛选并按创建人及日汇总记录数和当前 Net；金额以十进制字符串精确累加，`record_share` 为该创建人的记录数占所有输入范围内记录数的比例（含未知创建人），`records_per_calendar_day` 为记录数除以整个日期窗口的自然日数，两者四舍五入至四位小数。空白日期计入分母。记录数不等于上传批次，当前 Net 不一定是创建时金额。不会猜测 AI/系统/人工类别，不能宣称完成 AI-2867 统计口径核验。结果是否完整取决于创建记录来源、访问范围、排除规则和币种，程序无法独立验证。真实接口与创建记录的自动衔接仍需能返回 Created At/Created By 的接口或完整导出、以及来源归因证据。

### Spend 趋势统计

[AI-2867 工单](https://mobius.feedmob.com/issue/AI-2867)及其最终报告使用 Spend Date、逐行分类、按日/周/月比较 Net/Gross 和行数占比，以及某一时点的 Active/Paused 状态。工单早期也曾使用近 7 天≥3 日、近 3 天≥2 日的连续性定义；最终报告的 Active/Paused 是 Admin 状态快照，两种定义不能混用。

`spend-trends` 接受一个经人工核实和补充的 JSON 数组，**不能直接把查询原始输出作为输入**。每行字段：字符串 `id`、`spend_date`（YYYY-MM-DD）、字符串 `click_url_id`、十进制字符串 `net_spend` 和 `gross_spend`、`category`（`automatic`/`agent`/`manual`/`unknown`）、`status`（`active`/`paused`/`unknown`）及布尔值 `is_test`。同一 URL 必须使用相同的状态快照。分类应有逐行证据：已知用户名称不足以证明某行一定由 agent 执行；证据不足填 `unknown`。测试行通过明确标记排除。

```bash
node src/cli.js spend-trends --start 2026-09-01 --end 2026-11-04 --currency USD --status-as-of 2026-11-05 --input verified-spend-rows.json
```

输出按分类的总计、按日/周/月的金额及条数、按状态和分类的统计，以及各状态总计；同一时间段或状态内的百分比分别以该组全部分类（含 unknown）的行数、Net 或 Gross 为分母，金额分母为零时为 `null`。百分比四舍五入至两位，周从所选起始日开始每七天分组；最终周可能不足七天。相同 URL 可能跨类别出现，因此类别内 URL 数不可相加。金额是记录当前值，币种、完整性、测试与分类证据及状态快照均须自行核实。Vendor/report 生成统计、真实数据对账及 AI/人工可证实的逐行归因仍未实现。

### 真实只读验证记录

2026-11-11 使用获授权账号查询 Spend Date 2026-11-03、Click URL 23567，返回 1 行，日期和 URL 与请求一致；返回的 Net/Gross 为 JSON 数值，且响应没有 Created At、Created By、录入类别或状态字段。另一条 URL 23886 同日返回空数组。此检查不证明金额与 Admin 页面逐字段一致，也不证明其他日期、权限范围或完整导出可用。

### 直接查询并统计

`admin-analyze` 将真实 Admin 查询响应接入趋势分析，无需先改造 JSON：

```bash
node src/cli.js admin-analyze --start 2026-11-03 --end 2026-11-03 --click-url 23567 --currency USD
```

示例使用的币种须按实际业务核实；日期是 Spend Date（两端包含），不代表创建时间或 UTC 时间戳。也可用 `--client ID`，或重复 `--click-url ID`；过滤条件取交集。输出所选范围的 Net/Gross、记录数、日/周/月统计和占比。接口没有分类、状态与测试标记，故分别为 `unknown`、`unknown`、未知：未知测试记录**包含在总数中且单独计数**，不能称为已剔测试的生产统计，也不能解读为人工或自动占比。响应金额由服务端先转浮点，分析只能对接收后的数字累加，不能恢复服务端转换损失；币种和返回完整性仍需人工核实。无需修改或提交真实 Spend。

`by_click_url` 汇总每个返回过记录的 URL 的条数、Net/Gross、出现记录的天数、未返回记录的天数及同日多条记录的日期；`returned_record_coverage` 是整个查询范围的日期计数。未返回记录不等于零消耗或漏录，同日多条也不一定是重复录入。没有返回记录的 URL 不会出现在 `by_click_url`；以上统计不能证明 API 返回完整。

2026-11-11 真实只读验证：对 URL 23567、2026-11-03，`admin-query` 和 `admin-analyze` 均为一条，分析的 Net/Gross 与查询响应一致，测试标记和类别为未知；未与 Admin 页面金额逐字段核对。

报告生成侧：经检查，现有 [Client Report Spends](https://github.com/feed-mob/feedmob_admin/blob/master/app/controllers/api/v1/client_report_spends_controller.rb) 是报告消费数据行；[Vendor Reports](https://github.com/feed-mob/feedmob_admin/blob/master/app/views/vendor_reports/_vendor_report.html.erb) 显示 campaign、展示、消费等记录。两者行数不能证明生成或到达的报告/邮件数；当前未找到可确认完整报告生成事件的只读接口，故不输出该统计。需要能区分事件类型、唯一 ID、发生时间、报表及完整性范围的可靠事件来源后才能实现。

`admin-analyze` 只使用 Admin 查询响应，不接受人工历史证据补充分类、创建人、测试标记或状态。接口未返回的字段保持未知；历史 Spend Date 是查询条件，不代表利用历史证据推断结论。`admin-stats` 和 `spend-trends` 使用本地提供的记录，不会自动从 Admin API 获取，不能视为 Admin API 的实时结果。

## Admin 单条 Spend 录入

`admin-create` 参考 [FeedMob 的 create_direct_spend](https://github.com/feed-mob/fm-mcp-servers/blob/f24adfd0be6dbb94ee80b812c6573a1d84c52953/src/feedmob-reporting/src/index.ts) 新增一条记录。默认只预览，显式传 `--submit` 才会写入。仅用于新增；目标 Click URL 和 Spend Date 已有记录时停止，不覆盖。每次只处理一条。

在受保护环境配置 `FEEDMOB_KEY` 与 `FEEDMOB_SECRET`。准备本地 JSON 文件（示例均为虚构值；勿提交业务数据或凭据）：

```json
{"click_url_id":12345,"spend_date":"2026-11-08","net_spend":"10.00","gross_spend":"12.50","billing_type":"CPM","impression":1000}
```

```bash
node src/cli.js admin-create --input spend-entry.json
node src/cli.js admin-create --input spend-entry.json --submit
```

`billing_type` 须明确填写 `CPM`、`CPA` 或 `OTHER`，仅用于本地检查，不发送给 API；CPM 必须提供展示数 `impression`。金额要求非负十进制字符串。可按业务需要提供 `clicks_count`、`installs_count`、`client_paid_action_count`、`partner_paid_action_count`、`creative`、`audit_comment`；计数为非负整数。必须由操作者核实目标 URL、日期、计价方式、当日生效 Margin、金额及必需的计费指标；程序不会从账户汇总推导客户金额，也不会自行计算 Gross。

提交前以相同 URL 和日期查询已有记录；提交后回读并比较 ID、金额和提供的计数/creative。返回 `created_verified` 表示这些字段回读一致；`existing` 为已有记录未提交；`rejected` 为接口明确拒绝；`unverified` 为提交或回读结果尚不明确，先核查后处理，不能盲目重试。`audit_comment` 无法从当前查询接口回读，提供时结果保留 `unverified`。当前只通过模拟接口验证，生产写入权限及生产提交尚未验证。

## Codex 的 MCP 接入

项目通过标准 stdio MCP 暴露 `admin_query`、`admin_analyze`、`admin_stats`、`spend_trends`、`admin_create`，分别对应同名 CLI 的连字符版本。`npm ci` 安装锁定依赖；使用 Node.js 18+。本机注册示例（根据实际安装位置调整绝对路径）：

```sh
codex mcp add kaz-spend-toolbox -- /absolute/path/to/node /absolute/path/to/kaz-spend-toolbox/src/mcp.js
codex mcp get kaz-spend-toolbox
```

按 [Codex 官方文档](https://learn.chatgpt.com/docs/extend/mcp?surface=cli)，可为该服务在 Codex 配置的 `env_vars` 中列出 `FEEDMOB_KEY`、`FEEDMOB_SECRET`，使其继承启动 Codex 时已有的环境变量。配置中只列名称，不要保存凭据值；缺少凭据时离线工具和预览仍可用，在线工具会报错。环境变量需由使用者通过自己的安全方式提供；注册本身不会自动获取业务凭据。新开 Codex 会话后验证工具发现，已运行会话不保证热加载。

MCP 离线分析直接接收 JSON 数组，不接受文件路径。日期与币种说明、来源限制及未知字段与上面的 CLI 一致。`admin_create` 是有副作用的工具，**默认只预览**；`submit: true` 会尝试真实生产写入，必须事先取得用户对该笔具体录入的明确授权并核实业务数据。现有查重、回读、不确定结果不重试的限制不变。安装或预览不构成提交授权。

macOS 可使用 `src/mcp-keychain-launcher.js` 启动 MCP：优先使用启动环境中已有的 FeedMob 变量；缺少时使用 `src/mcp-keychain-read.py` 的 Security.framework 非交互模式，只查询登录钥匙串中 service `kaz-spend-toolbox.feedmob`、account 分别为 `FEEDMOB_KEY` 和 `FEEDMOB_SECRET` 的 Generic Password 项。日常启动不允许弹出钥匙串授权提示；钥匙串项目不存在、访问被拒或不可用时，在线工具返回不含密钥的结构化状态，离线工具仍可用。启动器不保存或创建凭据；请通过获授权的安全方式配置项目。
