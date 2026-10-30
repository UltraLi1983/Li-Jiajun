# Planned System Availability 计算说明

> 版本：`psa-explain-v0.1-2026-08-31`  
> 状态：开发前说明文档  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`、`Planned System availability simulation_20250611.xlsx`

---

## 1. 这份说明解决什么问题

Demo2 第一版会暂时使用 `EffectiveHoursPerShift` 作为有效生产工时的简化输入。但正式系统不应长期依赖人工填写这个结果值。

正式系统应把它展开成：

```text
班次日历
+ 休息时间
+ 计划维护
+ 换型时间
+ 其他计划性损失
→ Planned Effective Production Time
→ System Availability
→ OEE with breaks
→ 物料消耗、WIP、水位、运输任务
```

这份文档用于向非专业者解释：

> 为什么“开了 8 小时班”不等于“有 8 小时有效生产时间”。

---

## 2. 参数命名统一

| 层级 | 字段名 | 中文名 | 第一版 Demo2 状态 |
|---|---|---|---|
| 名义班次时长 | `HoursPerShift` | 班次时长 | 输入 |
| 简化有效工时 | `EffectiveHoursPerShift` | 有效生产工时 / 班 | 第一版暂用输入 |
| 正式计划有效时间 | `PlannedEffectiveProductionTimePerShift` | 计划有效生产时间 / 班 | 正式版计算结果 |
| 含休息系统可用率 | `SystemAvailabilityWithBreaks` | 含休息时间的系统可用率 | 正式版计算结果 |
| 不含休息系统可用率 | `SystemAvailabilityExcludingBreaks` | 不含休息时间的系统可用率 | 可辅助展示 |
| 性能率 | `PerformanceRate` | 性能达成率 | 正式版输入 / 接口数据 |
| 质量率 | `QualityRate` | 质量合格率 | 正式版输入 / 接口数据 |
| 含休息 OEE | `OEEWithBreaks` | 含休息时间的 OEE | 正式版核心计算结果 |

第一版口径：

```text
EffectiveHoursPerShift = 用户手工输入的简化有效生产工时
```

正式版口径：

```text
EffectiveHoursPerShift
= PlannedEffectiveProductionTimePerShift
= 由计划日历与计划性损失自动计算得出
```

---

## 3. 为什么要使用 with breaks 口径

传统 OEE 分析有时会把 breaks 排除掉，让设备效率看起来更聚焦于“应生产时间”。但 Demo2 的目标不是只评价设备，而是控制完整 24H 运营状态。

因此 Demo2 更适合使用：

```text
OEEWithBreaks
= SystemAvailabilityWithBreaks × PerformanceRate × QualityRate
```

原因：

- breaks 期间产线通常不消耗物料；
- breaks 前后可能出现补货、清线、换型、暂存和 WIP 变化；
- 24H 物料流需要知道“什么时候消耗、什么时候不消耗”；
- 超市区、线边库存、运输工具任务都受时间分布影响；
- with breaks 更适合做未来 24H 可控度分析。

---

## 4. 时间层级

### 4.1 Calendar Time 日历时间

```text
CalendarTime = 24h × 7 days
```

表示一周天然存在的全部时间。

### 4.2 Scheduled Time 排产时间

```text
ScheduledTime
= ProductionDaysPerWeek × ShiftsPerDay × HoursPerShift
```

表示企业计划开线的名义时间。

### 4.3 Planned Effective Production Time 计划有效生产时间

```text
PlannedEffectiveProductionTime
= ScheduledTime
- Breaks
- PlannedMaintenance
- SetupTime
- OtherPlannedLoss
```

表示扣除计划性时间损失后，理论上真正可用于生产的时间。

### 4.4 Good Output Equivalent Time 良品等效产出时间

```text
GoodOutputEquivalentTime
= PlannedEffectiveProductionTime × PerformanceRate × QualityRate
```

表示考虑速度损失和质量损失后，对良品产出真正有效的时间。

---

## 5. System Availability 计算

### 5.1 含休息口径

```text
SystemAvailabilityWithBreaks
= PlannedEffectiveProductionTime / ScheduledTime
```

其中：

```text
PlannedEffectiveProductionTime
= ScheduledTime
- Breaks
- PlannedMaintenance
- SetupTime
- OtherPlannedLoss
```

### 5.2 不含休息口径

```text
SystemAvailabilityExcludingBreaks
= (ScheduledTime - Breaks - PlannedMaintenance - SetupTime - OtherPlannedLoss)
 / (ScheduledTime - Breaks)
