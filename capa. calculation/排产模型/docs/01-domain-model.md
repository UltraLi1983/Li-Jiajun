# 领域模型

## Calendar

自然日历是系统入口。当前按 6 天生产制建模，后续可扩展为任意工厂日历。

字段：

- `date`：自然日期。
- `weekday`：周几。
- `isWorkingDay`：是否生产日。
- `shiftPatternId`：班次模板。
- `stationEvents`：每个工站的事件账。

## ShiftPattern

班制模板定义计划运行窗口。班制不应被固定理解为 1 班、2 班或 3 班对应某个默认小时数；例如 2 班制既可能是 8H + 8H，也可能是 12H + 12H。

字段：

- `shiftPatternId`
- `shifts`

## Shift

单个班次用开始时间和持续时长定义，不单独维护结束时间。

字段：

- `shiftId`
- `name`
- `startHour`
- `durationHours`
- `breakRules`
- `isContinuousOperation`

说明：

- `endHour` 由 `startHour + durationHours` 推导。
- 不设置 `plannedWorkingHours` 手工字段，scheduled minutes 应由班制、排产计划和 unscheduled / not planned 事件共同生成。
- 交接班、开班、复线或切换造成的时间损失不作为独立事件类别；如果存在，应归入 setup / changeover 或对应 planned event。

## StationEvent

工站事件是 SA 的原子输入。

类型：

- `production`：排产生产占用。
- `setup`：换型损失，计划事件。
- `break`：休息。
- `maintenance`：维保。
- `plannedStop`：其他计划停机。
- `equipmentFailure`：设备故障。
- `toolingIssue`：工装、夹具、模具问题。
- `logisticsWaiting`：缺料、配送、线边等待、转运等待等物流等待。
- `qualityHold`：质量冻结、检验等待、异常确认。
- `laborIssue`：人员不到位、技能不足等。

关键边界：

- `setup / break / maintenance / plannedStop` 进入 Best case SA。
- `equipmentFailure / toolingIssue / logisticsWaiting / qualityHold / laborIssue` 进入 Most likely SA 或 Actual SA。
- `production` 用于排产占用与负荷分析，不应被算作 SA 损失。

时间账规则：

- 同一工站在同一时间只能有一个状态事件，不能部分或完全重叠。
- 同一工站的事件之间原则上不保留隐式 gap；如果存在未排产时间，应显式记录为 `unscheduled / not planned`。
- 事件边界用 `startDay + startTime` 和 `endDay + endTime` 表达，允许跨日；`durationMinutes` 由系统推导。
- `production` 事件可引用产品和订单，但不直接存放产出数量、OK/NOK 或分段平均节拍。产出记录应进入 R&R / production record，并通过事件引用挂接。

## Product

产品主数据。正式版在选择 Product 进入产能分析前，必须先定义产品工艺路线与工站能力绑定；不能只凭一个产品名称直接进入 dashboard。

字段：

- `productId`
- `name`
- `projectId`
- `version`
- `family`
- `weeklyDemand`：建议作为主要需求输入，单位为 pcs / week。
- `demandScenario`：`launch` / `rampUp` / `massProduction` / `peak`。
- `routeId`

说明：

- 年产量可以作为外部输入来源，但核心计算应转成具体时间窗口内的需求，优先使用周需求或指定排产窗口需求。
- Product 的主分析对象成立前，必须先完成 Routing、OperationStationAssignment 和关键 capacity parameter。

## ProcessMaster

系统级工艺过程主数据。它定义可被产品路线引用的过程，例如机加工、装配、GP12、包装、检验、返工或外协。正式系统中由产品工程 / 工艺主数据系统维护，当前模块只消费已发布记录。

字段：

- `processId`
- `name`
- `processType`
- `description`
- `sourceSystem`
- `status`
- `version`

## Route

产品工艺路线定义。Route 是产品的过程主线，描述产品需要经过哪些工艺阶段及其顺序；不把 BOM 当作工艺阶段来源，也不描述工站是 existing 还是 new investment。

字段：

- `routeId`
- `productId`
- `version`
- `status`：`draft` / `released` / `obsolete`
- `effectiveFrom`
- `effectiveTo`
- `sourceSystem`
- `operations`

关键规则：

- 只有已发布且处于生效期的 Route 才能进入正式产能分析。
- 当前模块可以在验证模式下创建本地草稿 Route，但不得把它伪装成正式主数据。
- 第一版正式计算按线性路线处理；返工、跳站、循环和条件分支作为后续路线扩展。

## Operation

某条产品路线中的工艺阶段实例。Operation 引用一个 ProcessMaster，但它在具体产品路线中拥有自己的顺序、输入/输出 WIP 和工站分配。

字段：

