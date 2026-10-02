# 开发路线图

## Phase 1：计算核心固化

目标：把当前 HTML 里的计算逻辑迁移到 `src/engine`，并先固化业务计算口径。计算核心不是从公式开始，而是先确认参与计算的元素、结果输出、适用范围和不参与计算的边界。

### 业务确认清单

1. 计算范围

- 计算对象层级：产品 / 工序 / 工站 / 产线 / 项目。订单或工单只作为需求与记录引用，不作为 dashboard 一级选择对象。
- 时间范围：24H / 48H detailed R&R、自然周、自然月、指定排产窗口。
- 时间颗粒度：分钟级事件账、小时级汇总、班次级汇总、日/周/月级模拟。
- 工厂日历：6 天制、7 天制、自定义停工日、跨天班次。

2. 参与计算的时间元素

- production。
- setup / changeover：序列相关，不作为固定平均损失。
- break。
- maintenance。
- planned stop。
- unscheduled / not planned：未排产、不开机、不来人、不消耗，不进入可用产能。
- abnormal interruption：量产实绩或 R&R 观察到的非计划中断，需保留来源结构。

3. 参与计算的产出与节拍元素

- standard CT。
- pieces / cycle。
- start time / end time，由系统计算 elapsed minutes。
- OK qty / NOK qty，由系统计算 actual qty 与 quality rate。
- observed CT，由 elapsed minutes / actual qty 计算。
- expected qty 与 hidden loss，用于定位未被事件账捕捉的损失。

4. 计算结果

- Best case SA：只包含已批准的 planned activity 标准损失。
- Most likely SA：后续可选的风险预测视角，不作为当前 Best/Actual SA 交付或现场根因调查的前置条件。
- Actual SA：基于实绩事件账回算。
- Performance rate：由 standard CT 与 observed / planned CT 关系得出。
- Quality rate：由 OK / NOK 得出。
- Capacity result：按 SA、Performance、Quality 分拆后再合成，不只保存 OEE。
- Bottleneck / gap / utilization / risk flags。

5. 不应混入计算的内容

- 不把未排产时间当作 open capacity。
- 不把 R&R 中偶发 abnormal 直接覆盖长期 planned baseline。
- 不只存一个 OEE 百分比。
- 不把 setup 简化为固定平均损失。

### 当前非 UI 核心进度

已落地并通过自动烟测：

- Product readiness gate：route、operation、assignment、parameter、backup blocker。
- Approval gate release：customer approval pending / approved 对 planningAllowed 的影响。
- Capacity share：required、requested、actual 三套口径和风险比较。
- Batch HU policy：完整 HU 倍数、非整倍数例外审批、低于最小 HU。
- Demand normalization：weekly demand、annual demand 折算、manual scenario、短周期订单兜底。
- Planned activity rule expansion：approved recurring rule 展开，未批准 rule 不进入计算。
- Timeline / SA / setup / production segment：重叠、gap、unscheduled、planned SA、real SA、sequence setup、observed CT、hidden loss。
- Capacity analysis preflight：汇总 readiness、capacity result、share risk、batch HU，并生成 UI/API 可直接消费的 blockers / warnings。
- Routing configuration view：整理 Product / Routing / Station Assignment / Station / Parameter / Gate 状态，作为正式 UI 的前置数据接口。
- Formal UI：`formal.html` 与 `src/ui/formal-app.ts` 已进入正式版启动流程，首屏从 Product / Route / Operation / Station Assignment 开始，不再直接进入 Capacity Analysis。
- Station Assignment configuration：已形成专项页，展示 primary / parallel / backup、allocation、planning gate、customer approval gate 和 blocker。
- Parameter Check / Preflight：已形成正式检查页，展示 readiness、blockers、warnings、capacity share、batch HU check，并在 hard blocker 存在时阻止进入 capacity analysis。
- Product / Route / Operation mock edit：已支持 local in-memory 编辑态，不写回文件，用于验证前置配置体验；该能力不代表正式系统允许在本模块创建主数据
- 当前第一版路线边界：已发布的线性 Routing + Operation → Stage BOM / WIP 引用；返工、跳站、循环和条件分支后续扩展
- Formal UI smoke test：已新增 `test/formal-ui-smoke.test.mjs`，通过 Node 内置 HTTP server / fetch 检查正式版页面和编译产物可访问。
- Formal UI 四阶段主流程：工艺路线与工站 → 标准 SA 设定 → 现场 R&R 跟踪 → 参数校准与产能分析。当前已接通四阶段导航、工站标准时间轴在 R&R 中的参照、草稿参数对比及原有预检。

