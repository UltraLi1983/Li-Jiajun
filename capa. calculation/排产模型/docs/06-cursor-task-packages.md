# Cursor Task Packages - On-site R&R 参数校准正式版

> 当前执行顺序以 `docs/04-development-roadmap.md` 的“Phase 3 / 当前实施顺序（2026-09-25 确认）”为准。下方 P1–P3 是早期任务背景，不应覆盖新确定的 R1 实际事件账与双轨时间轴、R2 速度损失归因、R3 证据校准口径。人工疲劳曲线暂缓。

## 当前边界

本项目已经从 demo 进入正式版开发。后续不要继续扩展旧 demo 页面，除非明确说明。

正式版入口：`formal.html`

核心文件：

- `src/ui/formal-app.ts`
- `src/engine/*`
- `src/domain/types.ts`
- `src/sample-data/*`
- `test/*.test.mjs`

每个任务完成后必须运行：

- `npm run check`
- `npm test`
- `npm run build`

浏览器入口：`http://127.0.0.1:8785/formal.html`

---

## 正式版四阶段主流程

工艺路线与工站 → 标准 SA 设定 → 现场 R&R 跟踪 → 参数校准与产能分析。各阶段可在同一正式版页面切换，但数据来源与审批状态必须可追溯。

### 1. 工艺路线与工站

正式模式先选择产品对应的已发布 Route，再从 ProcessMaster 选择该路线中的 Operation。路线定义工艺阶段顺序，Stage BOM / WIP 只提供该阶段的输入、消耗、输出和中间状态追溯，不反向定义路线。

每道工序绑定具体工站，维护 primary / parallel / backup、客户门禁和工站参数。无可用工站的工序不能进入工站级 SA 与 R&R 计算。

当前页面的本地新建工序仅用于验证模式；正式接入产品工程 / BOM / 工艺主数据后，应改为只读选择上游已发布对象。第一版按线性路线执行，返工、跳站、循环和条件分支另行开发。

### 2. Standard SA / Calendar Baseline

用途：定义计划状态和 Best case SA。

只允许录入计划层面的时间段：

- production
- setup / changeover
- break
- maintenance
- planned stop
- unscheduled / not planned

注意：`unscheduled / not planned` 表示未排产或不开机，不等于非计划停机；设备故障、质量隔离、物流等待等异常不进入 Planned SA 基准。

### 3. R&R / Reality Tracking

用途：记录真实发生的生产过程，并形成 real / actual SA 与 Most likely SA 的来源结构。

这里才允许录入或拆分：

- production segment
- OK / NOK / actual qty
- observed CT
- hidden loss
- unplanned stop
  - equipment failure
  - tooling issue
  - logistics waiting
  - quality hold
  - labor issue

如果真实追踪发现一整段计划 production 中发生了停机，界面应允许拆分为 `production + stop + production`。

### 4. Calibration & Capacity Analysis

用途：先对标准 SA 与现场观察生成待确认的参数建议，再消费已批准的有效参数，输出业务可读的产能结论。

Capacity Analysis 不再承担过程录入，只读取：

- Planned SA / best case available minutes
- R&R 校准后的 most likely SA 来源结构
- calibrated CT / P rate / Q rate
- routing / station assignment / share 策略

`进入产能分析` 只属于第四阶段，不应作为 Planned SA 或 R&R 录入流程的下一步按钮。

---

## P1 - 语言与业务文案收口

### 目标

正式版中文界面不能残留面向业务用户的英文句子。英文可以保留在系统代码、ID、operationId、stationId、digitalTwinNodeId 中。

### 范围

检查以下页面：

- 产品与工艺路线
- 工站分配
- 计划SA输入 / 日历设置
- 参数检查 / 产能预检
- R&R记录相关页面

### 要求

1. 中文界面中，业务解释、warning、blocker、risk message、batch/HU message 必须中文化。
2. 以下内容可以保留英文或代码形式：
   - `op-a-10`
   - `OP10`
   - `assignmentId`
   - `backup_blocked`
   - `batch_hu_policy_missing`
   - `dt-node-*`
3. 英文界面不能出现中文业务文案，除非是语言切换器本身按当前约定反向显示。
4. 新增或补充 `formatKnownText()` 或同类格式化函数，不要把翻译逻辑散落到各个 render 里。

### 验收

- 中文界面所有给业务人员看的句子为中文。
- 英文界面所有给业务人员看的句子为英文。
- `npm run check`、`npm test`、`npm run build` 通过。

---

## P2 - Planned SA Input / Calendar Setup 时间输入重构

### 目标

计划SA输入是后续 Best case capacity 和 Most likely capacity 的基础。它必须支持以自然时间轴录入计划活动，而不是只录入抽象分钟数。

### 业务规则

1. 时间窗口最大不超过 48H。
2. 时间窗口允许更短，时间输入颗粒度为分钟级；界面可以按小时做刻度或汇总展示。
3. 每个计划活动必须有明确的：
   - start day / date
   - start time
   - end day / date
   - end time
4. duration 由系统计算，不允许作为主输入。
5. 事件类型至少包括：
   - production
   - setup / changeover
   - break
   - maintenance
   - planned stop
   - unscheduled / not planned
