# Cursor 任务包 19：预检身份可读与 R&R 缺口定位

状态：两项验收反例已修正，自动验证通过；人工烟测未开始。项目目录为 `/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型`，正式页面为 `formal.html`，用户继续用 `启动排产产能工具.command` 打开。不要假定终端当前目录或端口上的旧页面就是本项目。本包不清除本地草稿、历史路线或数据库。

末轮验证遵循根目录 `README.md`：**先看任务包、代码差异、相关依赖和测试证据，再按需扩大检查范围**，不要无目的全仓扫描。工作树已有用户认可的变动；读清差异后增量修改，勿重置。

## 背景和必须保持的边界

- 当前产品本地路线为压铸 → 机加工 → 装配。第四阶段“同窗工序能力”近期已把内部工序 ID、工站排产键改为当前路线的 `OP序号 + 工序名称`、工站名称；这部分不要回退。
- 另一处“参数检查 / 产能预检”仍直接打印 `local-op-1`、`local-route-a-housing-v1-1--op-a-10`、`OP10` 等内部键，且信息列把内部键写进英文原始消息。用户无法判断哪些风险对应压铸、机加工或装配的哪台工站。图中的两张表分别是预检问题和占用份额风险；下方还有批量/HU 表与顶部 blocker/warning 摘要，需要一起检查一致性。
- 内部 ID、路线版本、原始诊断码仍需留在模型、关联键和可追溯诊断中；**不要改写、删除或迁移历史数据**。业务表格的主显示必须是当前产品、当前路线的可读身份。历史版本不能混入当前路线的风险；路线级问题应标“整条路线”，工序级问题应标具体 `OP序号 + 名称`，没有工站的行不得伪造一个工站。
- 上轮未解决的 OP20 工站（实际业务名称以当前路线为准）“实跑时间未覆盖整个窗口”也需定位。R&R 已跑过不代表已覆盖排班内每分钟；不能把空白自动算成停机，也不能因为节拍样本齐全就虚构实际时间段。

## A. 预检表的人工可读身份（优先）

1. 从 `renderPreflight()` 的两张红框表和批量/HU 表追踪身份来源。用当前 `routingConfig` 的 operation、assignment、station 建立**展示层**映射，显示 `OP10 压铸`、`OP20 机加工`、`机加工01` 等当前语言下的名称；英文界面用同一来源的英文名称。工序序号取当前路线，而不是从 `operationId` 字符串推断。若名称重名，增加清楚的辅助辨识，不靠长内部 ID 充当主标签。未匹配当前路线的诊断不可错配给另一工序，应明确显示“当前路线未找到对应对象”并保留可展开的技术键。
2. 将 `route_master_invalid` 之类的代码改为业务可理解的**问题类型**，将“信息”列改为行动明确的中文/英文短句，例如“当前本地路线尚未发布”“压铸工艺主数据尚未发布”“该工序尚未配置批量/HU规则”。不要对英文 `message` 做字符串替换或正则猜测；优先用现有 `code` 和结构化上下文。注意 `readiness-engine.ts` 把 `routing-master-data-engine.ts` 的具体原因统一折叠为 `route_master_invalid`：必要时窄范围传递原始 `causeCode`/关联对象，以免丢失原因。原始码和 ID 可放在按需展开的“技术详情”，默认不占据主列。
3. 预检的 readiness、份额风险和批量/HU 使用一致的当前路线映射，顶部摘要也不能继续露出长 ID。`-` 必须区分“路线级不适用”和“信息缺失”。切换路线、工序、语言后重新按当前路线渲染，不沿用前一版标签/风险。
4. **核实风险数据来源，不只换标签**：`render()` 传给预检的 `availableMinutesByStation` 目前硬编码 `OP10/OP10B/OP20 = 2880`；`analysis-summary-engine.ts` 的份额评估会用它算“需求占用”。确认红框中的 31.3%、36.5%、208.3% 是否真代表当前路线、当前排班和当前工站。如果是旧样例口径，不得把它标成当前路线的确定性风险；给出“当前排班依据不足/演示口径”的状态与来源，或复用已确认的同路线周账。保持引擎业务公式和正式发布门禁，任何口径调整须另列计算前后对照和测试，不能暗改阈值。

## B. 把 R&R 窗口缺口说清楚