### 工程交付

- domain types
- product / routing / capability group / station assignment rule
- operation-station capacity parameter
- capacity share profile：allowed / required / actual
- batch HU policy
- sample data
- timeline event validation
- calendar SA calculation
- production segment calculation
- setup loss calculation
- required minutes calculation
- station capacity result
- 5 到 10 个关键测试场景

- Cursor handoff：`docs/08-cursor-task-packages.md` 已拆分正式版后续任务包；任务包 A / C / D / B / E 已完成，本轮 F 用于同步文档。

## Phase 2：标准 SA 设定与时间窗口投影

目标：在产品工艺路线与工站分配之后，建立可核对的工站标准状态账。先记录 24H/48H 内具体起止时钟及换型、维护次数；之后按明确的重复规则或计划投影至更长周期，也可将窗口仅作为参考或极限场景。

交付：

- Product definition：周需求、版本、项目、需求场景（当前正式版已支持 mock edit）
- Routing definition：正式模式从已发布 ProcessMaster 中选择工艺过程，维护 operation sequence、工艺含义、Route version / effective period；当前 UI 只支持展示和已有工序的验证模式 mock edit，尚不能新增工艺或工序
- Stage BOM / WIP context：为每个 operation 记录阶段输入、消耗、输出和 WIP 状态引用；第一版只做追溯，不展开完整 BOM 计算
- 正式版默认只选择上游主数据路线；本地新增工艺和工序仅作为后续验证模式能力，不进入正式主数据
- Capability group：定义可承接同一 operation 的工站组
- Station assignment rule：series / primary / backup、parallel、backup 前置条件、客户认可 gate（当前正式版已形成专项页）
- Operation-station parameter：CT、pieces/cycle、P rate / Q rate 默认 100%
- Capacity share profile：项目阶段 allowed share，量产阶段由 forecast 计算 required share
- Batch HU policy：基于最小工序完成品 HU 的整倍数
- 6 天/7 天/自定义工厂日历切换
- 日历事件批量复制
- 按排产顺序自动生成 setup 事件
- 按工站及产品切换方向维护换型矩阵；验收 A → B 为 60 分钟、B → C 为 120 分钟时两次换型累计 180 分钟，反向组合独立维护，缺失组合不默认零，手工与自动事件不得重复计入。
- 标准窗口投影须保留切换组合 / 次数或序列假设，并考虑跨窗口末产品到首产品的换型损失；具体口径见领域模型 SetupMatrix。
- 按班次模板生成 break / maintenance
- Best case / Actual SA 分层显示；Most likely 留作后续可选扩展
- 计划时间轴编辑器：使用具体 Start time / End time 和跨日边界，系统自动计算 duration
- 同一工站事件防重叠校验，隐式 gap 提示使用者显式补为 unscheduled / not planned
- 时间轴支持全屏查看；Planned SA 时间轴只承载计划状态账，不承载产出明细录入

### 验证模式新增工艺与路线工序（待开发）

目的：在上游产品工程 / 工艺主数据尚未接入时，允许用一个全新产品验证“工艺选择 → 工站分配 → 标准 SA → R&R → 产能预检”的完整流程。这里有两个不同动作：新增可复用的工艺条目（ProcessMaster），以及从工艺清单选择条目并加入某产品路线（Operation）。不能只修改已有 Operation 的名称来冒充新增工艺。

实施任务：

