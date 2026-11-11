# Demo2 软件开发任务计划

> 版本：`demo2-software-task-plan-v0.2-2026-11-10`
> 状态：恢复工程主计划 / 可执行 Backlog；完成进度以恢复工程看板为准
> 当前项目目录：`/Users/lijiajun/Documents/GitHub/Li-Jiajun/物理<->数字投影/demo2-web/`
> 关联文档：`Demo2-物理数字孪生与运营优化独立定义.md`、`Demo2第一版开发行动计划.md`、`Demo2输入数据字典.md`

---

## 1. 开发目标

Demo2 第一版开发目标是交付一个独立网页 App：

```text
客户 Layout 导入
→ 比例尺与边界/对象人工标注
→ 校验、预览并采纳为统一场景版本
→ 运营参数录入
→ 可通行候选路网与工具适配
→ rough 计算
→ 平面运营视图
→ 存储对象立面钻取
→ 运输任务动画
→ Baseline / Proposed 对比
→ 售前报告
```

技术策略：

```text
Demo 做窄
架构想深
表达完整
承诺克制
```

---

## 2. 推荐技术栈

第一版建议：

```text
React + TypeScript + Vite
```

建议库：

| 能力 | 推荐 |
|---|---|
| 基础前端 | React |
| 类型约束 | TypeScript |
| 构建工具 | Vite |
| 状态管理 | Zustand 或 React Context，第一版可先 Zustand |
| 标注 / 平面画布 | Konva / react-konva |
| 表格参数 | TanStack Table 或轻量自建 |
| 图表 | ECharts 或 Recharts |
| JSON 校验 | Zod |
| 样式 | CSS Modules / Tailwind 二选一，第一版建议普通 CSS Modules |

暂不建议：

- Three.js 全 3D；
- Unity / Unreal；
- Electron；
- 低代码平台；
- 后端服务优先。

第一版可先做纯前端本地 App，使用 JSON 导入 / 导出保存场景。

---

## 3. 项目目录规划

建议目录：

```text
demo2-web/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── app/
│   ├── pages/
│   ├── components/
│   ├── features/
│   │   ├── layout-import/
│   │   ├── annotation/
│   │   ├── physical-model/
│   │   ├── scenario-template/
│   │   ├── production-calendar/
│   │   ├── material-hu/
│   │   ├── storage-water-level/
│   │   ├── transport-calculation/
│   │   ├── wip-calculation/
│   │   ├── capacity-risk/
│   │   ├── visualization-plane/
│   │   ├── visualization-elevation/
│   │   ├── scenario-compare/
│   │   └── report/
│   ├── data/
│   │   └── standard-demo-scenario.json
│   ├── types/
│   ├── utils/
│   └── styles/
└── docs/
```

---

## 4. 任务分组总览

| 任务组 | 名称 | 目标 |
|---|---|---|
| T0 | 项目初始化 | 建立可运行 Web App 骨架 |
| T1 | 类型与数据模型 | 建立未来主系统可继承的数据对象 |
| T2 | 标准样板场景 | 建立默认客户场景与演示数据 |
| T3 | Layout 导入、标注与场景采纳 | 支持图片 / PDF、比例尺、人工标注，并把经确认的草稿写入统一场景 |
| T4 | 参数录入 | 支持生产日历、物料、HU、运输工具输入 |
| T5 | 计算引擎 | 距离、时间、HU、WIP、水位、运力、风险 |
| T6 | 平面运营视图 | 展示 Layout、区域、路径、运输任务动画 |
| T7 | 立面钻取视图 | 展示 Rack / Level / Lane / SkuSlot |
| T8 | 方案对比 | Baseline / Proposed / Supermarket Mode |
| T9 | 售前报告 | 输出可讲解的报告页 |
| T10 | 数据导入导出 | JSON 保存、加载、复用 |
| T11 | QA 与演示脚本 | 验证核心流程可顺畅演示 |

---

## 5. T0 项目初始化

### T0.1 创建项目

任务：

- 在工作区根目录创建 `demo2-web/`。
- 初始化 React + TypeScript + Vite。
- 配置基础 `npm scripts`。