```

不含休息口径可以保留，用于与传统设备管理口径对齐；但 Demo2 的物料流与 24H 场景计算，应优先使用 `SystemAvailabilityWithBreaks`。

---

## 6. 对 Demo2 的影响

`SystemAvailabilityWithBreaks` 不只是产能参数，它会影响整个物料流。

| 影响对象 | 影响方式 |
|---|---|
| 产出节奏 | 有效生产时间减少后，单位有效小时产出压力上升 |
| 物料消耗 | breaks / maintenance / setup 期间消耗下降或停止 |
| 线边库存 | 连续生产时段越长，`MinHUQty` 越可能需要提高 |
| 超市区 | 换型与短周期生产会增加拣配与暂存压力 |
| WIP | 上下工序日历错位会造成 WIP 上升或断流风险 |
| 运输工具 | 生产集中时段会产生运输任务峰值 |
| 扩产判断 | 低可用率可能导致增加班次、提升 SA 或增加设备 |

---

## 7. 与周需求和生产日历的关系

Demo2 不应直接把周需求平均摊分到每小时，而应先经过生产日历。

```text
WeeklyDemandQty
→ ProductionCalendar
→ ScheduledTime
→ SystemAvailabilityWithBreaks
→ OEEWithBreaks
→ RequiredOutputRate
→ MaterialConsumptionRate
```

第一版简化计算：

```text
WeeklyEffectiveHours
= ProductionDaysPerWeek × ShiftsPerDay × EffectiveHoursPerShift

HourlyOutputRate
= WeeklyDemandQty / WeeklyEffectiveHours
```

正式版计算：

```text
WeeklyScheduledHours
= ProductionDaysPerWeek × ShiftsPerDay × HoursPerShift

WeeklyPlannedEffectiveHours
= WeeklyScheduledHours × SystemAvailabilityWithBreaks

OEEWithBreaks
= SystemAvailabilityWithBreaks × PerformanceRate × QualityRate
```

---

## 8. 未来 24H 时间片模型

正式系统应把一天拆成时间片，例如 30 分钟或 1 小时。

```text
TimeBucket
├── start_time
├── end_time
├── production_status
├── activity_type
├── planned_output_qty
├── expected_good_output_qty
├── material_consumption_qty
├── replenishment_tasks
├── wip_water_level
└── transport_load
```

典型 `activity_type`：

- production；
- break；
- maintenance；
- setup；
- planned_shutdown；
- overtime；
- idle。

这样 Demo2 才能展示未来 24H 内：

- 什么时候物料消耗最大；
- 什么时候可以补货；
- 什么时候超市区压力上升；
- 什么时候运输工具不够；
- 什么时候 WIP 可能断流或堆积。

---

## 9. 第一版与正式版边界

第一版做：

- 使用 `EffectiveHoursPerShift` 作为简化输入；
- 允许用户输入 `HoursPerShift`；
- 展示“名义班次时间”和“有效生产时间”的区别；
- 在说明中解释未来会由 System Availability 模块展开；
- 用有效工时驱动物料消耗、HU、水位和运输任务 rough 计算。

第一版不做：

- 不做完整 OEE 采集；
- 不做自动读取设备停机记录；
- 不做完整 24H 时间片仿真；
- 不做 APS 排程优化；
- 不承诺自动判断所有计划性损失。

正式版升级：

- 引入 `SystemAvailabilityWithBreaks`；
- 引入 `PerformanceRate` 和 `QualityRate`；
- 形成 `OEEWithBreaks`；
- 基于时间片驱动物料流、水位、运输和 WIP；
- 与 ERP / MES / 设备 / 现场数据逐步对接。

---

## 10. 面向客户的解释话术

可以这样解释：

> Demo 阶段我们允许手工输入有效生产工时，是为了快速建立客户现场的运营模型。正式版会把这个参数拆开，基于班次、休息、计划维护、换型和其他计划损失，计算含休息时间的 System Availability，再与 Performance 和 Quality 形成 OEE。这样系统不是只知道你一周要做多少，而是知道未来 24 小时什么时候生产、什么时候停、什么时候消耗物料、什么时候需要补货。