1. 在明确标识的本地验证模式中维护工艺清单：新增 `processId`、名称、工艺类型、说明和版本；校验 ID 唯一、必填字段及来源，标记为 `local-validation`。已存在工艺可直接选择，不要求重复创建。
2. 从清单选择工艺，向当前产品路线新增 Operation，生成独立的 `operationId`，维护工序顺序和工艺含义，并绑定 `processId`；排序或插入后更新前后序关系。工序是产品路线实例，不能与可复用工艺主数据混为一条记录。
3. 为新增工序继续选择现有或模拟新投资工站，维护主/并行/备用角色、备用启用条件、客户批准门禁和 operation-station 参数。缺少工站、关键参数或必需的阶段物料/WIP 引用时，预检给出可理解的阻止项。
4. 验证模式数据只存在本地测试场景，支持重置，不覆盖样例或上游主数据；页面持续标明其测试来源。需明确测试条目的“可用于本地流程验证”与正式 `released/effective` 门禁的区别，不得因本地验证而放行正式排产或把草稿静默当作已发布主数据。

验收：选择已有测试产品，在其验证路线新增一条工艺并加入工序后，能完成工站分配并走到该工站的标准 SA、R&R 和产能预检；重复 ID、缺少关联或未满足正式发布条件时有明确提示；重置后测试数据消失，已有正式/样例数据不被改写。自动测试覆盖新增、插入顺序、引用一致性和正式门禁；人工烟测覆盖上述端到端路径。全新产品的创建另作产品主数据任务，不偷渡进本任务。

排期：这是 Phase 2 前置配置的补充任务，不表示当前已完成，也不阻塞已有 Product A 的 R3-2 至 R3-5 开发；在用“全新产品”做正式版端到端验收前必须完成。

### 标准窗口投影的实施任务

1. 先冻结一个经过校验的工站标准窗口：起止时钟、事件类型、产品切换序列、版本和适用工站。空档必须显式标记为未排产；不完整窗口不得直接投影。
2. 选择投影用途：仅作当前 24H/48H 参考场景，或按明确的班制、工作日及重复规则展开到指定日期范围。不能只用 SA 百分比乘以周/月分钟数。
3. 对每个展开窗口生成具体时间事件，重新计算跨窗口换型、停工日、维护及休息；若缺少切换方向的标准耗时，则给出阻止项，不能默认为零。
4. 保留投影规则、来源窗口版本和每条生成事件的追溯信息。输出按工站和日期的 Best case 可用分钟，供后续三视角产能计算消费。

验收：参考模式不冒充周/月产能；重复展开后每日事件不重叠、不越界；跨窗口切换的损失仅计算一次；变更源窗口后旧投影不再被误认为有效。

## Phase 3：Run & Rate 参数校准闭环

目标：以选定工站的标准 SA 状态账作为参照，记录真实生产段、计划动作偏差和异常中断，让 R&R 成为可追溯的校准证据包。

### 当前实施顺序（2026-09-25 确认）

1. **R1 实际事件账与双轨时间轴**：R&R 按选定产品 / 工序 / 工站新建独立实际时间段，不复制或改写标准 SA。实际段使用明确日期和时钟，默认下一段起点等于上一段终点；允许编辑、删除并校验重叠、空档与观察窗口。生产段录入 OK / NOK、每循环件数及证据，休息、换型、维护和异常段录入真实原因。计划与实际轨道使用同一时间刻度，显示时间开动率差异；未覆盖的时间标为待补录，不当作生产或停机。
2. **R2 速度损失归因**：未完成节拍校验时，用同产品、工序、工站、每循环件数下最快且有效的生产段平均节拍作为观察参考；显式停机只计一次，其余慢速段的产出缺口计入推断时间开动率损失。完成节拍校验后使用经确认的标准节拍。可接受的慢速偏差可不设置；不设置时全部超额时间计入推断时间损失（方式 B）；设置时只能为 0–5%，容差内计入性能率／速度达成率损失、容差外计入推断时间损失（方式 A）。快于经确认标准节拍时停止自动归因，提示复核数量、节拍及每循环件数。
3. **R3 证据与校准**：逐段对比计划与实际时间，保留显式/推断标记，形成标准 SA、CT、P、Q 的可选建议，不自动覆盖标准基准。未知 root cause 不阻止 Best/Actual SA；只有时间空档、重叠或关键数量/节拍错误影响结果完整性。