6. 同一工站同一时间段不允许重叠。
7. 如果两个事件之间存在 gap，系统必须允许一键填充为 `unscheduled / not planned`。
8. `unscheduled / not planned` 不进入可用产能，不应被理解为 open capacity。

### UI 要求

1. 显示周历/日历式时间轴。
2. 每个事件段显示在对应工站行上。
3. 修改事件 start/end 后，汇总卡片即时刷新：
   - planned operation min
   - planned stop min
   - break min
   - setup/changeover min
   - best case SA with breaks
   - best case SA without breaks
4. 事件编辑器使用具体时钟输入，而不是起点/末点分钟数。

### 验收

- 能新增、修改、删除计划事件。
- 同工站重叠事件会被阻止或显示明确错误。
- gap 可一键填为未排产。
- SA 汇总会随时间段变化重新计算。
- 通过 check/test/build。

---

## P3 - R&R 监控模式拆分：时间窗口 vs Cycle Check

### 目标

R&R 不是单一模式。系统需要支持两类监控入口，它们输出不同结论。

### 模式 A：时间窗口监控

用于监控 SA。

规则：

- 时间轴总长度最小 1H，最大 48H。
- 用户在窗口内记录实际生产、计划活动、非计划中断。
- 输出关注：
  - planned SA
  - real / actual SA
  - abnormal loss source structure
  - most likely SA 的来源结构

### 模式 B：Cycle Check

用于监控 Performance Rate。

规则：

- 不以 1H 时间轴为主。
- 以标准工序 cycle count 为目标，例如 20 组 cycle check。
- 达到 cycle 样本数量即可输出结果。
- 输出关注：
  - observed CT
  - standard CT
  - performance rate
  - cycle stability

### UI 要求

1. R&R 创建或进入时先选择监控模式。
2. 两个模式不要混成一个表单。
3. 时间窗口模式进入时间轴记录界面。
4. Cycle Check 模式进入节拍样本记录界面。

### 验收

- 选择时间窗口模式时，显示 1H-48H 时间范围配置。
- 选择 Cycle Check 模式时，显示 cycle sample 输入与目标样本数。
- 两种模式输出卡片不同。
- 通过 check/test/build。

---

## P4 - Production Segment 记录与时间轴联动

### 目标

把原 Excel `Capacity record & calculation` 的核心功能搬入正式版：一段时间 + 一段产出信息，系统计算段平均节拍，并与总平均节拍/标准CT对比。

### 手工输入

- linked production block
- start time
- end time
- OK qty
- NOK qty
- standard CT sec
- order / reference 可选
- evidence source 可选

### 系统计算

- elapsed min
- actual qty = OK + NOK
- observed CT sec = elapsed sec / actual qty * pieces per cycle
- expected qty
- missing qty
- estimated hidden loss min
- segment avg pace
- performance rate

### UI 要求

1. 生产 segment 记录必须和时间轴联动。
2. overview 时间轴上，连续 production segment 可合并为一条绿色长条。
3. detail 时间轴上，保留分段 segment，可点击查看单段产出、节拍、隐藏损失。
4. 手工输入字段保持输入槽样式；计算结果用大贴砖展示。

### 验收

- 修改 OK/NOK 或 start/end 后，计算贴砖即时刷新。
- 点击不同 segment 可切换单段详情。
- observed CT 不再手工输入。
- actual qty 不再手工输入。
- recorded production min 不再手工输入。
- 通过 check/test/build。

---

## P5 - R&R 参数校准建议包

### 目标

R&R 结果不能直接覆盖 baseline。系统需要生成“参数更新建议”，等待后续审批或人工确认。

### 建议对象

- standard CT
- performance rate
- quality rate
- planned activity duration
  - setup/changeover
  - break
  - maintenance
  - planned stop
- most likely SA abnormal source structure

### 规则

1. planned baseline 不被自动覆盖。
2. 每条建议必须保留来源：
   - product
   - operation
   - station
   - R&R run id
   - time window / cycle check batch
   - source category
   - before value
   - suggested value
   - evidence note
3. most likely SA 不能只存一个百分比，必须保留 abnormal category、shift/station/time granularity 等来源结构。

### 验收

- R&R 完成后能生成建议清单。
- 建议状态至少包括：draft / proposed / approved / rejected / effective。
- 未 approved/effective 的参数不能进入正式排产基线。
- 通过 check/test/build。

---

## P6 - Capacity Analysis 输出收口

### 目标

基于 Product + Routing + Station Assignment + Planned SA + R&R 校准参数，输出业务可读的产能结论。

### 输出至少包括

- best case capacity
- most likely capacity
- planned SA
- most likely SA
- standard CT / calibrated CT
- P rate / Q rate
- required capacity share
- capacity ceiling
- blocker / warning

### 规则

1. 未设固定占用比例时，capacity ceiling 默认为 100%。
2. 设定固定预留比例时，capacity ceiling 等于该比例，例如 70%。
3. 当需求突破上限时，给出 blocker/warning，并提示需要：
   - 增加工站
   - 调整 routing/station assignment
   - 改变 share 策略
   - 重新评估投资
4. Product 必须完成 routing 后才能进入 capacity analysis。

### 验收

- Product A 能显示可进入产能分析或明确 warning。
- Product B 若缺少 routing/station/parameter，应显示业务可读 blocker。
- 中文提示非开发人员能理解。
- 通过 check/test/build。
