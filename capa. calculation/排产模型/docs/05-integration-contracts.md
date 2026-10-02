# 系统集成接口草案

## 设计原则

接口不只传一个产能百分比。所有进入排产、模拟或复盘的 SA 都需要保留计算视角和来源。

- `bestCase`：供 APS / MRP 做基础排产能力判断。
- `mostLikely`：供模拟、风险提示和缓冲建议使用。
- `actual`：供 R&R 或量产实绩回算使用。

Most likely SA 必须保留 abnormal loss 来源结构，否则无法解释，也无法改善。


## APS / Digital Twin 对接定位

APS 是自动排产求解器，本工具不是替代 APS，而是为 APS 提供可解释、可更新、可回溯的能力约束和运行状态解释。

在传统模式下，前后工序衔接主要依赖 WIP、固定提前期或安全库存。它们本质上都是为了吸收不确定性：前序停机、前序节拍变慢、换型损失扩大或异常等待，不能立刻导致后序断流。

在数据化 digital twin 场景下，系统可以把这种吸收机制做得更细。它不只看库存数量或静态 lead time，而是持续理解：

- 当前工站能力是否偏离 Best case。
- WIP buffer 正在被消耗还是被补充。
- 后续工序多久后会受到影响。
- 当前异常是否只是短时波动，还是会影响未来几个时间桶。
- 是否需要触发 replan，以及 replan 应该影响哪个范围。

因此接口目标不是传递一个平均产能，而是支持 APS 的四类动作：

- 计划前：提供基础排产约束。
- 计划中：提供风险画像和方案评分。
- 运行中：接收实绩状态和 digital twin 状态。
- 异常后：输出 replan signal。

## 接口分层

### 1. PlanningConstraint API

用于 APS 生成初始排产计划。默认使用 `bestCase` 视角。

输入：

- 工厂日历与班次。
- 工站可用窗口。
- 产品路径。
- 标准 CT、performance、quality。
- setup matrix。
- break / maintenance / planned stop。
- 工装、人员、产品族等硬约束。

输出：

- 每个工站、日期、班次的 Best case SA。
- 每个工站、日期、班次的 available minutes。
- 每个订单在每个工站的 required minutes。
- setup 损失来源。
- 瓶颈工站和 capacity gap。

### 2. RiskProfile API

用于 APS 评估计划风险或生成风险修正方案。默认使用 `mostLikely` 视角。

输入：

- abnormal loss source structure。
- 历史 R&R 观察。
- 历史量产 Actual SA。
- setup 标准置信度。
- 质量冻结、物流等待、设备故障等异常损失来源。

输出：

- Most likely SA。
- 风险调整后的 available minutes。
- risk score。
- risk reason codes。
- sourceRefs。
- confidence level。

### 3. ActualState API

用于 digital twin / MES / 现场系统向本工具回传运行状态。它不用于直接排产，而用于生成 Actual SA、更新风险画像和触发再计划判断。

输入：

- 实际产出数量。
- OK / NOK。
- 实际 CT 或 cycle samples。
- 实际开始 / 结束时间。
- 工站状态事件。
- abnormal loss observations。
- WIP / buffer 状态。
- 事件数据来源与是否估算。

输出：

- Actual SA。
- performance 偏差。
- quality 偏差。
- Best case vs Actual gap。
- Most likely vs Actual gap。
- 可进入改善闭环的 abnormal loss 来源。

### 4. ReplanSignal API

用于告诉 APS 或 AI 调度层是否需要触发再计划。

它不直接替 APS 排产，而是回答：

```text
Should APS replan?
Why?
Which constraint changed?
Which station/order/time bucket is affected?
How urgent is it?
How confident is the signal?
```

输出：

- `replanRequired`：是否建议再计划。
- `triggerType`：能力下降、WIP buffer 风险、交期风险、质量冻结、设备故障等。
- `affectedWindow`：影响的时间窗口。
- `affectedStations`：受影响工站。
- `affectedOrders`：受影响订单。
- `severity`：影响等级。
- `recommendedGranularity`：分钟级、小时级、班次级、次日计划级。
- `sourceRefs`：触发信号来源。
- `confidenceLevel`：信号置信度。

## WIP / Lead Time 的角色变化

