# Kaz Spend Toolbox

AI-2895：可扩展的 Spend 工具箱，包含只读查询、统计及单条录入。业务逻辑与命令行入口分离，后续可由 MCP/API 调用同一逻辑。

## 当前工具：Bidease 国家维度取数

查询 Bidease Reporting API 指定 UTC 日的 VN/VNM、TR/TUR 报表，展示 Spend、Impressions、查询日期、数据范围及获取时间。没有返回行显示“无返回行”，不按 0 处理。Spend 以 API 原始小数字符串保留，不擅自四舍五入。缺字段、重复国家行或格式不可靠时会报错，避免输出误导性结果。

**范围：**请求为 `group=Country`，未按 campaign、app 或 Click URL 筛选，账户范围由 token 决定；币种也未独立确认。因此结果是账户内国家维度汇总，不能直接当作 Binance 或某个 Click URL 的金额用于录入。需要后续核实账户范围及可用的 campaign 级过滤/维度，并与源报表核对。本工具不计算 Gross、不查询 Admin、不写入数据。

## 使用

需要 Node.js 18+ 和已有 Bidease API token。按你使用的凭据管理方式在当前 shell 提供 `BIDEASE_API_TOKEN`，不要把 token 写入仓库、命令参数或共享日志。工具不会在输出中包含 token。

```bash
node src/cli.js list
node src/cli.js bidease-country --date 2026-11-08
node src/cli.js bidease-country --date 2026-11-08 --json
npm test
```

日期明确指定为 UTC 日；API 请求范围为该日到次日。需要自行确认报表完成时间及数据时区。网络、认证和接口错误以非零退出码报告。无返回行不代表零消耗。

## 添加工具

在 `src/tools/` 添加独立模块，接受明确输入、返回含来源和范围的结构化结果；在 `src/cli.js` 的工具列表注册；补充使用说明与能验证数据处理的测试。CLI 是薄入口，模块可单独被其他程序导入。避免将凭据或用户数据放进代码、测试和日志。

## 当前验证情况

自动测试使用虚构数据及模拟接口，不代表生产 API、账号范围或当前报表已验证。日常使用前需在有权限的环境运行只读查询，并与 Bidease 原始报表同日同范围对照。

## 同范围报表对账（只读）

下一步先核对 API 对账户国家汇总的读取是否与 Bidease 源报表一致；这不证明该账户属于 Binance，也不建立 campaign 或 Click URL 映射。先人工核实源报表与 API 的账户、UTC 日期、币种、国家维度及汇总范围完全一致，并确认源报表已完整生成。工具无法独立验证这些事实。

将同日 `bidease-country --json` 输出保存为本地 API JSON，将 Bidease 同范围导出转换为 UTF-8 CSV，表头须含 `country,spend,impressions`；国家以 VN/VNM 和 TR/TUR 表示，每个国家最多一行。CSV 的日期和范围由操作者确认，工具不能从 CSV 验证。不要把报表或凭据提交到共享位置。

```bash
node src/cli.js bidease-country --date 2026-11-08 --json > api.json
node src/cli.js bidease-reconcile --date 2026-11-08 --api api.json --report report.csv --confirm-same-scope
```

输出 JSON，金额用十进制字符串精确比较（忽略尾随零），展示数按整数比较；任一侧无行时该国为 `inconclusive`，不视为零或一致。总体有差异为 `mismatch`，否则有无行则为 `inconclusive`，两国均匹配才为 `match`。退出码 0 表示两国均匹配，2 表示差异或无法判定，1 表示输入/执行错误。匹配仅说明输入数值一致，人工范围确认和源报表真实性仍需另行核实。本工具不请求额外接口、不写入 Spend、不计算客户金额。

目前仍需在有权限环境对真实 API 和源报表进行对账，确认账户及币种，并核实 Bidease 实际支持的 campaign 维度/过滤方式与 Click URL 映射；在此之前不能将账户金额用于特定客户。

## Admin Direct Spend 查询与创建记录统计

`admin-query` 依据 [FeedMob MCP 实现](https://github.com/feed-mob/fm-mcp-servers/blob/f24adfd0be6dbb94ee80b812c6573a1d84c52953/src/feedmob-reporting/src/api.ts) 和 [Admin 查询实现](https://github.com/feed-mob/feedmob_admin/blob/e48d42432cccc956a406d86ed2fc0d539b191f66/app/commands/ai_direct_spend_index_command.rb) 只读 GET 查询，至少指定一个 Client 或 Click URL；多个过滤条件取交集。日期是 **Spend Date**，两端包含，不是 Created At。输出原始 JSON，金额在服务端已转浮点；不得假定等同数据库的原始精度。返回空数组仅表示该筛选条件下没有匹配，不代表没有其他范围数据。接口不提供创建时间、创建人或来源，因此不能用它计算录入人、系统/AI/人工占比，也不能用 Spend Date 范围推断创建期间的完整记录。

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
