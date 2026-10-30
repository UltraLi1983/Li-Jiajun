# Demo2 输入数据字典

> 版本：`demo2-input-dict-v0.1-2026-08-31`  
> 状态：开发前参考 / 第一版字段口径  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`

---

## 1. 字典原则

Demo2 第一版允许使用 rough 输入，但字段口径必须按未来完整系统设计。

原则：

1. 第一版可以人工输入，未来应支持 ERP / MES / WMS / 设备 / 硬件接口导入。
2. 第一版可以使用默认值，但默认值必须可见、可修改。
3. 面积、距离类数据优先从 Layout 标注与比例尺计算，人工输入只作为 override。
4. `EffectiveHoursPerShift` 是暂用聚合字段，未来由 Planned System Availability 模块计算。
5. `QtyPerHU` 与 `HUQty` 必须区分。

---

## 2. Layout 与物理标注

| 字段 | 中文名 | 必填 | 来源 | 说明 |
|---|---|---:|---|---|
| `layout_file` | Layout 文件 | 是 | 上传 | PDF / 图片；CAD 可先转图片，不承诺自动解析 |
| `scale_ratio` | 比例尺 | 是 | 人工输入 | 用于像素 / 图纸单位换算为米 |
| `factory_boundary` | 厂房边界 | 是 | 人工标注 | polygon |
| `storage_area_boundary` | 存储区边界 | 是 | 人工标注 | 主仓库、超市区、线边区、WIP 区等 |
| `production_line_boundary` | 产线边界 | 是 | 人工标注 | 标记产线区域 |
| `production_station_point` | 生产工站点 | 是 | 人工标注 | 节拍发生位置 |
| `delivery_point` | 配送点 | 是 | 人工标注 | 物料送达位置 |
| `route_node` | 路径节点 | 是 | 人工标注 / CSV | 通道网络节点 |
| `route_segment` | 路径边 | 是 | 人工标注 / CSV | 可通行路线 |

面积口径：

```text
CalculatedArea = 标注边界 × 比例尺
EffectiveArea = OverrideArea ?? CalculatedArea
```

`storage_area_area` 不应作为第一优先输入，而应由 Layout 标注计算；用户可录入 `storage_area_override_area` 作为校准值。

---

## 3. 生产需求与日历

| 字段 | 中文名 | 必填 | 来源 | 说明 |
|---|---|---:|---|---|
| `weekly_demand_qty` | 周需求产量 | 是 | 人工输入 / ERP | 第一版主输入 |
| `production_days_per_week` | 每周生产天数 | 是 | 人工输入 | 例如 3、5、6 |
| `shifts_per_day` | 每日班次数 | 是 | 人工输入 | 例如 1、2、3 |
| `hours_per_shift` | 班次时长 | 是 | 人工输入 | 名义班次时长 |
| `effective_hours_per_shift` | 有效生产工时 / 班 | 是，第一版 | 人工输入 | 暂用聚合字段 |
| `time_utilization` | 时间利用率 | 否 | 系统计算 | `EffectiveHoursPerShift / HoursPerShift` |
| `output_per_shift_override` | 每班产量覆盖值 | 否 | 人工输入 | 如客户已明确每班产量，可覆盖系统计算 |

第一版计算：

```text
WeeklyEffectiveHours
= ProductionDaysPerWeek × ShiftsPerDay × EffectiveHoursPerShift

HourlyOutputRate
= WeeklyDemandQty / WeeklyEffectiveHours