1. 以当前路线中出现 `actual_window_incomplete` 的装配工站为例，查明 `productId + operationId + stationId + routeId`、所选路线观察窗口、标准 SA 排班、R&R 实际时间段。用 `reconcileRnrTimeline()` / `findStandardSaDayGaps()` 列出**具体缺口起止和分钟数**；确认是未录实际时间、另一版本/工站的记录、窗口日期不一致，还是视图计算错误。不要只重复“未覆盖整个窗口”。
2. 在第四阶段该工站行显示如“实际未记录：10:30–11:00（30 分钟）”的简短定位，能跳到第三阶段同一工序/工站的“时间窗口”记录；第三阶段突出同一缺口。多个缺口可合并摘要并展开明细，不能缩到不可读，也不能把“计划空档”和“实际未录”混为一谈。
3. 若实际已覆盖所有已开班分钟但第四阶段仍阻断，修复上下文/窗口状态错误；若确有空白，则保持 Actual 空值，直到操作者按真实生产、停机、休息等状态补录。**禁止自动把空白填成生产或停机**。非排班时间不要求 R&R 补录；实际状态与计划不同本身不构成“未覆盖”。

## 实现入口与验收

- 入口：`src/ui/formal-app.ts` 的 `render()`、`renderPreflight()`、`renderCalibrationRouteStatus()`、`renderRouteWindowCapacityPanel()`；`src/engine/readiness-engine.ts`、`routing-master-data-engine.ts`、`analysis-summary-engine.ts`、`capacity-share-engine.ts`、`rnr-timeline-reconciliation.ts`；`src/ui/route-navigation.ts`。只在确有必要时修改引擎或类型。
- 自动测试：同一产品的两条本地路线含相似/重复工站名、不同工序 ID；切换后业务标签与风险范围正确，旧版不串入。覆盖路线级、工序级、工站级、缺失映射、中文/英文、批量/HU、份额来源不足与有真实周账两类情况。R&R 覆盖“有部分实跑但留中间空白”“总分钟数相同但位置错开”“非排班空白”“完全覆盖但状态不同”“仅节拍样本”“切路线后恢复”。测试不仅断言源码字符串，需核对视图数据或实际渲染行为。
- 人工烟测：用户在当前本地路线查看第四阶段的预检问题、份额风险和同窗工序能力，能直接认出压铸/机加工/装配及每台工站；展开技术详情仍可追溯 ID。点装配缺口进入第三阶段对应工站后，看见具体空白时段；只补该段真实事件再回第四阶段，Actual 状态按真实覆盖变化。切换历史路线再切回，标签与风险不串版。**烟测状态仅由用户确认**。
- 按需运行 `npm run check`、相关定向测试、`npm test`、`npm run build`；网页检查遵守 `~/.codex/skills/safe-html-preview/SKILL.md`。交付记录写明根因、实际修改文件、测试证据、仍未解决项。不要替用户确认烟测，不扩展 APS/WIP 调度，也不重做周/月报表。

## 交付记录

2026-10-21：代码已接入，人工烟测未标通过。

### 根因

预检表直接显示 `ReadinessIssue.code` 和英文 `message`。路线主数据的具体原因在 `readiness-engine.ts` 被折成 `route_master_invalid`，工序序号也没有从当前路线取出。第四阶段份额的可用分钟在 `render()` 里写死为 `OP10/OP10B/OP20 = 2880`。以周需求 1,800、CT 200 秒、每循环 1 件为例：需求分钟 `1,800 × 200 / 60 = 6,000`，旧分母得到 `6,000 / 2,880 = 208.3%`。这不是当前路线的周账。同窗 “实跑时间未覆盖整个窗口” 把计划空档和实际未录合成一句，没有起止时刻；`timeline.complete` 为假时一律记成实际未覆盖，状态不同也会被算进去。

### 口径对照

份额公式和 2% / 5% 阈值未改。变的是分母来源：

- 旧界面：只给 OP10、OP10B、OP20 固定 2,880 分钟。上例为 208.3%。
- 现界面：当前路线全部可排产工站共享同一周周账时，分母改为该周 `bestCaseAvailableMinutes`。同一例子若周账为 7,200 分钟，结果为 83.3%。
- 没有这份周账时，需求占用显示「排班依据不足」，不把 208.3% 或样例资料档里的百分比写成已确认风险。已填写的固定份额仍显示，例如 70% / 30%；没填则写「未设固定份额」。正式发布门禁仍看原预检阻断，不看这张份额表的演示数。

实际未覆盖只在已开班、且该分钟没有实际记录时成立。计划空档单独列出。实际状态与计划不同、非排班空白、只有节拍样本，都不算已经覆盖，也不自动补成生产或停机。

