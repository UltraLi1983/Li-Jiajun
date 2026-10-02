# 产品定位

## 一句话

这是一个面向排产系统的产能参数引擎。它把自然日历、产品路径、换型顺序、计划停机、R&R 验证和现场损失转化为排产可用的能力约束。

更直接地说，它不是一个 OEE 计算器，也不是一个 Excel 网页版。它要解决的是：生产过程中的真实时间损失如何进入排产，而不是停留在事后统计或经验判断中。

## 正式版主流程

1. 工艺路线与工站：选定产品，维护每道工序的顺序、工艺含义、可用工站及其分配条件。没有可用工站的工序不能进入后续工站级计算。 同一工序有并行工站时，在正式界面选择当前工站；标准 SA 与 R&R 草稿分别按工站保留。
2. 标准 SA 设定：以工站为单位，在最多 48 小时的具体日历窗口内定义生产、休息、换型、维护和计划停机。时长由起止时钟计算，换型和维护的次数由事件账体现。确认后的标准事件账构成 Best case SA 的基准。向周/月投影时须另行定义重复规则或具体计划；也可仅把该窗口当作参考场景。
3. 现场 R&R 跟踪：沿用同一工站的标准基准，对照记录实际生产段、OK/NOK、节拍抽样、计划动作偏差和异常中断。时间窗口监控侧重 Actual SA；Cycle Check 侧重 Performance。R&R 是验证证据包。
4. 参数校准与产能分析：对照标准与实绩，提出计划动作标准、CT、Performance 和 Quality 的更新建议。经确认或审批后，新的有效参数才能用于正式排产。Most likely SA 需保留异常损失的类别、时间和证据来源，再与 Best case、Actual 一起用于产出模拟和风险解释。

当前正式界面已提供四阶段导航、标准 SA 时间轴、R&R 草稿与工艺预检。计划与实绩事件对账、标准窗口投影、参数审批及完整的 Best case / Most likely 产出模拟仍属后续交付，不应把当前草稿试算当成已批准参数。

## 工艺路线与阶段物料状态边界

正式系统中，工艺路线是产品工程和工艺主数据定义的过程主线。当前模块不负责创造正式工艺过程，只消费已发布的产品工艺路线，并在其基础上完成工站能力、标准 SA、R&R 和产能分析。

工艺路线与 BOM 的关系不是“BOM 用来区分工艺阶段”，而是：

`Product → Routing → Process / Operation → Stage BOM / WIP state`

- Routing 定义产品需要经过哪些工艺阶段及其顺序。
- Operation 是某条产品路线中的工艺阶段实例，例如 OP10 机加工、OP20 装配、GP12、包装或检验。
- Stage BOM 描述某个工艺阶段成立时的输入物料、消耗物料、阶段产出和 WIP 状态。
- 前一道工艺完成后形成的 WIP，才作为下一道工艺阶段的输入。
- BOM 不作为工艺路线的来源，也不负责推导工艺阶段顺序。

当前正式 UI 只能在本地验证模式编辑已有工序，尚不能新增工艺主数据或向路线插入工序。后续为验证本模块完整流程，可以在该模式临时创建工艺条目并将其加入产品路线；正式集成后，本模块只消费上游已发布的工艺过程和路线，本地创建不得成为正式主数据入口。具体任务与验收见 `docs/04-development-roadmap.md` 的“验证模式新增工艺与路线工序”。

## 核心判断

排产失败的根因，很多时候不是排产算法不够先进，而是输入给算法的产能参数不真实。

传统系统常把产能抽象为几个静态值：日产能、标准节拍、OEE、平均 SA 或设备稼动率。这些值适合做粗略评估，但很难支撑复杂生产场景下的自动排产。真实工厂每天的生产内容都不同，不同产品组合、不同换型顺序、不同维护窗口、不同休息安排和不同异常状态，都会让当天的 Best case SA、Most likely SA 和可承诺产能发生变化。

因此，本工具的核心不是计算一个平均 OEE，而是建立一套把生产过程事实转为排产约束的参数层。

## 背景问题

当前企业在排产中普遍会遇到一个断层：

- 工艺和质量部门知道产品路径、节拍、良率和验证要求。
- 生产现场知道换型、停机、休息、维保和异常损失。
- 计划部门需要做日计划、周计划和交付承诺。
- MES 可能记录了实际过程，但这些数据常常滞后进入分析。
- APS/MRP 需要结构化能力参数，但拿到的往往是平均产能或经验产能。