当前代码进度：路线主数据校验引擎已接入路线配置和产能预检；R1 已接入独立实际事件账、编辑/删除、同轴计划/实际轨道和覆盖检查；R2 已实现并接入节拍归因核心及容差输入；R3-1 逐段计划/实际对账和 R3-2 异常证据结构已通过人工烟测；R3-3 已接入参数建议草稿、本地确认、生效日期及独立的 CT/P/Q 本地发布动作，待浏览器人工烟测。第四阶段已厘清 R&R 建议边界：休息超时、维保、计划停机等动作差异只进入 Actual SA 和待纠偏，不作为标准时间参数发布；换型总分钟只作诊断，后续标准规则必须按单次切换方向定义。单工站 Best/Actual 预览及 R3-4 的同窗跨工站本地试算已接入；正式跨周期产能、R3-5、标准窗口向周/月投影仍未交付。所有 R&R 输入、确认、发布版本及本窗口需求只存在浏览器内存中，刷新后不会持久化；只有明确发布且到达生效日的 CT/P/Q 版本参与当前会话的计划份额与试算，尚未进入正式产能或上游主数据。

本轮暂不建模人工疲劳随班次变化的节拍曲线；APS、自动采集和复杂审批流仍属后续阶段。

交付：

- R&R open / closed 状态管理
- R&R 模式选择：时间窗口监控用于 real / actual SA 与 abnormal loss structure；Cycle Check 用于 observed CT / performance rate / cycle stability
- 节拍样本录入
- 分段产出记录：时间段、actual qty、OK/NOK、segment average pace
- cycle check 与分段产出对比，用于区分 performance 问题和 SA 漏抓问题
- hidden loss finding：根据产出缺口和可信 cycle check 估算未捕捉时间损失
- planned activity 实测记录
- 按工站及产品切换方向对照换型标准与实测耗时，形成待审批的校准建议。
- abnormal loss 来源可选记录；根因调查不在本工具的计算门禁内
- planned standard vs observed loss 对比
- 参数建议更新与审批状态
- Best case / Actual SA 对比；Most likely 为后续可选扩展

## Phase 3.5：参数校准与产能模拟

目标：用标准动作安排计算 Best case SA，用完整现场记录计算 Actual SA，并把 R&R 观察转为可选的参数建议。原因待查不阻止 SA 结果。

交付：

- 标准计划事件与实际事件逐段对账，解释 SA 差异
- 明确建议更新对象、来源证据、审批状态和生效时间；未经确认不覆盖标准基准
- 将有效 SA、CT、Performance、Quality、工站分配和需求组合进入 Best/Actual 产出模拟
- 当前四阶段界面展示单工站 Best/Actual 草稿对比、同窗跨工站/工序本地试算及原有预检；长周期正式产能闭环尚未实现

### 本模块的后续工程顺序

1. **R3-1 计划/实际时间对账**：按选定产品、工序、工站和同一观察窗口合并所有事件边界，逐段输出计划类型、实际类型、起止时钟、差异、事件引用。实际空白只能显示待补录；同轨重叠和越界要阻止结果。显式异常与生产段内推断速度损失分别记账，不能重复扣除。
2. **R3-2 异常证据结构（原版已通过人工烟测，非阻断口径待复测）**：为实际异常保存类别、时间、工站、来源和是否估算；推断损失作为待查提示，但按节拍容差规则进入 Actual SA。缺少来源或 root cause 不阻止计算；待补录、重叠或快于已校验 CT 的生产段仍影响结果完整性。
3. **R3-3 参数建议（代码已完成，待人工烟测）**：第四阶段分为两类输出。休息超时、维保、计划停机等动作差异只进入 Actual SA 和“待纠偏 / 诊断”，不得进入标准时间参数确认或发布；换型总分钟仅用于诊断当前窗口，未来规则应按单次切换方向定义，不能用本窗口总分钟覆盖换型标准。CT、P、Q 继续使用“本地确认 → 发布 CT/P/Q 到计划参数”的独立流程：记录当前值、建议值、来源事件、状态和生效日期，发布前可取消确认；取消已变化的 CT 时连带取消其配对 P。发布前弹出最终确认，确认后才在当前会话追加带生效日期、旧版本 ID 与证据引用的新版本；上方建议表保留已发布快照和版本标记，下方版本清单追溯历史。计划份额与预检只读取当前生效 CT/P/Q 版本；已发布版本不提供取消确认或回滚。修改 CT 必须同时确认按新 CT 复核的 P，避免重复计入速度损失。标准 SA 时间轴不因 CT/P/Q 发布改变。当前发布仍是本地验证，刷新即失，不等于上游主数据审批或正式跨工站产能。
4. **R3-4 Best/Actual 正式产能**：Best case 用标准窗口，Actual 用完整实际记录和既定节拍容差规则回算；按工站与工序组合 CT、件/循环、P、Q、需求及工站分配得到可用分钟、良品能力和缺口。原因待查只作提示，不因未做线下根因调查而阻止结果。Most likely 风险预测是后续可选扩展，不属于本轮验收。

   已交付首段：在选定的最多 48 小时窗口内，按工站占用上限算计划良品能力，完整实跑记录才显示 OK；并行工站按工序相加。路线级瓶颈和窗口需求余量只有在确认各工序件数可按 1:1 换算为成品件数时才显示；需求必须显式输入本窗口件数，不从周需求推算。其他阶段件数换算、跨周期投影与正式排产输出仍待实现。