WIP 和 lead time 不应被简单删除。它们仍然是前后工序衔接的缓冲机制，但在 digital twin 场景下需要从静态参数升级为动态状态。

传统模式：

```text
fixed_lead_time / target_wip -> protect downstream process
```

未来模式：

```text
current_wip + upstream_actual_state + downstream_demand + risk_profile
  -> buffer_health
  -> starvation_risk
  -> replan_signal
```

也就是说，WIP 不只是库存数字，lead time 不只是固定提前期。它们共同表达“后续工序是否会断流”的风险状态。

## 输入：订单计划

```json
{
  "orders": [
    { "orderId": "O-001", "productId": "A", "dueDate": "2026-09-20", "quantity": 1800, "priority": "high" }
  ]
}
```

## 输入：产品工艺路线与阶段物料状态

正式接口应把工艺路线和阶段 BOM/WIP 作为两个相关但不相互替代的对象传入。路线定义过程顺序，Stage BOM 定义该阶段成立时的物料状态。

```json
{
  "routes": [
    {
      "routeId": "route-a-v1",
      "productId": "A",
      "version": "1.0",
      "status": "released",
      "effectiveFrom": "2026-01-01",
      "operations": [
        {
          "operationId": "op-a-10",
          "sequence": 10,
          "processId": "machining",
          "outputStageBomId": "bom-a-op10-out"
        }
      ]
    }
  ],
  "stageBoms": [
    {
      "stageBomId": "bom-a-op10-out",
      "productId": "A",
      "routeId": "route-a-v1",
      "operationId": "op-a-10",
      "outputItem": "A-machined-wip",
      "wipStateId": "A-wip-op10"
    }
  ]
}
```

约束：

- 未发布或不在生效期内的 Route 不得进入正式产能分析。
- Stage BOM 不用于推导 Operation 顺序。
- 当前模块只引用 Stage BOM / WIP 状态做过程追溯，不承担完整 BOM 展开。

## 当前已固化的路线主数据门禁

当前代码在正式路线配置和产能预检两层执行同一套边界校验：只接受已发布且在生效期内的 Route；每个 Operation 必须引用已发布 ProcessMaster；Stage BOM / WIP 引用必须属于对应产品、路线和阶段。输入 Stage BOM 属于前一道工序的输出状态，不能用来推导路线顺序。

本地新增或编辑路线仍只是验证模式，不会绕过正式主数据门禁进入产能分析。

## 输入：日历事件

```json
{
  "calendarEvents": [
    { "date": "2026-09-14", "shiftId": "D", "stationId": "OP10", "kind": "setup", "minutes": 45, "source": "schedule" }
  ]
}
```

## 输入：换型矩阵

```json
{
  "setupMatrix": [
    { "stationId": "OP10", "fromProductId": "A", "toProductId": "B", "minutes": 45, "validationMinutes": 10, "effectiveFrom": "2026-09-01" }
  ]
}
```

## 输入：R&R 周期

```json
{
  "runRateRuns": [
    {
      "runId": "RR-2026-001",
      "scope": { "lineId": "L1", "productIds": ["A", "B"] },
      "reason": "new_product_introduction",
      "status": "open",
      "startedAt": "2026-09-14T08:00:00+08:00"
    }
  ]
}
```

## 输入：R&R 观察

```json
{
  "runRateObservations": [
    {
      "runId": "RR-2026-001",
      "date": "2026-09-14",
      "shiftId": "D",
      "stationId": "OP10",
      "productId": "A",
      "observedCycleSamples": [24.8, 25.1, 24.6],
      "okQty": 1180,
      "nokQty": 12,
      "plannedActivityObservedMinutesByKind": { "setup": 50, "break": 60, "maintenance": 20, "plannedStop": 0 },
      "evidenceSource": "operator_log"
    }
  ]
}
```

## 输入：异常损失来源结构

```json
{
  "abnormalLossObservations": [
    {
      "observationId": "ALO-001",
      "runId": "RR-2026-001",
      "date": "2026-09-14",
      "shiftId": "D",
      "timeBucket": "shift",
      "stationId": "OP10",
      "category": "logisticsWaiting",
      "minutes": 18,
      "productId": "A",
      "orderId": "O-001",
      "evidenceSource": "operator_log",
      "isEstimated": false,
      "physicalScenario": "line-side material delivery delayed before batch start",
      "improvementOwner": "logistics"
    }
  ]
}
```