验收：

- `npm install` 成功；
- `npm run dev` 可启动；
- 浏览器可看到 Demo2 首页。

### T0.2 建立基础页面路由

任务：

- 建立 7 个页面入口：
  - Dashboard；
  - Layout Annotation；
  - Plane View；
  - Elevation View；
  - Parameters；
  - Scenario Compare；
  - Report。

验收：

- 页面可切换；
- 顶部或侧边导航清晰；
- 页面标题与用途明确。

### T0.3 建立全局状态

任务：

- 建立 `scenarioStore`；
- 支持读取当前场景；
- 支持切换 Baseline / Proposed；
- 支持 Supermarket Mode 状态。

验收：

- 页面之间共享同一份场景数据；
- 修改参数后其他页面能读取到更新。

---

## 6. T1 类型与数据模型

### T1.1 定义物理对象类型

任务：

建立 TypeScript 类型：

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
```

验收：

- 类型文件可被全项目引用；
- `ProductionStation`、`DeliveryPoint`、`StorageArea`、`RouteNode` 不混用。

### T1.2 定义物料与 HU 类型

任务：

建立：

```text
Material
HandlingUnit
HUQty
InventoryWaterLevel
```

必须区分：

```text
QtyPerHU = 一个 HU 内容纳多少零件
HUQty = 某一位置需要 / 当前 / 最多 / 可容纳多少个 HU
```

验收：

- `qty_per_hu` 和 `current_hu_qty / min_hu_qty / max_hu_qty` 字段清晰分离；
- 示例数据能通过类型校验。

### T1.3 定义 Rack / Lane 类型

任务：

建立：

```text
Rack
RackLevel
Lane
SkuSlot
```

验收：

- 一个 Rack 可包含多层；
- 一层可包含多条 Lane；
- 一条 Lane 可绑定一个 SKU / Material；
- 支持主仓高位货架、超市区料道、线边料架共用。

### T1.4 定义生产日历与 OEE 预留类型

任务：

建立：

```text
ProductionCalendar
SystemAvailabilityPlan
OEEAssumption
```

第一版必含：

```text
WeeklyDemandQty
ProductionDaysPerWeek
ShiftsPerDay
HoursPerShift
EffectiveHoursPerShift
```

正式版预留：

```text
PlannedEffectiveProductionTimePerShift
SystemAvailabilityWithBreaks
PerformanceRate
QualityRate
OEEWithBreaks
```

验收：

- 第一版可使用 `EffectiveHoursPerShift`；
- 类型中明确预留正式版 SA/OEE 字段。

---

## 7. T2 标准样板场景

### T2.1 创建标准样板 JSON

任务：

创建 `src/data/standard-demo-scenario.json`。

包含：

- 1 个主仓库；
- 1 个可关闭超市区；
- 1 个线边 / WIP 区；
- 2 条产线；
- 6-10 个生产工站；
- 6-10 个配送点；
- 3-5 类物料；
- 2 类运输工具；
- Baseline / Proposed 初始结构。

验收：

- App 可加载样板数据；
- 不需要用户上传 Layout 也能跑通演示。

### T2.2 建立物料策略样板

任务：

样板物料至少包含：

- A1 高频小件；
- A2 高频大件；
- B 中频拣配件；
- C 低频上架件。

验收：

- 每类物料都有 `fitment_rate`、`qty_per_hu`、HU 尺寸、存储策略；
- 系统能展示分类结果。

### T2.3 建立 Supermarket Mode 样板

任务：

- OFF：主仓库 → 线边配送点；
- ON：主仓库 → 超市区 → 线边配送点。

验收：

- 切换 Supermarket Mode 后路径和 KPI 变化；
- 能解释线边库存、超市区面积、响应时间变化。

---

## 8. T3 Layout 导入与人工标注

### T3.1 图片 / PDF 背景导入

任务：

- 支持导入 PNG/JPG 与多页 PDF，并按页选择和独立保存规划草稿；
- PDF 在本地渲染为图纸背景，保留原文件、页码、原图尺寸及楼栋/楼层对应关系；
- 保存每页背景尺寸与引用，横向或纵向图纸按原比例显示。

验收：

- 用户能看到 Layout 背景；
- 可缩放、平移。

### T3.2 比例尺设置

任务：

- 用户选择两点；
- 输入真实距离；
- 系统计算 px-to-meter 比例。

验收：

- 任意两点距离可换算为米；
- 标注区域面积可换算为平方米。

### T3.3 区域标注

任务：

支持 polygon / rectangle 标注：

- 主仓库；
- 超市区；
- 线边区；
- WIP 区；
- 高位货架区；
- 产线区域。

验收：

- 区域有类型、名称、面积；
- 面积优先由标注 + 比例尺计算；
- 支持 override 面积。

### T3.4 点位与路径标注

任务：

支持标注：

- ProductionStation；
- DeliveryPoint；
- RouteNode；
- RouteSegment；
- 墙支持连续点击转角形成折线，点击起点可闭合成围墙；共用端点自动吸附并标出转角/交汇点，支持拖动、插入和删除转角。
- 在选中的墙段上开口并填写门的净宽、位置和通行属性；门是依附墙段的开口，不是可单独放在任意位置的普通点位。旧草稿中的独立“门点位”须经人工关联墙段后才可用于可达性计算。
- 通道中心线、墙结构、门开口和路径段分别建模；画通道是固定车道的可选约束，不要求手绘所有行驶路线。
- 图上悬停与对象列表双向高亮，点击固定选择并显示属性。

验收：

- 点位、墙转角、墙段和门开口类型不能混淆；图上对象与列表使用稳定 ID，可相互定位。
- 连续画三段墙能形成两个可编辑转角；闭合墙结构后，在指定墙段开门不会破坏相邻墙段。
- 路径可连接多个节点；可计算路径距离。
- 烟测：画 L 形墙并拖动转角 → 闭合为围墙 → 在一段墙上开门并修改净宽 → 刷新后结构和开口位置保持一致。

### T3.5 导入草稿校验与统一场景采纳

任务：

- 每张图纸按楼栋、楼层保存原图、比例尺、区域、墙、门、障碍、固定通道、工站及配送点；区分“已确认可用范围”“已确认禁行”“待核实”，不能把未标注空白直接视为可通行。
- 把图纸像素坐标及面积/距离换算为统一场景坐标和米制数值；同一楼层对象共用 ID，跨楼层连接须显式定义。
- 提供采纳前预览与校验：缺比例尺、墙端点未闭合/未连接、门未附着墙段或开口宽度越界、通道不连通、对象重叠、孤立配送点、缺净宽或缺目标楼层时显示对象级提示；阻断错误不能采纳，待核实项须保留状态。开放墙段可显式确认其为非封闭隔断。
- 用户确认采纳后生成新的场景 revision，写入统一的 FactoryLayout、区域、点位与物理约束；保留原草稿和上一生效版本作为再次编辑的起点。重新计算只读取所选生效/预览版本，避免混用导入草稿与恢复样板。

验收与烟测：

- 导入一张图并完成标尺、区域、墙、门、工站和配送点 → 预览中核对对象数、位置、面积及楼层 → 采纳 → 切到平面运营视图看到同一批对象 → 刷新后版本与草稿均恢复。
- 移走一个门或删除标尺 → 确认采纳被阻止或出现定位到对象的待核实提示；旧生效版本及计算结果不被无意覆盖。

---

## 9. T4 参数录入

### T4.1 生产日历参数页

任务：

输入：

```text
WeeklyDemandQty
ProductionDaysPerWeek
ShiftsPerDay
HoursPerShift
EffectiveHoursPerShift
```

输出：

```text
WeeklyEffectiveHours
HourlyOutputRate
OutputPerShift
TimeUtilization
```

验收：

- 修改任一输入，结果实时更新；
- `EffectiveHoursPerShift <= HoursPerShift` 校验。

### T4.2 物料与 HU 参数页

任务：

输入：

- material；
- fitment rate；
- qty per finished good；
- qty per HU；
- HU 尺寸；
- stackable；
- max stack layers。

验收：

- 可新增 / 编辑 / 删除物料；
- 可计算 PartQty 与 HUQty。

### T4.3 运输工具参数页

任务：

输入：

- transport resource type；
- quantity；
- speed；
- HU per trip；
- loading time；
- unloading time；
- availability rate；
- CV factor。

验收：

- 支持 AGV、叉车、Dolly、地牛；
- 不把 AGV 写死为唯一运输方式。

---

## 10. T5 计算引擎

### T5.1 生产节奏计算

输入：

- 周需求；
- 生产日历；
- 有效工时。

输出：

- 每小时产出；
- 每班产出；
- 每周有效小时。

验收：

- 支持 OutputPerShift override；
- 能解释计算公式。

### T5.2 物料频率分类

任务：

按补货次数和补货间隔判断高 / 中 / 低频：

```text
高频：每班补货 ≥ 4 次，或补货间隔 ≤ 2 小时
中频：每班补货 1-3 次，或补货间隔 2-8 小时
低频：每班补货 < 1 次，或补货间隔 > 8 小时
```

验收：

- 输出 frequency class；
- 频率只表示补货节奏压力，不直接决定最终策略。

### T5.3 物料策略分类

任务：

输出：

- A1 高频小件；
- A2 高频大件；
- B 中频拣配件；
- C 低频上架件；
- D 特殊约束件。

验收：

- 高频大件不会被误判为普通高频小件；
- 高位货架不会默认推荐给强节拍绑定高频大件。

### T5.4 可通行候选路网、距离与路线计算

任务：

- 仅在 T3.5 已确认的楼层可用范围内，以墙、设备、禁行区为障碍，门/开口为连接，生成候选路网；固定车道、单行方向和人工指定中心线作为显式约束，不要求用户手画每一条配送路线。
- 按运输工具外廓、通道/门净宽、转弯及楼层可达条件初筛路段；不确定条件标为待核实，不能自动宣称可通行。行吊等非地面工具使用对应覆盖区域与约束，不套用地面路网。
- 墙与门是通行硬约束；生产区域矩形是复核提示，不直接当实体障碍。路线进入生产区时核对内部设备占地和通行净宽；框外路线可保留全部已配置工具作为候选，但未经门宽、墙间净空及转弯校核不得标为已适配。缺尺寸集中标待复核，不要求每条开放通道都手填净宽。
- 基于可达的 RouteNode / RouteSegment 求主仓 → 线边、主仓 → 超市区 → 线边的候选路径与距离；无路径时指出阻断位置或未连接对象。允许人工禁用、指定或调整路段，修改后重新计算。
- 路线结果记录使用的场景 revision、工具及约束来源；Baseline / Proposed 使用各自明确的方案参数。此阶段是几何与粗算校核，不承诺多车避让、路口等待或 WCS 调度可行。

验收与烟测：

- 闭合围墙无门时内外不可达；在墙段开门并满足净宽后恢复候选路径；窄门应排除尺寸不符的工具，墙转角或交汇处不能产生虚假的穿越缝隙。
- 两个配送点在同一可达区域时可各自得到路径；更换工具、禁用路段或修改边界后，路径和距离同步更新，无法连接的点位明确提示。
- 基线与提案的路线差异可追溯到路段、工具或方案参数；候选路径能在平面视图显示。

### T5.5 运输时间与工具需求

任务：

计算：

```text
SingleTripTime
= TravelDistance / Speed
+ LoadingTime
+ UnloadingTime
+ TrafficInterferenceLoss

