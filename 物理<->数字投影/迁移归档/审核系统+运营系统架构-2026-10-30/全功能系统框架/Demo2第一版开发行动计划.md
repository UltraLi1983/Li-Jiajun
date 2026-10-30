# Demo2 第一版开发行动计划

> 版本：`demo2-dev-plan-v0.1-2026-08-31`  
> 状态：开发前行动计划  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`

---

## 1. 第一版目标

Demo2 第一版要交付一个独立网页 App，作为完整运营系统的第一块可见切片。

目标不是一次性实现完整系统，而是完成一个售前可演示闭环：

```text
Layout 导入
→ 人工标注
→ 物理对象建模
→ 运营参数输入
→ route / HU / bin / WIP / 水位 / 运输 rough 计算
→ 平面运营视图 + 立面钻取
→ Baseline vs Proposed
→ 售前报告
```

开发原则：

```text
Demo 做窄
架构想深
表达完整
承诺克制
```

---

## 2. MVP 范围

第一版必须包含：

- 独立 Web App；
- PDF / 图片 Layout 背景导入；
- 比例尺设置；
- 区域、路径、工站、配送点人工标注；
- 标准样板场景模板；
- Supermarket Mode ON / OFF；
- 高位货架 / 料架立面钻取；
- 运输任务动画；
- Baseline / Proposed 对比；
- rough 计算引擎；
- Web 售前报告页；
- JSON 导入 / 导出。

第一版不包含：

- CAD / DXF 自动解析；
- 完整 3D 工厂建模；
- 高精度交通仿真；
- 多车实时调度；
- WCS / AGV 控制；
- APS 排程优化；
- 实时 ERP / MES / WMS 接口；
- 人员效率与排班优化。

---

## 3. 页面 / 视图

| 页面 | 目标用户 | 第一版内容 |
|---|---|---|
| 总览页 | 老板 / Owner | KPI、Baseline vs Proposed、关键风险 |
| Layout 标注页 | 运营 / 工程 | 上传背景、比例尺、区域和路径标注 |
| 平面运营视图 | 老板 + 专业团队 | 仓库、超市区、线边、产线、路线、运输动画 |
| 立面钻取视图 | 物流 / 仓储 | Rack / Lane / SkuSlot、HU 水位、容量 |
| 参数页 | 专业团队 | 需求、日历、HU、运输工具、物料策略 |
| 方案对比页 | 老板 + 专业团队 | 当前方案、推荐方案、压力场景 |
| 报告页 | 售前交付 | 计算假设、改善点、不承诺边界、后续路径 |

---

## 4. 模块拆分

```text
demo2-app
├── layout-import
├── annotation
├── physical-model
├── scenario-template
├── production-calendar
├── material-hu
├── storage-water-level
├── transport-calculation
├── wip-calculation
├── capacity-risk
├── visualization-plane
├── visualization-elevation
├── scenario-compare
├── report
└── data-io
```

---

## 5. 核心数据模型

第一版必须建立以下对象：

```text
FactoryLayout
StorageArea
ProductionLine
ProductionStation
DeliveryPoint
PathNetwork
RouteNode
RouteSegment
TransportResource
Material
HandlingUnit
InventoryWaterLevel
WIPBuffer
Rack
RackLevel
Lane
SkuSlot
Scenario
```

这些对象要避免写死 Demo 页面逻辑，未来应能迁入主系统。

---

## 6. 核心计算模块

| 模块 | 第一版输出 |
|---|---|
| 距离计算 | 起点到终点距离、路径长度 |
| 单趟运输时间 | 行驶时间 + 装卸时间 + rough 干涉 |
| 运输工具需求 | 所需数量、利用率、响应时间 |
| HU 计算 | PartQty → HUQty |
| bin / 面积计算 | HUQty → 占地 → Bin / Rack / Lane |
| WIP 最小水位 | 支持下工序连续生产的最小 HU |
| 三水位 | Min / Operating / Max |
| 扩产约束 | 生产、空间、运输、交通四类风险 |
| 场景对比 | Baseline vs Proposed KPI 差异 |

---

## 7. 开发阶段

### Phase 0：项目骨架与样板数据

交付：

- Web App 骨架；
- 标准样板场景 JSON；
- 基础路由与页面框架；
- 数据导入 / 导出结构。

验收：

- 能加载一个标准样板场景；
- 能在页面间切换；
- 能导出当前场景 JSON。

### Phase 1：Layout 导入与人工标注

交付：

- PDF / 图片背景导入；
- 比例尺设置；
- 区域、点位、路径标注；
- 标注对象保存为 JSON。

验收：

- 用户可以标注主仓、超市区、线边区、产线、工站、配送点、路径；
- 系统能基于比例尺计算距离和面积。

### Phase 2：参数与数据模型

交付：

- 生产日历输入；
- 物料 / HU 输入；
- 运输工具输入；
- 物料策略分类；
- Supermarket Mode 开关。

验收：

- 能从周需求反算小时产出节奏；
- 能计算 HUQty；
- 能对物料做 A1/A2/B/C/D rough 分类。

### Phase 3：计算引擎

交付：

- 距离、时间、运输工具需求；
- HU / bin / 面积；
- WIPMinHUQty；
- Min / Operating / Max；
- 扩产四约束 rough 风险。

验收：

- Baseline 和 Proposed 都能出 KPI；
- 计算假设可见；
- 输出能解释。

### Phase 4：可视化

交付：

- 平面运营视图；
- 运输任务动画；
- 通道压力 rough 热力；
- RackElevationView；
- 高位货架、超市区料道、线边料架展示。

验收：

- 点击 StorageArea 可进入局部视图；
- 点击 Rack 可查看层 / 料道 / SKU Slot；
- 运输工具能沿路线动态移动。

### Phase 5：方案对比与报告

交付：

- Baseline / Proposed 对比；
- Supermarket ON / OFF 对比；
- 高位货架方案对比；
- Web 报告页。

验收：

- 能完成一套售前演示脚本；
- 报告页包含当前问题、推荐方案、计算假设、KPI 改善、不承诺边界。

---

## 8. 推荐开发顺序

```text
样板数据
→ 数据模型
→ Layout 标注
→ 基础计算
→ 平面视图
→ 运输动画
→ 立面钻取
→ 方案对比
→ 报告页
```

不要先做复杂视觉。先让数据链路跑通，再把视觉做性感。

---

## 9. 成功标准

第一版成功标准：

- 能用一个标准样板客户讲清楚完整闭环；
- 能导入客户 Layout 背景并人工标注；
- 能生成 Baseline / Proposed；
- 能展示路线、运输、仓储、WIP、水位的变化；
- 能说明未来 System Availability / OEE / 实时数字孪生如何接入；
- 不产生工程级精度或实时调度的误导承诺。