这个断层导致排产系统表面上在算计划，实际上输入的产能并不具备现场解释力。系统可能排出一个看起来可行的计划，但计划没有承载换型损失、异常损失、维护窗口、计划休息和历史异常损失风险。最终结果是：计划频繁被现场打断，现场频繁被计划压迫，数据也无法形成闭环。

## 具体要解决的问题

### 1. 每天的 Best case SA 不一致

自然日历不能被排除在排产之外。只要每天的产品组合、换型次数和计划停机安排不同，每天的 Best case SA 就必然不同。

如果用一个平均 SA 覆盖整周，系统会丢掉最重要的信息：哪一天因为换型多而能力下降，哪一天因为产品组合稳定而能力更高。

### 2. 不能用 R&R 阶段的低 SA 直接污染计划基线

R&R 原则上发生在项目批产前，或进入批量的期初阶段。这个阶段经常包含大量验证动作、计划停机、问题排查和异常确认。因此这一段真实 SA 往往显著低于稳定量产状态。

它必须被记录和分析，但不能直接作为长期计划产能输入。否则会把正常排产能力估得过低，导致投资、产能和交付判断失真。

正确做法是：

- Best case SA 用计划动作生成，作为生产计划和 APS 的基础能力输入。
- Most likely SA 在 Best case SA 基础上叠加已观测异常损失的风险结构，用于模拟和风险判断。
- Actual SA 用 R&R 或量产实绩观察生成，用于回算和复盘。
- 三者对比，用于验证动作损失、异常损失和参数有效性，而不是互相覆盖。

这三套 SA 必须同时存在。Best case SA 解释“按当前排产和标准动作，理论上可承诺多少能力”；Most likely SA 解释“结合已发生的现场异常，较可能落在哪个能力区间”；Actual SA 解释“过去这个班次或这一天真实发生了什么”。

### 3. setup 是被安排的损失，不是普通停机

换型不是随机事件，而是排产顺序的结果。它天然应该进入排产逻辑。

如果 A 到 B 的 setup 是 30 分钟，B 到 A 是 60 分钟，那么排产系统在决定产品顺序时，就必须理解这个序列相关损失。

因此 setup 需要被建成矩阵：

`station + from_product + to_product -> setup_minutes`

未来自动排产应直接使用这个矩阵，而不是在排完计划后再人工补一个换型损失。

### 4. 异常损失的第一优先级是被抓到

异常损失不能简单平均塞回 SA。它需要先被观测、记录、分类和归因。

在早期阶段，系统不应急着预测异常损失，而应先实现：

- 什么时候发生。
- 发生在哪个工站。
- 影响哪个产品或批次。
- 持续多久。
- 原因类别是什么。
- 是否影响主节拍。
- 是否伴随其他动作损失。

后续统计不保留一个笼统的异常停机大类，而是直接拆成可改善的原因类别。缺料、配送、线边等待、转运等待统一归入 logistics waiting，不再单列缺料类别。工艺调整归入 setup；设备非正常归入 equipment failure。其他现场异常按其实际造成的设备、工装、物流等待、质量冻结或人员问题归类。这样现场记录更简单，改善责任也更容易落地。

异常损失一旦进入 Most likely SA，不能只存一个百分比。系统必须保留来源结构：abnormal category、工站、班次、日期、时间颗粒度、影响分钟、数据来源和是否估算。否则 Most likely SA 之后无法解释，也无法回到真实物理场景做改善。

### 5. performance 与 quality 不应被 OEE 黑箱吞掉

OEE 必须拆开。

- SA 解释时间是否可用。
- Performance 解释速度是否达标。
- Quality 解释良品产出是否达标。

节拍抽检、本轮 R&R 的多组 cycle check，本质上是在验证 performance rate。OK/NOK 数量用于验证 quality rate。SA 则需要通过 24H 状态账和计划/实际停机记录来验证。

三个参数在排产中的作用不同，不能只留下一个 OEE。

### 6. 原 Capacity Record 的分段产出反查能力必须保留

原 `Capacity record & calculation` 表格的关键价值，不只是记录一段 R&R 的总产出，而是用“时间段 + 产出数量”计算该段的平均产出节拍，再与总时长平均节拍、cycle check 结果和计划状态账进行对比。

这件事在正式软件中需要作为独立能力保留：