- `operationId`
- `processId`
- `sequence`
- `name`
- `processType`
- `description`
- `predecessorOperationIds`
- `successorOperationIds`
- `inputStageBomId`
- `outputStageBomId`
- `digitalTwinNodeId`
- `logisticsEdgeIds`
- `bufferRuleId`

说明：

- Operation 定义产品路线中的工艺阶段；该阶段具体使用哪些 station，由 OperationStationAssignment 定义。
- Stage BOM 只描述该阶段成立时的物料状态，不反向决定路线顺序。

字段：

- `operationId`
- `sequence`
- `name`
- `processType`
- `description`
- `predecessorOperationIds`
- `successorOperationIds`
- `digitalTwinNodeId`：后续用于对接 digital twin node。
- `logisticsEdgeIds`：后续用于对接 operation 之间的物流路径、AGV 路径、人工搬运路径或 buffer link。
- `bufferRuleId`：后续用于 WIP / buffer / lead time 保护。

说明：

- Operation 定义工序本身；产品工艺路线中这个 operation 具体使用哪些 station，由 OperationStationAssignment 定义。
- Digital twin 第一版只保留引用 ID，不实现实时运算。后续可通过 node / edge / location ID 对接外部 digital twin，用于计算物理运输、线边缓存、前后工序等待等约束。


## StageBOM / WIPState

Stage BOM 描述某个工艺阶段的物料上下文，不替代产品总 BOM，也不负责定义路线顺序。

字段：

- `stageBomId`
- `productId`
- `routeId`
- `operationId`
- `inputItems`
- `consumedItems`
- `outputItem`
- `wipStateId`
- `effectiveFrom`
- `effectiveTo`
- `sourceSystem`

WIPState 表示产品经过某个工艺阶段后的中间状态，可作为下一工序的输入。第一版产能计算只引用 `operationId`、`stageBomId` 和 `wipStateId` 做追溯，不展开完整物料需求计算。

## StationMaster

工站主数据描述 station 本身的资源状态和物理 / digital twin 引用。station 本身不存在 backup 或 primary 属性；这些角色只在某个 Product + Operation 的 assignment 中成立。

字段：

- `stationId`
- `name`
- `stationGroupId`
- `investmentStatus`：`existing` / `plannedInvestment` / `futureOption`。
- `physicalLocationId`：后续用于对接厂区、车间、线体、工位、坐标或区域。
- `digitalTwinNodeId`：后续用于对接 digital twin node。

## StationGroup

工站组用于描述可共享、并行或备份的一组 station。它是资源组织方式，不替代某个产品工艺路线中的 station assignment。

字段：

- `stationGroupId`
- `name`
- `stationIds`
- `description`

说明：

- Station 本身没有 backup 属性。只有在某个 Product + Operation 的 assignment 中，一个 station 才可能被定义为 backup。
- 技术可承接不等于 planning allowed，具体可排产性由 OperationStationAssignment 的 gate 决定。

## OperationStationAssignment

工站分配关系定义某个产品的某道 operation 使用哪些 station，以及每个 station 的角色、分摊方式、启用条件和 planning gate。

字段：

- `assignmentId`
- `productId`
- `routeId`
- `operationId`
- `stationId`
- `role`：`series` / `primary` / `backup` / `parallel` / `shared`。
- `allocationMode`：`fixedShare` / `forecastCalculated` / `manualScenario`。
- `plannedShare`：routing / planning 假设，不等于 required share。
- `priority`
- `backupCondition`：backup 触发条件，如主工站不可用、产能缺口、客户批准后启用等。
- `customerApprovalRequired`
- `approvalStatus`：`notRequired` / `pending` / `approved` / `rejected`。
- `planningAllowed`：由 capability、审批、工装、质量状态、人员等共同决定。
- `effectiveFrom`
- `effectiveTo`

关键规则：

- 技术可行不等于 planning 可用。若 backup 工站需要客户认可但尚未批准，APS / planning 不得把量排过去；后续可由 QMS / SRM release 状态自动解除 blocker。
- `alternative station` 在本模型中不作为正式术语；应拆解为 `backup` 角色加启用条件。
- new investment 与 existing station 是 station 的资源状态，不是 routing 层面的不同工艺。

## OperationStationParameter

operation-station 组合的产能参数。Performance rate 和 Quality rate 保留，但新产品或投资模拟初始值默认 100%，后续由 R&R 或历史实绩回归目标值。planned activity rule 是可选的标准生成器；如果没有规律，可由排产计划、手工事件或导入计划提供具体 planned event。

字段：

- `operationId`
- `stationId`
- `standardCycleSec`
- `piecesPerCycle`
- `setupRuleId`
- `breakRuleId`
- `maintenanceRuleId`
- `plannedStopRuleId`
- `performanceRate`：默认 1.0。
- `qualityRate`：默认 1.0。
- `parameterSource`：`manual` / `engineeringEstimate` / `runRate` / `historicalActual`。
- `approvalStatus`
- `effectiveFrom`