5. **R3-5 可恢复的证据包**：给一次 R&R 独立标识和状态，支持保存、重新打开与导出；保留输入快照、计算口径版本和校准决定。未实现持久化前界面必须持续标明“当前会话草稿”。

   已交付首段：在校准界面生成 R&R 会话草稿证据包快照，包含计划事件、实际事件、cycle samples、速度归因、证据结构和参数建议，并以只读 JSON 展示，作为后续保存、重新打开与导出的结构基础。持久化、重新打开和正式导出仍待实现。

R3-1 至 R3-5 属于当前 On-site R&R 参数校准产品范围。Phase 4/4.5 是外部系统接入，Phase 5 是 APS 增强，不作为这轮正式版完成的前提。

### 临时 R&R 验证样本（正式启用前必须移除）

- 已加入 `rnr-validation-op10-24h-v1`，仅供 Product A / OP10 / OP10 工站的开发和烟测一键加载。它是固定的 24 小时计划与实跑记录，不是真实现场证据；加载会替换当前工站的会话记录，并在有实际记录时先征求确认。
- 第四阶段可基于完整记录显示单工站 Best case 与 Actual 草稿预览：Best case 用标准生产分钟、标准 CT 和 Planned Q 拆出理论总产出、理论 OK/NOK；Actual 用实际生产分钟、现场 OK/NOK 回算 Actual CT 与 Actual Q。差额按时间、性能率和 NOK 拆分。额外休息、显式异常和推断时间损失按 Actual SA 口径扣减生产可用时间，原因可待查且不在性能率或良率中重复扣减。该预览不包含需求份额和多工站分配，不等于 R3-4 的正式产能输出。
- **正式启用门禁**：R3-1 至 R3-5 与相关人工验收完成后，删除验证样本模块、加载按钮、样本专属状态与相关文案；将固定数字断言替换为通用计算测试，确认发布包中没有该验证样本入口或伪现场数据。移除前不得将此工具标记为正式生产可用。

## Phase 4：排产系统接口

目标：让该工具成为运营系统中的参数服务。

交付：

- 输入 API：需求预测 / 工单引用、产品路径、能力组、工站分配规则、工站日历、换型矩阵
- 输入 API：R&R observation、abnormal loss observation、历史实绩
- 输出 API：Best case 可用分钟、Most likely 可用分钟、Actual 回算结果
- 输出 API：瓶颈、风险、产能缺口、参数建议更新
- 支持导入历史排产和历史换型损失
- 支持 APS 请求指定排产窗口、时间颗粒度和 SA 视角

## Phase 4.5：实绩数据源治理

目标：让异常中断在量产阶段可以稳定生成 Actual SA，并反哺 Most likely SA。

交付：

- MES / PLC / Andon 自动事件接入优先级
- 人工事件记录模板
- 产出与节拍缺口反推逻辑
- estimated flag 与证据等级
- abnormal category 改善责任字段

## Phase 5：自动排产增强

目标：从评价工具升级为排产约束引擎。

交付：

- 换型最小化排序
- 瓶颈工站负荷平衡
- 交期优先级
- 模拟多个排产方案
- 输出方案 SA、setup 损失、交付风险