- cycle check 用来证明设备在真实运行时的节拍水平，即 performance rate 是否成立。
- output tracking 用来记录某一时间段内实际产出多少件、OK/NOK 各多少件。
- timeline/state ledger 用来记录这段时间理论上处于 production、setup、break、planned stop 或 abnormal loss 中的哪一种状态。
- 当 cycle check 已经支持节拍正常，但分段产出平均节拍明显变慢时，系统不应首先把问题归为 performance 下降，而应优先怀疑 SA 状态账存在未捕捉时间损失。

因此，R&R 工具需要具备隐藏损失识别能力：如果某个 production block 的理论运行分钟、cycle check 节拍和实际产出无法对齐，系统应生成 suspected abnormal loss，提示现场反查是否存在未记录的等待、停机、复线损失或短暂停顿。该结果可以进入 Actual SA 的估算来源，也可以在确认后归入对应 abnormal category。

界面上，这部分不应压到计划时间轴编辑器里。时间轴负责表达工站状态账和计划/实际事件边界；产出数量、OK/NOK、分段平均节拍、cycle check 对比和隐藏损失推断，应放在 R&R 记录或现场跟踪界面中，并通过 `productionEventId` 与对应的生产时间块关联。这样可以保留原表格的计算能力，同时避免时间轴界面过重。

## 产品方法论

本工具采用自然日历驱动的建模方法。

每个工站每天 24H 被拆成若干状态：

- 排产生产
- setup / changeover
- break
- maintenance
- planned stop
- equipment failure
- tooling / fixture issue
- logistics waiting
- quality hold
- labor / staffing issue

其中：

- setup、break、maintenance、planned stop 构成 Best case SA 的计划损失。
- equipment failure、tooling / fixture issue、logistics waiting、quality hold、labor / staffing issue 构成 Most likely SA 或 Actual SA 相对 Best case SA 的额外损失。
- production 是排产负荷，不是 SA 损失。
- 未排产余量只作为剩余能力计算结果，不作为事件类别记录。

这套状态账使系统可以回答：

> 在当前产品组合、路径、换型顺序、班次、维护和停机安排下，每个工站每天真实可承诺多少生产能力？

## 折中方案

完整真实世界非常复杂，不能一开始就要求系统掌握所有现场变量。因此当前阶段采用一个可落地的折中方案。

### 对 Best case capacity

以当前排产为基础，将自然周内的计划动作转成 Best case SA：

- 根据生产顺序生成 setup。
- 根据班次模板生成 break。
- 根据维护计划生成 maintenance。
- 根据已知停机安排生成 planned stop。
- 根据产品路径、节拍、performance、quality 计算 required minutes。

输出 Best case capacity 与项目需求的差异。

### 对 Run & Rate

R&R 不直接覆盖计划基线，而是一个参数校准周期。它用于验证计划动作的标准耗时、节拍速度、质量结果和异常损失记录能力。

R&R 要校准的 planned activity 标准包括：

- setup / changeover
- break
- maintenance
- planned stop

R&R 要观察但不直接写入排产基线的 abnormal loss 包括：

- equipment failure
- tooling / fixture issue
- logistics waiting
- quality hold
- labor / staffing issue

输出不应只是一个实测产能数字，而应包含：

- Best case capacity：基于计划动作标准的能力。
- Most likely capacity：基于计划动作标准 + 已观测异常损失结构的模拟能力。
- Actual capacity：基于 R&R 或量产实绩回算的能力。
- planned activity 标准参数的建议更新。
- abnormal loss 的来源结构和改善指向。

### 对未来排产

当历史数据足够时，可以把历史排产、历史换型和各类异常损失转为参数，用于未来计划。

其中 planned activity 标准可以进入 Best case SA，作为 APS 的排产约束；abnormal loss 历史只能进入 Most likely SA 或风险参数，除非企业明确决定在计划阶段预留对应缓冲。

这一步不是简单平均，而是按维度回归：

- 工站
- 产品
- 产品族
- from-to 换型对
- 班次
- 工装/模具
- 维护状态
- 质量风险

## R&R 重开机制

系统需要支持重新打开 R&R。每一次重新打开 R&R，都代表计划参数进入新的校准周期，而不是简单追加一次记录。

典型触发条件：

- 新产品导入。
- 工艺路线变化。
- 工装、设备、物流方式或班次结构变化。
- 历史实绩显示 planned activity 标准持续偏离。
- 批量初期需要重新验证 CT、break、maintenance 或 planned stop。