### 修改文件

- `src/engine/preflight-display.ts`：当前路线展示名、问题类型、行动短句、份额依据。
- `src/engine/readiness-engine.ts`、`routing-master-data-engine.ts`：保留原码，并带上 `causeCode` / `subjectId`。
- `src/engine/analysis-summary-engine.ts`、`capacity-share-engine.ts`：标记份额分母是周账、演示输入还是资料档。
- `src/engine/rnr-timeline-reconciliation.ts`、`route-window-capacity.ts`、`src/ui/route-navigation.ts`：合并实际未录和计划空档时段。
- `src/ui/formal-app.ts`、`formal.html`：预检表、摘要、同窗缺口和第三阶段高亮。
- `test/preflight-display.test.mjs`、`test/rnr-timeline-reconciliation.test.mjs`、`test/route-window-capacity.test.mjs`、`test/formal-ui-smoke.test.mjs`。

### 自动验证

`npm run check` 通过。定向测试覆盖两条路线的相似工站名、未匹配对象、中英文、批量/HU、2,880 与周账 7,200 的对照、中间空白、总分钟相同但位置错开、非排班、状态不同。全量 `npm test` 207 项通过。

### 未完成

人工烟测 5.27 仅由用户确认。未改 APS/WIP 排程，也未重做周/月报表。浏览器里的当前本地路线标签和装配缺口跳转留待烟测；自动测试核对的是视图数据和渲染字符串，不是用户浏览器里的草稿。

## Codex 验收复核（2026-10-21，已修正）

自动验证：`npm run check` 通过；`npm test` 的 207 项 Node 测试和 2 项 Python 测试通过。但下述反例不在现有测试中，故任务包暂不验收通过，也不能转为人工烟测通过。

1. `rnr-timeline-reconciliation.ts` 的 `status` 在计划和实际**同时空白**时优先标为 `plannedGap`；`mergeStatusIntervals(rows, "unrecorded")` 因此漏掉同一时段。复现：60 分钟观察窗口，`planned=[]`、`actual=[]`，返回 `unrecordedMinutes=60`、`plannedGapMinutes=60`，但 `unrecordedIntervals=[]`。第四阶段实际缺口会失去起止时刻，第三阶段待补录分钟也可能错误显示为 0。应从 `plannedEvent/actualEvent/offShift` 各自独立生成两种缺口区间，而不是依赖互斥 `status`；保持现有状态分类和分钟统计的兼容性。新增两侧同时空白、单侧空白、跨日、非排班的断言。
2. `formal-app.ts` 的 `currentRouteShareSupply()` 把 `snapshot.days.filter(day => !day.stale)` 的分钟求和，只要剩余分钟大于 0 就标为 `weekLedger`。若某一工作日已过期、其余日尚有效，当前不完整周仍会显示“按当前周账”的确定需求占用和风险。应先要求整周快照可用（参照 `week-minute-ledger.ts` 的 `summary.usable` / `days.every(!stale)`），再取全部有效日的分钟；任何必需工站同周账过期则显示“排班依据不足”，不可悄悄扣掉过期日后重新算百分比。补含单个 stale 日及另一工站完整周账的测试。

修正后先跑两项定向测试，再按 README 的末轮验证规则复查相关差异与测试证据。不要重置用户本地草稿；人工烟测仍待用户确认。

### Codex 修正与复验

- `rnr-timeline-reconciliation.ts` 由计划、实际两条轨道分别提取空白区间；同一分钟两侧均空白时，两份缺口明细都会包含该时段。补引擎测试和路线产能集成测试。
- `preflight-display.ts` 新增完整七日周账校验，`formal-app.ts` 不再以过滤过期日后的余量充当整周分母；份额选择也排除不完整周。补单日过期与另一工站完整周账反例。
- `npm run check` 通过；`npm test` 通过：210 项 Node 测试、2 项 Python 测试。人工烟测仍待用户确认。

### 2026-10-22 三层结论

同窗是否算完只看各工站窗口缺录（待补条件为「-」表示本窗口没有缺录）。本地能否试算来自 `assessLocalTrial.localFlowOpen`。正式发布来自 `validateProductRoutingMasterData`，本地草稿固定 `formalReady = false`。预检红字不再把这三件事收成一句「阻止」。草稿路线、草稿工艺、阶段物料／WIP 按归属逐项列出。没有发布路线、工艺，也没有补造 BOM/WIP。本机数据库未清除。人工烟测 5.28 待用户确认。
