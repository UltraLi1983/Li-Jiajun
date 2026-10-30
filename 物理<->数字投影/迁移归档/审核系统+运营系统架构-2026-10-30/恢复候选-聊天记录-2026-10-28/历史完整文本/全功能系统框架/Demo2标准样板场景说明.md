# Demo2 标准样板场景说明

> 版本：`demo2-standard-scenario-v0.1-2026-08-31`  
> 状态：开发前样板场景定义  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`

---

## 1. 样板场景的目的

Demo2 第一版需要一个标准样板场景，用于：

- 快速演示系统闭环；
- 降低第一版开发复杂度；
- 让客户导入 Layout 后可以映射到一套稳定业务结构；
- 支撑 Baseline / Proposed 对比；
- 支撑售前报告输出。

标准样板不是固定图纸，而是固定业务结构。

---

## 2. 标准业务结构

```text
StandardDemoScenarioTemplate
├── 主仓库 Main Warehouse
├── 可选高位货架区 High-bay Rack Area
├── 可选超市区 Supermarket Area
├── 线边 / WIP 区 Line-side / WIP Area
├── 2 条产线 Production Lines
├── 6-10 个生产工站 Production Stations
├── 6-10 个配送点 Delivery Points
├── 若干 StorageArea / BinLocation / Rack / Lane
├── 3-5 类样板物料
└── 2 类运输工具
```

客户导入 Layout 后，不是强行套用固定图纸，而是把客户现场标注结果映射到这套业务结构。

---

## 3. 默认区域

| 区域 | 是否默认存在 | 是否可关闭 | 用途 |
|---|---:|---:|---|
| 主仓库 | 是 | 否 | 主要存储、供料起点 |
| 高位货架区 | 是 | 是 | 纵向库容优化方案 |
| 超市区 | 是 | 是 | 中间拣配、暂存、配送缓冲 |
| 线边区 | 是 | 否 | 支持工站连续生产 |
| WIP 区 | 是 | 否 | 支持下工序连续生产 |
| 收货区 | 可选 | 是 | 后续增强 |
| 发运区 | 可选 | 是 | 后续增强 |

---

## 4. Supermarket Mode

默认模板内置超市区，但允许关闭。

```text
Supermarket Mode = OFF
主仓库 → 线边配送点

Supermarket Mode = ON
主仓库 → 超市区 → 线边配送点
```

对比 KPI：

- 总运输距离；
- 平均补货响应时间；
- 线边库存 HU；
- 超市区所需面积；
- 运输工具利用率；
- 缺料风险；
- 仓储 / 线边空间压力。

---

## 5. 默认物料类型

| 类型 | 默认数量 | 用途 |
|---|---:|---|
| A1 高频小件 | 1-2 | 展示超市区与线边最小库存 |
| A2 高频大件 | 1 | 展示近线边缓存 / 顺序配送 |
| B 中频拣配件 | 1 | 展示超市区拣配 |
| C 低频上架件 | 1 | 展示高位货架与库容提升 |
| D 特殊约束件 | 可选 | 后续展示特殊规则 |

第一版至少准备 4 类物料：A1、A2、B、C。

---

## 6. 默认运输工具

第一版建议内置两类运输工具：

| 类型 | 用途 |
|---|---|
| AGV / Dolly 车 | 展示小批量、高频、路线动画 |
| 叉车 / 地牛 | 展示托盘、主仓、高位货架或大件运输 |

所有运输工具统一抽象为 `TransportResource`。

---

## 7. Baseline / Proposed

### 7.1 Baseline

Baseline 表示客户当前状态。

第一版可通过以下方式建立：

- 使用样板当前方案；
- 或导入客户 Layout 后人工标注当前状态；
- 当前路线、库位、水位、运输工具数量由用户录入或基于样板默认值生成。

### 7.2 Proposed

Proposed 表示系统推荐方案。

第一版采用：

```text
系统按规则生成推荐方案 + 用户可手工调整
```

典型推荐动作：

- 启用 Supermarket Mode；
- 将 C 类低频上架件转入高位货架；
- 降低线边 A1 小件库存；
- 为 A2 高频大件设置近线边缓存 / 专用配送点；
- 优化主仓到超市区、超市区到线边的路线；
- 调整运输工具数量或任务频次。

---

## 8. 默认演示脚本

建议演示顺序：

1. 打开 Baseline，全厂平面展示当前路线和仓储压力。
2. 展示线边库存高、主仓直送距离长、局部库容紧张。
3. 打开 Supermarket Mode。
4. 系统生成 Proposed。
5. 展示路线分段、线边库存下降、超市区承担拣配缓冲。
6. 点击仓储区，进入立面钻取。
7. 展示 C 类物料进入高位货架，库容提升。
8. 展示 A2 高频大件不默认上高位货架，而进入近线边缓存。
9. 展示 KPI 对比和 rough 计算假设。
10. 输出售前报告。

---

## 9. 第一版样板数据建议

建议样板：

```text
WeeklyDemandQty = 6000
ProductionDaysPerWeek = 5
ShiftsPerDay = 2
HoursPerShift = 8
EffectiveHoursPerShift = 7

TransportResource:
- AGV / Dolly: 2 台
- Forklift / Pallet Jack: 1 台

Storage:
- Main Warehouse
- Supermarket Area
- Line-side Area
- WIP Area
- High-bay Rack Area
```

样板数据不代表行业标准，只用于展示系统能力。