R&R 打开后，允许生成 planned activity 标准的建议更新。建议更新需要保留来源和审批状态，确认后才成为新的排产参数。R&R 中捕捉到的 abnormal loss 可以进入 Most likely SA 的来源结构，但不应自动写入 Best case SA。

## 系统边界

### 做什么

- 建立自然周/自然日历下的工站状态账。
- 生成 Best case SA、Most likely SA 和 Actual SA。
- 把产品路径、节拍、performance、quality 转成工站负荷。
- 把换型顺序转成 setup 损失。
- 输出 Best case capacity、Most likely capacity、Actual capacity、瓶颈和差异。
- 为 APS/MRP 或运营系统提供可解释的能力约束。

### 不做什么

- 不直接替代 MES。
- 不直接替代完整 APS 求解器。
- 不直接替代现场生产监控系统。
- 不把 OEE 作为单一黑箱参数。
- 不把 R&R 验证期的低 SA 直接作为长期稳定量产能力。
- 不在没有数据基础时强行预测异常损失。

## 用户与使用场景

### 计划人员

需要知道在当前排产组合下，每个工站每天是否能承接需求，以及瓶颈在哪里。

### 工艺/制造工程师

需要维护产品路径、节拍、工装、换型矩阵、异常分类和标准参数。

### 生产现场

需要记录计划停机、异常损失和节拍偏差。

### 质量人员

需要把 NOK、返工、质量放行和验证动作对产能的影响结构化。

### 管理层

需要看到计划产能、实际验证产能、投资产能和项目需求之间的差距。

## 关键输出

系统最终应输出以下信息：

- 每个工站每天的 Best case SA。
- 每个工站每天的 Most likely SA，并保留异常损失来源结构。
- 每个工站每天或每班次的 Actual SA。
- 每个订单在每个工站的 required minutes。
- 每个工站的 available minutes。
- setup 损失总量与来源。
- planned stop 与 observed loss 的差异。
- Best case capacity、Most likely capacity 与 Actual capacity 的差异。
- 项目需求是否满足。
- 瓶颈工站与瓶颈日期。
- 对未来排产可用的参数建议。

## 与现有三张表的关系

### Planned System Availability 表

原表的价值不是单纯算一个 SA，而是提供自然周状态账的雏形。它以周一到周六为结构，是为了表达不同自然日的计划内容差异。

未来应扩展为日历事件输入界面。

### Capacity record & calculation 表

原表用于 R&R 记录：节拍、产出、OK/NOK、计划停机、异常损失和过程观察。

未来应作为 Run & Rate observation 的输入来源。

### Capacity calculation 总表

原表用于汇总产能判断：Best case capacity、Most likely / proved capacity、Actual capacity、需求差异和瓶颈。

未来应由计算引擎输出结果，而不是手工在表之间搬运数据。

## 最终角色

在完整运营系统中，本工具位于：

`主数据 / 工艺路线 / 工厂日历 / 排产计划 / MES 实绩 -> 产能参数引擎 -> MRP/APS/排产 -> R&R 验证 -> 参数校准`

它向 APS 输出的是可解释的能力约束，而不是一个平均产能数字。APS 使用 Best case SA 做计划可行性判断，使用 setup matrix 做序列相关损失计算，使用 Most likely SA 做风险模拟或缓冲建议，使用 Actual SA 做实绩回算和参数治理。

在 digital twin 场景下，它还需要承担运行状态解释层的角色：把实绩产出、工站状态、WIP buffer、异常损失和节拍偏差转成 replan signal。APS 仍然负责求解排产方案，本工具负责说明哪些能力约束已经变化、变化原因是什么、影响哪个时间窗口，以及是否值得触发再计划。

它的长期目标是成为排产系统的能力参数层，让排产从“经验产能驱动”升级为“过程事实驱动”。

## 成功标准

第一阶段成功标准：

- 能按自然周录入计划状态。
- 能区分 Best case SA、Most likely SA 和 Actual SA。
- 能按产品路径计算工站负荷。
- 能把换型顺序转成 setup 损失。
- 能输出瓶颈工站和产能差异。

第二阶段成功标准：

- 能接入 R&R 记录。
- 能对比计划停机与实际停机。
- 能从节拍抽检反推 performance 偏差。
- 能从 OK/NOK 反推 quality 偏差。

第三阶段成功标准：

- 能接入历史排产和 MES 数据。
- 能形成换型矩阵和停机风险参数。
- 能为 APS/MRP 输出结构化能力约束。
- 能支持多个排产方案的对比。