## PlannedActivityRule

计划动作规则是可选的标准生成器，不是强制结构。系统既可以通过 rule 生成 break / maintenance / planned stop，也可以从排产计划导入具体事件，或手工维护 ad-hoc planned event。

字段：

- `ruleId`
- `stationId`
- `operationId`
- `activityKind`：`setup` / `break` / `maintenance` / `plannedStop`。
- `source`：`rule` / `schedule` / `manual` / `importedPlan`。
- `standardMinutes`
- `isRecurring`
- `recurrencePattern`
- `approvalStatus`
- `effectiveFrom`

说明：

- 每班 break、每周 maintenance、每批 planned stop 可以用 rule 表达。
- 没有规律但被计划安排的停机，应作为具体 planned event 进入时间轴。

## CapacityShareProfile

产能占用不只保存一个 share percentage，而是区分项目请求 / 预留、需求预测和实绩占用三种口径。

字段：

- `profileId`
- `stationId`
- `productId`
- `operationId`
- `analysisMode`：`earlyProject` / `runRateSimulation` / `massProductionForecast` / `actualReview`。
- `requestedCapacityShare`：项目阶段请求 / 预留的占用。
- `requiredCapacityShare`：由 forecast / orders / production plan 和标准工时计算出的需求占用。
- `actualCapacityShare`：实绩回算占用。
- `basisWindow`：周、月或指定排产窗口。
- `basisMinutes`
- `notes`

说明：

- R&R / 项目起步 capacity analysis 阶段可以使用 requested capacity share。
- 批量排产或批量 capacity analysis 阶段不应硬填 share percentage，应由 forecast、订单、routing、CT、setup sequence、quality yield 和 calendar 自动计算 required share。
- 系统应对比 requested vs required vs actual，用于识别 capacity risk。

## ProductionPolicy

生产策略描述插单、混线和批量约束。插单允许与否不是核心，核心是插单需求带来的客观工时损失和下游风险。

字段：

- `policyId`
- `stationId`
- `productId`
- `operationId`
- `expediteDemandSupported`
- `expeditePriorityRule`
- `insertionLossRuleId`
- `mixedProductionAllowed`
- `setupMatrixId`
- `plannerDecisionRequired`

说明：

- Expedite / 插单应表达需求侧必要性和插入后的客观影响，而不是简单 allow / not allow。
- Mixed production 是技术和工艺能力，会影响 changeover 频率、quality risk、skill / tooling constraints。

## BatchHUPolicy

批量策略基于最小工序完成品 HU 的整倍数定义，而不是抽象的“是否批量生产”。

字段：

- `policyId`
- `productId`
- `operationId`
- `huType`：`processHU` / `shippingHU` / `internalTransferHU`。
- `minimumProcessHU`
- `batchMultiple`：必须是 HU 的整数倍。
- `preferredBatchMultiple`
- `maxBatchMultiple`
- `splitAllowed`
- `roundingRule`：`roundUpToFullHU` / `fullHUOnly` / `exceptionApproval`。

## SetupMatrix

换型矩阵必须是序列相关参数。

业务与验收约定：

- 按「工站 + 原产品 → 目标产品」独立维护换型 / 换模耗时。例如 A → B 为 60 分钟、B → C 为 120 分钟，则同一工站 A → B → C 的两次换型合计 180 分钟。
- 反向切换独立定义，不能默认与正向相同；缺失组合提示待维护，不能默认为零。
- 标准 SA 按具体切换组合及次数累计损失。手工录入或按序列生成的换型事件均应关联切换方向及对应标准，同一次切换不得重复计入。
- 长周期投影须保留切换组合、次数或生产序列假设。重复窗口还须考虑末产品到下一窗口首产品的切换，例如重复 A → B → C 时另行确定 C → A 的损失。参考或最坏场景明确标注所用假设。
- R&R 按工站及切换方向记录实际起止时间和耗时，与对应标准比较，形成待审批的更新建议，不直接覆盖标准。

以上为业务要求，不代表矩阵编辑、自动生成及投影功能均已交付。

字段：

- `stationId`
- `fromProductId`
- `toProductId`
- `setupMinutes`
- `validationMinutes`
- `effectiveFrom`
- `source`

## PlannedActivityStandard

计划动作标准参数。它是 APS 和产能计算使用的稳定参数，不等同于某一次 R&R 的原始记录。

字段：

- `standardId`
- `stationId`
- `activityKind`：`setup` / `break` / `maintenance` / `plannedStop`。
- `productId`：适用于单产品动作时填写。
- `fromProductId` / `toProductId`：适用于换型动作。
- `standardMinutes`
- `source`：工程设定、历史回归、R&R 校准等。
- `effectiveFrom`
- `confidenceLevel`
- `approvalStatus`