## 输出：排产约束

```json
{
  "capacityResults": [
    {
      "stationId": "OP10",
      "date": "2026-09-14",
      "shiftId": "D",
      "saView": "bestCase",
      "sa": 0.91,
      "availableMinutes": 1115,
      "requiredMinutes": 980,
      "gapMinutes": 135,
      "status": "ok"
    },
    {
      "stationId": "OP10",
      "date": "2026-09-14",
      "shiftId": "D",
      "saView": "mostLikely",
      "sa": 0.88,
      "availableMinutes": 1078,
      "requiredMinutes": 980,
      "gapMinutes": 98,
      "status": "risk_watch",
      "sourceRefs": ["ALO-001"]
    }
  ]
}
```

## 输出：参数校准建议

```json
{
  "parameterCalibrations": [
    {
      "calibrationId": "CAL-001",
      "runId": "RR-2026-001",
      "target": { "stationId": "OP10", "activityKind": "setup", "fromProductId": "A", "toProductId": "B" },
      "currentValue": 45,
      "proposedValue": 50,
      "evidenceRefs": ["RR-2026-001"],
      "approvalStatus": "pending",
      "impactPreview": { "bestCaseAvailableMinutesDelta": -5, "mostLikelyAvailableMinutesDelta": -5 }
    }
  ]
}
```

## APS 请求建议

APS 调用产能参数服务时，应明确请求窗口、时间颗粒度、SA 视角和业务用途：

```json
{
  "capacityQuery": {
    "purpose": "initialScheduling",
    "fromDate": "2026-09-14",
    "toDate": "2026-09-19",
    "timeGranularity": "shift",
    "stationIds": ["OP10", "OP20"],
    "saViews": ["bestCase", "mostLikely"],
    "includeSetupDetails": true,
    "includeSourceRefs": true
  }
}
```

默认建议：APS 使用 `bestCase` 做基础排产，使用 `mostLikely` 做方案风险评分或缓冲建议，使用 `actual` 做事后回算和参数治理。

## 输出：风险画像

```json
{
  "riskProfiles": [
    {
      "stationId": "OP10",
      "date": "2026-09-14",
      "shiftId": "D",
      "timeBucket": "shift",
      "mostLikelySA": 0.88,
      "riskScore": 0.62,
      "confidenceLevel": "medium",
      "riskReasons": [
        { "category": "logisticsWaiting", "expectedMinutes": 18, "sourceRefs": ["ALO-001"] }
      ]
    }
  ]
}
```

## 输入：Digital Twin 实绩状态

```json
{
  "actualStates": [
    {
      "timestamp": "2026-09-14T10:15:00+08:00",
      "stationId": "OP10",
      "orderId": "O-001",
      "productId": "A",
      "actualQty": 420,
      "okQty": 416,
      "nokQty": 4,
      "observedCycleSec": 25.4,
      "state": "production",
      "wipBeforeStation": 180,
      "wipAfterStation": 95,
      "evidenceSource": "mes"
    }
  ]
}
```

## 输出：再计划信号

```json
{
  "replanSignals": [
    {
      "signalId": "RPS-001",
      "generatedAt": "2026-09-14T10:20:00+08:00",
      "replanRequired": true,
      "triggerType": "buffer_starvation_risk",
      "severity": "high",
      "recommendedGranularity": "hour",
      "affectedWindow": { "from": "2026-09-14T11:00:00+08:00", "to": "2026-09-14T14:00:00+08:00" },
      "affectedStations": ["OP20"],
      "affectedOrders": ["O-001"],
      "reason": "Upstream OP10 actual output is below plan and downstream WIP buffer will be consumed within the next time bucket.",
      "constraintChanges": [
        { "stationId": "OP10", "metric": "actualSA", "expected": 0.91, "actual": 0.84 }
      ],
      "sourceRefs": ["ALO-001", "actualStates:2026-09-14T10:15:00+08:00:OP10"],
      "confidenceLevel": "medium"
    }
  ]
}
```