RequiredTransportResourceQty
= TransportTaskDemand / SingleResourceCapacity
```

验收：

- 输出单趟时间、任务频次、工具需求、利用率；
- 明确是 rough 计算，不是实时调度。

### T5.6 HU / bin / 面积计算

任务：

计算：

```text
PartQty → HUQty → BinQty → AreaRequirement
```

验收：

- 支持堆叠层数；
- 支持作业空间系数；
- 输出面积与容量风险。

### T5.7 WIP 水位计算

任务：

基于下工序连续生产需求计算：

```text
WIPMinHUQty
= ceil(
  DownstreamConsumptionRate × CoverageTime × SafetyFactor
  / QtyPerHU
)
```

验收：

- WIP 绑定上工序和下工序；
- 输出下工序断流风险。

### T5.8 三水位计算

任务：

输出：

- MinHUQty；
- OperatingHUQty；
- MaxHUQty；
- PhysicalCapacityHUQty。

验收：

- MaxHUQty 不等于 PhysicalCapacityHUQty；
- 能判断低于 Min 和超过 Capacity。

### T5.9 扩产四约束风险

任务：

输出：

- ProductionCapacity risk；
- StorageCapacity risk；
- TransportCapacity risk；
- TrafficCapacity risk。

验收：

- 能指出哪类约束最先被打满；
- 支持需求变化系数，例如 +20%。

---

## 11. T6 平面运营视图

### T6.1 Layout 图层

任务：

- 从当前所选场景 revision 显示导入 Layout 背景、楼层、区域、墙、门、障碍、固定通道、工站与配送点；显示 T5 生成或人工确认的路径。
- 支持原图、边界/禁行、区域/点位、候选路网、计算路线和风险的图层开关；区分已确认、待核实、不可达状态。
- 图上对象与工厂场景编辑器使用同一 ID；点击查看来源、约束和当前计算说明。

验收与烟测：

- 采纳新 Layout 后切到平面运营视图，背景、墙、区域、门、点位与编辑预览位置一致；开关各图层只影响显示，不改场景数据。
- 修改并采纳一个边界，再返回平面视图，看到新 revision 的边界与重新计算的路线；切回旧版本时不显示新版本对象。
- 用户能看清主仓、超市区、线边、工站、配送点、路线及不可达提示。

### T6.2 KPI 覆盖层

任务：

在区域和路径上展示：

- 库容压力；
- 线边库存；
- 路径距离；
- 通道压力；
- 风险颜色。

验收：

- 红 / 黄 / 绿风险状态清楚；
- 点击对象可看到详情。

### T6.3 运输任务动画

任务：

- 运输工具沿路线移动；
- 支持单车 / 多车视觉动画；
- 支持 Baseline / Proposed 切换。

验收：

- 动画按路线移动；
- 明确不做真实避让和实时调度。

---

## 12. T7 立面钻取视图

### T7.1 RackElevationView

任务：

开发统一立面组件，支持：

- high-bay rack；
- supermarket flow rack；
- line-side rack；
- WIP rack。

验收：

- 一个组件覆盖主仓、超市区、线边料架；
- 支持层、料道、SKU Slot。

### T7.2 料道水位展示

任务：

显示：

- CurrentHUQty；
- MinHUQty；
- OperatingHUQty；
- MaxHUQty；
- PhysicalCapacityHUQty。

验收：

- 不同状态用颜色表达；
- 可以看出低于 Min、超过 Max、超过物理容量。

### T7.3 高位货架方案展示

任务：

- 展示当前平面存储；
- 展示推荐高位货架；
- 展示库容提升和拣料时间增加。

验收：

- 能讲清“纵向空间解法”；
- 不承诺施工级货架设计。

---

## 13. T8 方案对比

### T8.1 Baseline 生成

任务：

- 读取用户标注和当前参数；
- 生成当前状态 KPI。

验收：

- Baseline 不依赖 Proposed；
- 可单独导出。

### T8.2 Proposed 生成

任务：

系统按规则生成推荐方案：

- Supermarket Mode；
- 高位货架；
- 线边水位降低；
- A2 高频大件专用缓存；
- 路线调整；
- 运输工具配置建议。

验收：

- Proposed 可人工调整；
- 每个推荐动作有原因。

### T8.3 Stress 场景

任务：

- 支持需求变化系数；
- 默认 +20%；
- 重算三水位和扩产风险。

验收：

- 能展示压力下先爆的是空间、运输、产能还是交通。

---

## 14. T9 售前报告

### T9.1 报告页

报告包含：

- 当前问题；
- 推荐方案；
- KPI 改善；
- 计算假设；
- 不承诺边界；
- 付费后升级路径。

验收：

- 可作为售前会议后的交付页面；
- 文字对非专业者可理解。

### T9.2 报告数据绑定

任务：

- 报告所有指标来自当前场景计算结果；
- 不手写假数字。

验收：

- 修改参数后报告同步更新；
- 报告能区分 Baseline / Proposed / Stress。

---

## 15. T10 数据导入导出

CSV 作为人工修正和批量交换格式；同一楼层的图上对象、属性面板及 CSV 行须共用稳定对象 ID。导入 CSV 后先预览差异和行级错误，再回写当前图纸草稿并重新绘制；正式计算以已确认的结构化场景版本为准。

### T10.1 场景 JSON 导出

任务：

- 导出当前 scenario；
- 包含 layout 标注、参数、计算结果、视图状态。

验收：

- 导出的 JSON 可读；
- 能用于后续复盘和演示。

### T10.2 场景 JSON 导入

任务：

- 导入之前保存的 scenario；
- 恢复页面状态和数据。

验收：

- 可复用同一个客户演示场景；
- 不依赖浏览器缓存。

---

## 16. T11 QA 与演示脚本

### T11.1 核心流程 QA

必须验证：

```text
加载样板场景
→ 修改生产日历
→ 修改物料 HU
→ 切换 Supermarket Mode
→ 生成 Proposed
→ 查看平面视图
→ 查看立面视图
→ 查看报告
→ 导出 JSON
→ 重新导入 JSON
```

验收：

- 全流程不中断；
- KPI 前后一致；
- 无明显空白页或错误。

### T11.2 售前演示脚本

任务：

准备一套 10-15 分钟演示脚本：

1. 展示客户 Layout。
2. 展示当前物料流和库容压力。
3. 切换 Supermarket Mode。
4. 展示运输路线变化。
5. 点击高位货架 / 超市区料道。
6. 展示 WIP 与 HU 水位。
7. 展示需求 +20% 压力场景。
8. 输出报告。

验收：

- 演示能让老板看懂收益；
- 专业团队能看到计算假设。

---

## 17. 推荐实施节奏

### 第 1 周：骨架 + 数据模型 + 样板数据

目标：

- App 能跑；
- 页面能切；
- 样板数据能加载；
- 核心 TypeScript 类型建立。

### 第 2 周：Layout 标注 + 参数输入

目标：

- 能上传背景；
- 能标注区域和路径；
- 能录入生产日历、物料、HU、运输工具。

### 第 3 周：计算引擎

目标：

- 距离、运输时间、HU、WIP、三水位、容量风险可计算；
- Baseline 能跑通。

### 第 4 周：可视化

目标：

- 平面运营视图；
- 运输任务动画；
- RackElevationView。

### 第 5 周：方案对比 + 报告

目标：

- Proposed 生成；
- Supermarket ON / OFF 对比；
- Stress 场景；
- 报告页。

### 第 6 周：打磨与演示准备

目标：

- 修 bug；
- 补默认数据；
- 优化视觉；
- 完成演示脚本。

---

## 18. 第一版完成定义

第一版完成不是“所有未来能力都做完”，而是：

```text
一个标准样板客户
可以从 Layout 到报告完整演示；
一个真实客户 Layout
可以通过人工标注进入系统；
系统可以给出 rough 但可解释的路线、仓储、WIP、HU、水位和运输改善判断。
```

完成检查：

- [ ] App 可启动；
- [ ] 样板场景可加载；
- [ ] Layout 可上传和标注；
- [ ] 数据模型清晰；
- [ ] 参数页可编辑；
- [ ] 计算结果可解释；
- [ ] 平面视图可展示；
- [ ] 运输动画可播放；
- [ ] 立面钻取可查看；
- [ ] Baseline / Proposed 可对比；
- [ ] 报告页可展示；
- [ ] JSON 可导入导出；
- [ ] 不承诺边界在报告中可见。