OutputPerShift
= HourlyOutputRate × EffectiveHoursPerShift
```

正式版升级：

```text
EffectiveHoursPerShift
← PlannedEffectiveProductionTimePerShift
← SystemAvailabilityWithBreaks
```

---

## 4. OEE 与 System Availability 预留字段

| 字段 | 中文名 | 第一版状态 | 正式版状态 |
|---|---|---|---|
| `planned_effective_production_time_per_shift` | 计划有效生产时间 / 班 | 预留 | 计算结果 |
| `system_availability_with_breaks` | 含休息系统可用率 | 预留 | 核心计算 |
| `system_availability_excluding_breaks` | 不含休息系统可用率 | 预留 | 辅助展示 |
| `break_minutes_per_shift` | 每班休息分钟 | 可默认 | 输入 / 计划 |
| `planned_maintenance_minutes_per_week` | 每周计划维护分钟 | 可默认 | 输入 / 计划 |
| `setup_minutes_per_week` | 每周换型分钟 | 可默认 | 输入 / 计划 |
| `performance_rate` | 性能率 | 可默认 | 输入 / 接口 |
| `quality_rate` | 质量率 | 可默认 | 输入 / 接口 |
| `oee_with_breaks` | 含休息 OEE | 预留 | 计算结果 |

---

## 5. 物料与 HU

| 字段 | 中文名 | 必填 | 说明 |
|---|---|---:|---|
| `material_id` | 物料 ID | 是 | 唯一标识 |
| `material_name` | 物料名称 | 是 | 展示用 |
| `fitment_rate` | 配套率 | 是 | 每套一件为 1.0 |
| `qty_per_finished_good` | 单台 / 单套用量 | 是 | 可为 1、2、N |
| `hu_type` | HU 类型 | 是 | 箱、托盘、料架车等 |
| `qty_per_hu` | 每 HU 零件数 | 是 | 包装参数 |
| `hu_length` | HU 长度 | 是 | 用于占地 |
| `hu_width` | HU 宽度 | 是 | 用于占地 |
| `hu_height` | HU 高度 | 否 | 用于立面 / 堆叠 |
| `stackable` | 是否可堆叠 | 是 | true / false |
| `max_stack_layers` | 最大堆叠层数 | 否 | 不可堆叠则为 1 |
| `weight_per_hu` | 每 HU 重量 | 否 | 用于特殊约束 |

---

## 6. 存储与水位

| 字段 | 中文名 | 必填 | 说明 |
|---|---|---:|---|
| `storage_area_id` | 存储区 ID | 是 | 主仓、超市区、线边、WIP |
| `bin_location_id` | Bin / 库位 ID | 否 | 第一版可粗粒度 |
| `rack_id` | 料架 ID | 否 | 用于立面钻取 |
| `lane_id` | 料道 ID | 否 | 超市区 / 线边料架 |
| `current_hu_qty` | 当前 HU 数 | 是 | 当前或样板状态 |
| `min_hu_qty` | 最小 HU 水位 | 是 | 避免断料或触发补货 |
| `operating_hu_qty` | 运营 HU 水位 | 否 | 24H rough 预测 |
| `max_hu_qty` | 压力上限 HU 水位 | 是 | 压力场景需求 |
| `physical_capacity_hu_qty` | 物理容量 HU 数 | 是 | 现场最多放得下多少 |

---

## 7. 运输工具

| 字段 | 中文名 | 必填 | 说明 |
|---|---|---:|---|
| `transport_resource_type` | 运输工具类型 | 是 | AGV、叉车、Dolly、地牛等 |
| `transport_resource_qty` | 数量 | 是 | 当前可用数量 |
| `speed_m_per_min` | 行驶速度 | 是 | rough 平均速度 |
| `hu_per_trip` | 单次可运 HU | 是 | 运输能力 |
| `loading_time_min` | 装载时间 | 否 | 可默认 |
| `unloading_time_min` | 卸载时间 | 否 | 可默认 |
| `availability_rate` | 可用率 | 否 | 可默认 |
| `cv_factor` | 波动系数 | 否 | 可默认 |

---

## 8. 场景与方案

| 字段 | 中文名 | 必填 | 说明 |
|---|---|---:|---|
| `scenario_id` | 场景 ID | 是 | Baseline / Proposed / Stress |
| `scenario_type` | 场景类型 | 是 | baseline、proposed、stress |
| `supermarket_mode_enabled` | 是否启用超市区 | 是 | ON / OFF |
| `high_bay_rack_enabled` | 是否启用高位货架 | 否 | 用于纵向空间方案 |
| `demand_change_factor` | 需求变化系数 | 否 | 如 +20% |
| `traffic_interference_factor` | 交通干涉系数 | 否 | rough 估算 |
| `safety_factor` | 安全系数 | 否 | 用于 Min / Max 水位 |

---

## 9. 第一版最小必填集

第一版 Demo2 最小必填输入：

```text
Layout 文件
比例尺
区域边界标注
路径标注
生产工站标注
配送点标注
WeeklyDemandQty
ProductionDaysPerWeek
ShiftsPerDay
HoursPerShift
EffectiveHoursPerShift
Material fitment rate
QtyPerFinishedGood
QtyPerHU
HU 尺寸
TransportResource 类型
TransportResource 数量
TransportResource 速度
HUPerTrip
CurrentHUQty
PhysicalCapacityHUQty
```

可默认 / 可选：

```text
Breaks
Maintenance
Setup
PerformanceRate
QualityRate
装卸时间
交通干涉系数
安全系数
拣料时间
高位货架安全缓冲
面积 override
距离 override
```