## RunRateRun

一次 R&R 校准周期。重新打开 R&R 时，应创建新的 `RunRateRun`，而不是覆盖旧结果。

字段：

- `runId`
- `scope`：产品、项目、产线、工站或工艺路线范围。
- `reason`：新产品导入、工艺变更、批量初期验证、异常复盘等。
- `status`：`open` / `calibrating` / `closed`。
- `startedAt`
- `endedAt`
- `openedBy`
- `closedBy`

## RunRateObservation

R&R 验证数据。它记录现场观察事实，不直接等于新的排产参数。

字段：

- `runId`
- `stationId`
- `productId`
- `shiftId`
- `date`
- `observedCycleSamples`
- `okQty`
- `nokQty`
- `plannedActivityObservedMinutesByKind`
- `abnormalLossObservations`
- `evidenceSource`

## OutputRecord

分段产出记录。它继承原 `Capacity record & calculation` 表格中“一段时间 + 一段产出”的能力，用于计算当前段平均产出节拍，并与 cycle check 和状态账对比。

字段：

- `recordId`
- `runId`：来自 R&R 时填写。
- `stationId`
- `productionEventId`：关联到计划或实际时间轴上的 production block。
- `productId`
- `orderId`
- `startAt`
- `endAt`
- `durationMinutes`：由开始和结束时间推导。
- `actualQty`
- `okQty`
- `nokQty`
- `segmentAveragePaceSec`：该段平均产出节拍。
- `totalAveragePaceSec`：同一 R&R 窗口或选定统计范围内的总平均产出节拍。
- `evidenceSource`：MES、人工记录、产量计数器等。

## CycleCheck

节拍抽检记录。它用于判断真实运行时的 performance rate，而不是替代 SA 状态账。

字段：

- `checkId`
- `runId`
- `stationId`
- `productId`
- `productionEventId`
- `sampleStartedAt`
- `sampleEndedAt`
- `sampleCount`
- `cycleSamplesSec`
- `observedCycleSec`
- `standardCycleSec`
- `observedPerformanceRate`
- `confidenceLevel`
- `evidenceSource`

## HiddenLossFinding

隐藏时间损失识别结果。当 cycle check 显示运行节拍正常，但分段产出与状态账无法对齐时，系统生成该对象，提示现场反查未捕捉的 SA 损失。

字段：

- `findingId`
- `runId`
- `stationId`
- `productionEventId`
- `outputRecordId`
- `cycleCheckId`
- `timeWindow`
- `expectedQty`
- `actualQty`
- `missingQty`
- `estimatedHiddenLossMinutes`
- `suspectedCategory`：确认前可为空，确认后归入具体 abnormal category。
- `evidenceRefs`
- `status`：`suspected` / `confirmed` / `rejected`。
- `notes`

## AbnormalLossObservation

异常损失来源结构。Most likely SA 必须引用这类结构，而不是只保存一个最终百分比。

字段：

- `observationId`
- `runId`：来自 R&R 时填写。
- `stationId`
- `date`
- `shiftId`
- `timeBucket`：如 15min、30min、1h、shift、day。
- `category`：`equipmentFailure` / `toolingIssue` / `logisticsWaiting` / `qualityHold` / `laborIssue`。
- `minutes`
- `productId`
- `orderId`
- `evidenceSource`：MES、PLC、Andon、人工记录、产出反推等。
- `isEstimated`
- `physicalScenario`：现场还原后的物理场景。
- `improvementOwner`

## SAView

同一套日历可以生成三种 SA 视角。

字段：

- `view`：`bestCase` / `mostLikely` / `actual`。
- `stationId`
- `date`
- `shiftId`
- `scheduledMinutes`
- `plannedLossMinutes`
- `abnormalLossMinutes`
- `sa`
- `sourceRefs`：planned activity 标准、日历事件、异常损失观察或实绩数据引用。

## ParameterCalibration

R&R 观察转为标准参数的审批对象。

字段：

- `calibrationId`
- `runId`
- `targetStandardId`
- `currentValue`
- `proposedValue`
- `evidenceRefs`
- `impactPreview`：对 Best case / Most likely capacity 的影响。
- `approvalStatus`
- `approvedBy`
- `effectiveFrom`

## CapacityResult

输出给排产或总表的结果。

字段：

- `stationId`
- `bestCaseSA`
- `mostLikelySA`
- `actualSA`
- `bestCaseAvailableMinutes`
- `mostLikelyAvailableMinutes`
- `actualAvailableMinutes`
- `requiredMinutes`
- `capacityGapMinutes`
- `bottleneckRank`
- `status`
- `riskFlags`
