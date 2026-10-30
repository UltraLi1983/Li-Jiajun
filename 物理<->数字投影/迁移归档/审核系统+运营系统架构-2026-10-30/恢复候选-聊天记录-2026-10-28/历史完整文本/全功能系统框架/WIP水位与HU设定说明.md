# WIP 水位与 HU 设定说明

> 版本：`wip-hu-explain-v0.1-2026-08-31`  
> 状态：开发前说明文档  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`

---

## 1. 这份说明解决什么问题

WIP 不应被理解成“多放一点更安全”的库存。对于 Demo2 和未来运营系统，WIP 的唯一合理目标是：

> 支持下工序连续生产，避免下工序因为上工序波动、运输延迟、换型或质量损失而断流。

因此，WIP 的计算起点不是“上工序能生产多少”，而是：

> 下工序为了持续运转，需要被保护多久。

---

## 2. WIP 的核心定义

```text
WIPMinHUQty
= 支持下工序在覆盖时间内持续运转所需的最小 HU 数
```

其中：

```text
CoverageTime
= 上工序补给响应时间
+ 运输时间
+ 换型 / 等待风险缓冲
+ 质量风险缓冲
```

一句话解释：

> WIP 是下工序的连续生产缓冲，不是上工序的产出堆积池。

---

## 3. WIP 的服务关系

WIP 必须绑定上下工序。

```text
UpstreamOperation
→ WIPStoragePoint
→ DownstreamOperation
```

字段建议：

```text
WIPBuffer
├── wip_buffer_id
├── upstream_operation_step_id
├── downstream_operation_step_id
├── storage_area_id
├── material_id
├── handling_unit_id
├── coverage_time_min
├── min_hu_qty
├── operating_hu_qty
├── max_hu_qty
└── physical_capacity_hu_qty
```

如果一个 WIP 区无法说清楚它服务哪个下工序，它在价值流上就是可疑的。

---

## 4. 基础计算

### 4.1 下工序消耗速度

```text
DownstreamConsumptionRate
= DownstreamOutputRate × FitmentRate × QtyPerFinishedGood
```

### 4.2 连续生产所需零件数量

```text
RequiredPartQtyForContinuity
= DownstreamConsumptionRate × CoverageTime × SafetyFactor
```

### 4.3 转换为 HU 数量

```text
WIPMinHUQty
= ceil(RequiredPartQtyForContinuity / QtyPerHU)
```

其中：

- `DownstreamOutputRate`：下工序单位时间产出节奏；
- `FitmentRate`：配套率；
- `QtyPerFinishedGood`：单台 / 单套成品用量；
- `CoverageTime`：希望 WIP 能保护下工序的时间；
- `SafetyFactor`：安全系数；
- `QtyPerHU`：每个 HU 内容纳多少零件。

---

## 5. Min / Operating / Max / Capacity 的区别

WIP 相关界面不应只显示一个库存数，而应至少区分：

| 参数 | 含义 | 业务解释 |
|---|---|---|
| `CurrentHUQty` | 当前 WIP HU 数 | 现在现场有多少 |
| `WIPMinHUQty` | 最小 WIP HU 数 | 支持下工序不断流的最低水位 |
| `WIPOperatingHUQty` | 运营 WIP HU 数 | 未来 24H 或滚动窗口内的预计波动 |
| `WIPMaxHUQty` | 压力上限 HU 数 | 压力场景下可能需要承载多少 |
| `PhysicalCapacityHUQty` | 物理容量 HU 数 | 该 WIP 区实际最多放得下多少 |

判断逻辑：

```text
CurrentHUQty < WIPMinHUQty
→ 下工序断流风险

WIPOperatingHUQty > WIPMaxHUQty
→ 压力场景超出策略上限

WIPMaxHUQty > PhysicalCapacityHUQty
→ 物理空间承载不足
```

---

## 6. 上下工序日历不同的影响

未来正式系统必须支持上下工序不同生产日历。

例如：

```text
上工序：2 班 × 3 天
下工序：1 班 × 6 天
```

即使周需求相同，WIP 结果也不应相同。

可能出现：

- 上工序集中生产，下工序分散消耗 → WIP 峰值上升；
- 上工序停产，下工序继续生产 → WIP 最小水位需要提高；
- 上工序换型频繁 → WIP 覆盖时间需要提高；
- 下工序连续生产窗口变长 → WIPMinHUQty 需要提高。

---

## 7. WIP 与 OEE 的关系

正式版中，WIP 不应只基于名义产能计算，而应考虑 OEE。

```text
OEEWithBreaks
= SystemAvailabilityWithBreaks × PerformanceRate × QualityRate
```

影响方式：

| OEE 因素 | 对 WIP 的影响 |
|---|---|
| System Availability 下降 | 上工序可供给时间减少，WIP 保护时间可能需要提高 |
| Performance Rate 下降 | 产出速度下降，上下工序节奏可能错位 |
| Quality Rate 下降 | 为得到同样良品，前端投入和补货可能增加 |
| Setup 增多 | 物料切换和 WIP 暂存复杂度上升 |

---

## 8. WIP 与物理空间的关系

WIP 最终必须落到物理世界。

```text
WIPHUQty
→ HU footprint
→ 堆叠规则
→ Bin / Rack / Lane
→ StorageArea 占用
```

空间计算：

```text
WIPAreaRequirement
= WIPHUQty × HUFootprintArea / StackLayers
+ OperationClearanceArea
```

其中 `OperationClearanceArea` 是作业空间，不应被忽略。否则系统会低估现场占用。

---

## 9. 第一版与正式版边界

第一版做：

- 基于下工序消耗节奏 rough 计算 `WIPMinHUQty`；
- 用 `QtyPerHU` 把零件数量转换为 HU 数量；
- 展示 WIP 的 Min / Operating / Max / Capacity；
- 将 WIP 映射到 `StorageArea / BinLocation / Rack / Lane`；
- 提示下工序断流风险和物理空间不足风险。

第一版不做：

- 不做完整上下工序 APS 排程；
- 不做订单级 WIP 追踪；
- 不做批次级库存管理；
- 不做实时 WIP 采集；
- 不做自动生成最终 WIP 管控标准。

正式版升级：

- 接入 `OperationStepCalendar`；
- 接入 `OEEWithBreaks`；
- 基于 24H 时间片计算上下工序错位；
- 接入 ERP / MES / WMS 实际库存与工单；
- 形成动态 WIP 水位推荐。

---

## 10. 面向客户的解释话术

可以这样解释：

> WIP 不是为了多放库存，而是为了保护下工序连续生产。系统会从下工序的消耗节奏反推需要多少最小 HU 缓冲，再结合上工序补给、运输时间、换型和质量波动，判断当前 WIP 是不足、合理还是过高。最终这些 HU 会映射到具体存储区、料道、bin 位或货架上，让 WIP 从一个表格数字变成现场可管理的物理对象。

