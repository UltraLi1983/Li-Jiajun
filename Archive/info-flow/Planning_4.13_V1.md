# Planning_4.13_V1 - 精益在制品与资本支出规划工具

> **版本 / Version:** 4.13 V1
> **更新日期 / Updated:** 2026年4月13日
> **基于 / Based on:** Planning_4.09_V1.md 及后续修复

---

## 📋 概述 / Overview

此工具实现了一个用于制造过程的**精益在制品 (WIP) 和资本支出 (CapEx) 规划工具**。它根据需求需求和工艺参数，计算最优在制品水平、识别瓶颈、确定机器利用率，并推荐产能扩展策略。

**提供两种使用方式 / Two Usage Modes:**
1. **Python 脚本版** - 通过Excel输入输出（`Planning_4.09_V1.py`）
2. **纯网页版** - 直接在浏览器中使用，无需服务器（`index.html`）

This tool implements a **Lean Work-In-Progress (WIP) and Capital Expenditure (CapEx) planning tool** for manufacturing processes. It calculates optimal WIP levels, identifies bottlenecks, determines machine utilization, and recommends capacity expansion strategies based on demand requirements and process parameters.

**Two Usage Modes:**
1. **Python Script** - Excel-based input/output (`Planning_4.09_V1.py`)
2. **Pure Web Version** - Direct browser usage, no server needed (`index.html`)

---

## 🎯 核心功能 / Key Features

- **三个月滚动需求预测 / 3-Month Rolling Demand Forecast:** 同时输入N+1~N+3月需求和天数，选项卡切换查看结果
- **多步骤工艺建模 / Multi-step Process Modeling:** 对具有多个连续操作的复杂生产线进行建模
- **OEE 分析 / OEE Analysis:** 计算设备综合效率（可用性 × 性能 × 质量）
- **天产能计算 / Daily Capacity Calculation:** 结合OEE、节拍和CV计算每日实际产能
- **在制品计算 / WIP Calculation:** 使用排队论（Kingman 公式）确定最优在制品水平，考虑HU单位和连续生产需求
- **Handling Unit (HU) / 包装单位:** 定义每个工序完成后的最小标准包装，WIP以HU为单位计量
- **产能规划 / Capacity Planning:** 识别超载工位并计算所需增加的机器数量
- **累计良率 / Yield Accumulation:** 考虑整个工艺链中的质量损失
- **独立运输配置 / Independent Transport Configuration:** 每两个相邻工序间可独立配置运输时间和变异系数
- **排产超限警告 / Schedule Exceeds Warning:** 当建议天数超过最大可排天数时，提示需增加的设备数
- **数据源标识 / Data Source Badge:** 预留MES/ERP系统对接接口
- **双语界面 / Bilingual UI:** 英文+中文双语显示，方便国际团队使用
- **新增 - 生产天数与产出计算 / Production Days & Output:** 
  - 设置工作天数 vs 建议天数对比
  - 基于两种天数的产出计算
- **新增 - WIP Storage / 上游成品缓冲:**
  - 基于转运间隔和上下工序节拍计算
  - 确保下游连续生产所需的初始缓冲
  - 必须是上游HU的整数倍

---

## 🏗️ 架构 / Architecture

### 核心组件 / Core Components

```
┌─────────────────────────────────────────────────┐
│                   主执行流程                      │
│              Main Execution Flow                │
├─────────────────────────────────────────────────┤
│  1. 输入参数                                    │
│     - N+1~N+3月需求 + 每月最大可排天数          │
│     - 每日班次 + 每班工时 + 目标利用率          │
│     - 工序列表 (含C.T.、OEE、CV、HU等)          │
│     - 独立运输配置                              │
│  2. 对三个月分别计算在制品场景                    │
│  3. 生成分析结果 (Excel + HTML)                  │
│  4. 展示结果 (网页表格)                         │
└─────────────────────────────────────────────────┘
```

---

## 📦 使用方式 / Usage Modes

### 方式一：Python 脚本版 / Mode 1: Python Script

**依赖项 / Dependencies:**
| 包 / Package | 用途 / Purpose |
|-----------|-------------------------------|
| `pandas`  | 数据处理与 Excel I/O |
| `openpyxl`| Excel 文件读写 |

**运行 / Run:**
```bash
python Planning_4.09_V1.py
```

### 方式二：纯网页版 / Mode 2: Pure Web Version

**无需安装，直接打开 / No Installation Required:**
1. 双击打开 `index.html`
2. 输入N+1~N+3月的需求和最大可排天数
3. 设置每日班次、每班工时、目标利用率
4. 填写工序列表（C.T.、机器数、OEE参数、CV、HU）
5. 配置工序间的独立运输（可选）
6. 点击"Calculate / 执行计算"
7. 通过选项卡查看N+1、N+2、N+3月的分析结果

**技术栈 / Tech Stack:**
- 纯 HTML + CSS + JavaScript
- Bootstrap 5 样式
- 所有计算在浏览器本地完成

---

## 🔧 类与数据结构 / Classes & Data Structures

### `ProcessStep` 类 / Class

表示单个制造工序及其所有相关指标。

#### 属性 / Attributes

| 属性 / Attribute | 类型 / Type | 描述 / Description |
|-----------|------|-------------|
| `name` | `str` | 工序名称 / Process name |
| `std_proc_time` | `float` | 节拍时间（秒）/ Cycle time (sec) |
| `num_machines` | `int` | 当前机器数量 / Current machine count |
| `perf_rate` | `float` | 性能效率 (0-1) / Performance efficiency |
| `avail_rate` | `float` | 设备可用率 (0-1) / Availability rate |
| `qual_rate` | `float` | 良率 (0-1) / Quality rate |
| `cv_proc` | `float` | 加工时间变异系数 / Process time CV |
| `is_transport` | `bool` | 是否为运输步骤 / Is transport step |

#### 计算指标 / Calculated Metrics

| 指标 / Metric | 描述 / Description |
|--------|-------------|
| `effective_time` | 每件良品的有效加工时间 / Effective time per good part |
| `utilization` | 当前机器利用率 / Current utilization |
| `theoretical_capacity` | 理想条件下的最大产出 / Max output (ideal) |
| `effective_capacity` | 考虑 OEE 损失后的实际产能 / Realistic output |
| `oee_value` | 设备综合效率 (A×P×Q) / Overall Equipment Effectiveness |
| `adjusted_demand` | 该工序必须加工的实际数量 / Actual qty to process |
| `cumulative_yield_to_end` | 从该工序到终点的累计良率 / Cumulative yield to end |
| `target_wip` | 推荐的总在制品水平 / Total recommended WIP |
| `additional_machines` | 超载时需增加的机器数量 / Machines to add |
| `projected_utilization` | 产能扩展后的利用率 / Utilization after expansion |
| `is_overloaded` | 当前产能是否不足 / Is capacity insufficient |

#### 新增指标（V4.09）/ New Metrics (V4.09)

| 指标 / Metric | 描述 / Description |
|--------|-------------|
| `scheduled_days` | 设置的工作天数 / Scheduled production days |
| `recommended_days` | 建议的工作天数 / Recommended days (based on target utilization) |
| `output_based_on_scheduled_days` | 基于设置天数的产出 / Output based on scheduled days |
| `output_based_on_recommended_days` | 基于建议天数的产出 / Output based on recommended days |
| `wip_storage_absolute` | WIP存储需求（绝对值，件数）/ WIP Storage (absolute, pieces) |
| `wip_storage_hu` | WIP存储需求（HU个数）/ WIP Storage (HU units) |
| `wip_storage_absolute_proj` | 扩产后WIP存储需求（绝对值）/ Projected WIP Storage (absolute) |
| `wip_storage_hu_proj` | 扩产后WIP存储需求（HU个数）/ Projected WIP Storage (HU units) |

---

## ⚙️ 核心算法 / Core Algorithm

### `calculate_wip_scenario(steps, demand, available_time, scheduled_days, shifts_per_day, hours_per_shift, target_util)`

**用途 / Purpose:** 在制品和产能分析的核心计算引擎。

#### 参数 / Parameters
- `steps` (list): `ProcessStep` 对象列表 / List of ProcessStep objects
- `demand` (int): 目标生产数量 / Target production quantity
- `available_time` (float): 总可用生产时间（秒）/ Total available time (sec)
- `scheduled_days` (int): 设置的工作天数 / Scheduled production days
- `shifts_per_day` (int): 每日班次 / Shifts per day
- `hours_per_shift` (float): 每班小时 / Hours per shift
- `target_util` (float): 目标利用率 (0-1) / Target utilization

#### 返回值 / Returns
- `tuple`: (结果列表 / results list, 节拍时间 / takt_time)

#### 算法 / Algorithm

**第一阶段：反向遍历（累计良率）/ Phase 1: Backward Pass (Yield Accumulation)**
```python
for i in range(len(temp_steps) - 1, -1, -1):
    cumulative_yield_from_here *= s.qual_rate
    s.adjusted_demand = demand / cumulative_yield_from_here
```

**第二阶段：正向遍历（指标计算）/ Phase 2: Forward Pass (Metrics)**
```python
for s in tempSteps:
    s.oee_value = s.perf_rate * s.avail_rate * s.qual_rate
    s.effective_time = (s.std_proc_time / oee_factor_no_qual) / s.qual_rate

    s.utilization = s.adjusted_demand / s.effective_capacity
    
    # 生产天数与产出计算
    s.recommended_days = ceil(required_seconds / (seconds_per_day * target_util))
    s.output_based_on_scheduled_days = available_seconds / effective_time * num_machines
    
    # WIP Storage 计算
    if net_consumption_per_interval > 0:
        wip_storage_hu = ceil(total_net_deficit / upstream_hu)
        wip_storage_absolute = wip_storage_hu * upstream_hu  # 必须是HU的整数倍
    
    base_wip, queue_wip, total_wip = calc_wip_details(...)
```

#### 核心公式 / Key Formulas

**1. OEE 计算 / OEE Calculation:**
```
OEE = 性能 × 可用性 × 质量
OEE = Performance × Availability × Quality
```

**2. 有效时间 / Effective Time:**
```
有效时间 = (标准工时 / (性能 × 可用性)) / 良率
Effective Time = (Std Time / (Perf × Avail)) / Quality
```

**3. 利用率 / Utilization:**
```
利用率 = 调整后需求 / 有效产能
Utilization = Adjusted Demand / Effective Capacity
```

**4. 生产天数与产出 / Production Days & Output:**
```
建议天数 = ceil(调整后需求 × 有效时间 / (机器数 × 目标利用率 × 每天秒数))
Recommended Days = ceil(Adjusted Demand × Eff. Time / (Machines × Target Util × Seconds/Day))

基于设置天数的产出 = (设置天数 × 每天秒数) / 有效时间 × 机器数
Output on Scheduled = (Scheduled Days × Seconds/Day) / Eff. Time × Machines

基于建议天数的产出 = (建议天数 × 每天秒数) / 有效时间 × 机器数
Output on Recommended = (Recommended Days × Seconds/Day) / Eff. Time × Machines
```

**5. WIP Storage / 上游成品缓冲:**
```
上游产出/间隔 = (转运间隔 / 上游有效节拍) × CV调整系数
Upstream Production/Interval = (Transport Interval / Upstream Cycle Time) × CV Adjustment

下游消耗/间隔 = 转运间隔 / 下游有效节拍
Downstream Consumption/Interval = Transport Interval / Downstream Cycle Time

净消耗/间隔 = 下游消耗/间隔 - 上游产出/间隔
Net Consumption/Interval = Downstream Consumption - Upstream Production

如果 净消耗 > 0:
    WIP Storage (HU) = ceil(净消耗/间隔 × 到达次数 / 上游HU)
    WIP Storage (件) = WIP Storage (HU) × 上游HU  ← 必须是HU的整数倍！
```

**6. 产能扩展 / Capacity Expansion:**
```
如果 / If 利用率 > 1.0:
    所需总机器数 = ceil(当前机器数 × 利用率)
    Total Machines = ceil(Current Machines × Utilization)
    需增加机器数 = 所需总数 - 当前数量
    Additional = Total Needed - Current
```

---

## 📊 默认配置 / Default Configuration

| 工序 / Process | C.T.(s) | 机器数 | 性能 | 可用 | 良率 | CV |
|---------|--------|-------|------|------|------|-----|
| 激光切割 / Laser Cutting | 300 | 2 | 0.90 | 0.95 | 0.98 | 0.3 |
| 人工焊接 / Manual Welding | 720 | 3 | 0.85 | 0.90 | 0.95 | 0.6 |
| 部件组装 / Component Assembly | 480 | 2 | 0.92 | 0.96 | 0.99 | 0.4 |
| 最终包装 / Final Packaging | 180 | 1 | 0.95 | 0.98 | 0.99 | 0.2 |

**默认设置 / Default Settings:**
- N+1月需求 / Month N+1 Demand: 2000 件 / pcs
- N+2月需求 / Month N+2 Demand: 2200 件 / pcs
- N+3月需求 / Month N+3 Demand: 2500 件 / pcs
- N+1月最大天数 / Month N+1 Max Days: 22 天
- N+2月最大天数 / Month N+2 Max Days: 21 天
- N+3月最大天数 / Month N+3 Max Days: 23 天
- 每日班次 / Shifts per day: 2
- 每班小时 / Hours per shift: 12
- 目标利用率 / Target Utilization: 85%
- 运输时间 / Transport Time: 0 秒 (sec)
- 运输CV / Transport CV: 0.5

---

## 🚀 使用方法 / Usage

### Python 脚本版 / Python Script

**使用方法 / How to Use:**
1. **首次运行自动生成模板** - 运行 `python Planning_4.09_V1.py`
2. **填写 Excel 模板** - 编辑 `WIP_CapEx_Input_Template.xlsx`
3. **再次运行脚本** - 生成 `WIP_CapEx_Analysis_Result.xlsx` 和 HTML 报告

**Excel 输入模板格式 / Excel Input Template:**

**Config_Settings 工作表:**
| 参数项 | 数值 |
|--------|------|
| 需求总量 (Demand) | 2000 |
| 计划天数 (Days) | 30 |
| 每日班次 (Shifts/Day) | 2 |
| 每班小时 (Hours/Shift) | 12 |
| 目标利用率 (Target Utilization) | 0.85 |
| 物流运输时间_秒 (Transport Time_sec) | 0 |
| 运输变异系数 (Transport CV) | 0.5 |

**Config_Processes 工作表:**
| 工序名称 | 标准工时_秒 | 机器数量 | 性能效率_P | 可用性_A | 良率_Q | 变异系数_CV |
|----------|------------|---------|-----------|---------|--------|------------|
| 激光切割 | 300.0 | 2 | 0.90 | 0.95 | 0.98 | 0.3 |
| 人工焊接 | 720.0 | 3 | 0.85 | 0.90 | 0.95 | 0.6 |
| 部件组装 | 480.0 | 2 | 0.92 | 0.96 | 0.99 | 0.4 |
| 最终包装 | 180.0 | 1 | 0.95 | 0.98 | 0.99 | 0.2 |

### 纯网页版 / Pure Web Version

**使用方法 / How to Use:**
1. **打开文件 / Open File:** 双击 `index.html`
2. **输入需求 / Enter Demand:** 填写N+1~N+3月的需求量和最大可排天数
3. **设置班次 / Set Shifts:** 配置每日班次、每班工时、目标利用率
4. **配置工序 / Configure Processes:** 填写每个工序的 C.T.、机器数、性能、可用、良率、CV、HU
5. **配置运输 / Configure Transport:** 点击每个工序后的"运输"按钮，启用并配置运输时间和CV（可选）
6. **执行计算 / Calculate:** 点击"Calculate / 执行计算"按钮
7. **查看结果 / View Results:** 通过选项卡查看N+1、N+2、N+3月的分析结果

---

## 📋 输出结果说明 / Output Interpretation

### Excel 结果表格列 / Result Table Columns

| 列名 / Column | 说明 / Description |
|------|-------------|
| ID | 工序序号（运输步骤显示→）/ Process sequence number |
| Process Name | 工序名称（运输显示"起点→终点"）/ Process name |
| C.T.(s) | 节拍时间（秒）/ Cycle time |
| **OEE (with breaks)** | **设备综合效率（含休息时间）/ Overall Equipment Effectiveness (with breaks)** |
| Day Capa. | 天产能（考虑OEE和CV）/ Daily capacity |
| Qual | 良率 / Quality rate |
| Adj. Demand | 需加工数量（含累计良率补偿）/ Adjusted demand |
| Scheduled Days | 设置工作天数 / Scheduled production days |
| Output (Scheduled) | 基于设置天数的产出 / Output based on scheduled days |
| Rec. Days | 建议排产天数 / Recommended days |
| Output (Recommended) | 基于建议天数的产出 / Output based on recommended days |
| Machines | 当前机器数 / Current machines |
| Utilization | 当前利用率 / Current utilization |
| Add | 需增机器数 / Additional machines needed |
| Proj. Util. | 扩产后利用率 / Projected utilization after expansion |
| HU | 包装单位 / Handling unit |
| **WIP Storage (件/HU)** | **WIP存储需求（显示上游工序名称）/ WIP Storage requirement** |
| Status | 状态（🟢健康/🟡高风险/🔴超载）/ Status |

### 状态指示器 / Status Indicators

| 状态 / Status | 利用率范围 / Utilization Range | 含义 / Meaning |
|--------|------------------|---------|
| 🟢 健康 / Healthy | < 85% | 正常运行 / Normal operation |
| 🟡 高风险 / High Risk | 85% - 100% | 需关注并规划扩展 / Monitor & plan expansion |
| 🔴 超载 / Overloaded | > 100% | 需资本支出 / CapEx investment required |

---

## 🔍 核心概念 / Key Concepts

### 调整后需求 / Adjusted Demand

考虑整个工艺链的报废累积。如果下游工序有质量损失，上游工序必须加工更多单位以补偿。

**示例 / Example:**
```
最终需求 / Final Demand: 1000 件 / units
工序3 良率 / Process 3 Qual: 95%
工序2 良率 / Process 2 Qual: 98%
工序1 良率 / Process 1 Qual: 99%

工序3 调整后需求 / Process 3 Adjusted = 1000 / 0.95 = 1053 件
工序2 调整后需求 / Process 2 Adjusted = 1000 / (0.98 × 0.95) = 1075 件
工序1 调整后需求 / Process 1 Adjusted = 1000 / (0.99 × 0.98 × 0.95) = 1086 件
```

### Handling Unit (HU) / 包装单位

每个工序完成后的最小标准包装数量。例如：
- HU = 50 表示一箱装50件
- 该工序的排产量必须是 50 的整数倍
- WIP 也以 HU 为单位计量（如 15 HU = 15箱）

**用途 / Purpose:**
- 定义最小排产单位 / Define minimum production batch
- 标准化WIP计量 / Standardize WIP measurement
- 便于物流和仓储规划 / Facilitate logistics and storage planning

### 变异系数 / Coefficient of Variation (CV)

- **低 / Low CV (0.1-0.3):** 稳定的自动化工艺 / Stable, automated processes
- **中 / Medium CV (0.3-0.6):** 有一定变化的人工工艺 / Manual processes with variation
- **高 / High CV (0.6+):** 高度变化的工艺 / Highly variable processes

### WIP Storage / 上游成品缓冲

**V4.09 新增功能 / New Feature in V4.09**

**概念 / Concept:**
- 是上游工序已经生产出来的**成品库存**
- 等待运输到下游工序
- 确保下游工序连续生产不停线

**计算逻辑 / Calculation Logic:**

WIP Storage的计算分为**两种场景**：

#### 场景1：有中间转运（Transport Interval > 0）

```
1. 计算上下游节拍差异
   - 上游有效节拍 = 上游有效时间 / 上游机器数
   - 下游有效节拍 = 下游有效时间 / 下游机器数

2. 计算每个转运间隔的净消耗
   - CV调整系数 = max(0.5, 1 - 上游CV × 0.2)
   - 上游产出/间隔 = (转运间隔 / 上游节拍) × CV调整
   - 下游消耗/间隔 = 转运间隔 / 下游节拍
   - 净消耗/间隔 = 下游消耗 - 上游产出

3. 计算整个班次的理论需求
   - 到达次数 = 班次总时间 / 转运间隔
   - 理论需求 = 净消耗/间隔 × 到达次数

4. 转换为HU整数倍（关键！）
   - HU数 = ceil(理论需求 / 上游HU)
   - 实际件数 = HU数 × 上游HU  ← 必须是HU的整数倍！
```

#### 场景2：无中间转运（Transport Interval = 0）

**新增！** 即使没有物理转运间隔，工序间仍需WIP缓冲来应对：
- **节拍不匹配**：上游产出速率 vs 下游消耗速率
- **工序变异**：CV导致的波动需要缓冲

```
1. 计算上下游生产/消耗速率
   - 上游产出速率 = 1 / 上游有效节拍（件/秒）
   - 下游消耗速率 = 1 / 下游有效节拍（件/秒）

2. 情况A：下游比上游快（下游消耗 > 上游产出）
   - 净消耗速率 = 下游消耗速率 - 上游产出速率
   - 目标连续生产时长 = 12小时（1个整班）
   - 初始WIP需求 = 净消耗速率 × 目标连续生产时长
   
   - 变异缓冲 = 上游CV × 下游消耗速率 × 3600秒（1小时缓冲）
   - 总WIP Storage = 初始WIP需求 + 变异缓冲

3. 情况B：上游比下游快或持平
   - 不需要节拍缓冲（上游能跟上下游）
   - 但仍需变异缓冲 = 上游CV × 下游消耗速率 × 3600秒

4. 转换为HU整数倍
   - HU数 = ceil(总WIP Storage / 上游HU)
   - 实际件数 = HU数 × 上游HU
```

**为什么无转运时也需要WIP Storage？**

以人工焊接→部件组装为例：
- 人工焊接：720秒/件，3台设备，CV=0.6
- 部件组装：480秒/件，2台设备

即使没有物理转运间隔：
1. **节拍不匹配**：组装的有效节拍（考虑OEE后）可能快于焊接的产出速率
2. **连续生产需求**：组装工序要连续生产12小时，必须有前端WIP积累
3. **变异缓冲**：焊接工序CV=0.6（高变异），需要额外缓冲吸收波动

**为什么必须是HU的整数倍？**
- 上游只能整箱交付
- 不可能交付"半箱"
- 例如：HU=20，需要84.5件 → 需要5箱 → 实际100件

**WIP Storage说明:**
| 项目 | 说明 |
|------|------|
| **含义** | 上游工序生产出来的成品缓冲库存 |
| **计算基础** | 上下游节拍差异 + 连续生产目标（12小时）+ CV变异缓冲 |
| **显示格式** | `100件 (5HU/Welding)` 或 `0` |
| **HU整数倍** | 必须是上游工序HU的整数倍（向上取整） |
| **变异缓冲阈值** | 仅当variability_buffer > 0.5×HU时才计算，避免极小值显示为1 HU |
| **上游名称** | 括号内显示**上游工序英文名称**（如：2HU/Welding），因为WIP是上游的成品。优先显示" / "分隔符后的英文部分 |

### 生产天数与产出 / Production Days & Output

**V4.09 新增功能 / New Feature in V4.09**

**设置工作天数 (Scheduled Days):**
- 从Settings中读取的"最大可排天数"
- 表示实际可用于生产的天数

**建议天数 (Recommended Days):**
- 基于目标利用率计算
- 考虑OEE和CV后的实际需求

**两种产出对比:**
```
基于设置天数的产出 = 如果按设置天数生产，能生产多少
基于建议天数的产出 = 如果按建议天数生产，能生产多少

如果 基于设置天数的产出 < 调整后需求:
    → 产能不足！需要增加天数或设备
```

---

## 📁 文件结构 / File Structure

```
项目目录 / Project Directory/
├── Planning_4.09_V1.py              # Python 主脚本 / Main Python script
├── index.html                       # 纯网页版（含三个月滚动预测+HU）/ Pure web version
├── WIP_CapEx_Input_Template.xlsx    # 输入配置（Python版生成）/ Input config
├── WIP_CapEx_Analysis_Result.xlsx   # 输出结果（Python版生成）/ Output results
├── WIP_CapEx_Analysis_Result.html   # HTML 报告（Python版生成）/ HTML report
└── Planning_4.09_V1.md              # 本说明文档 / This documentation
```

---

## 🚦 状态指示器 / Status Indicators

| 状态 / Status | 利用率范围 / Utilization Range | 含义 / Meaning |
|--------|------------------|---------|
| 🟢 健康 / Healthy | < 85% | 正常运行 / Normal operation |
| 🟡 高风险 / High Risk | 85% - 100% | 需关注并规划扩展 / Monitor & plan expansion |
| 🔴 超载 / Overloaded | > 100% | 需资本支出 / CapEx investment required |

---

## ⚠️ 重要注意事项 / Important Notes

1. **文件锁定（Python版）/ File Locking (Python):** 运行脚本前关闭 Excel 文件以避免 `PermissionError`
2. **数据验证 / Data Validation:**
   - 所有比率（性能、可用、良率）必须在 0 到 1 之间 / All rates (performance, availability, quality) must be between 0 and 1
   - 网页版输入界面已添加自动验证功能 / Web version includes auto-validation for rate inputs
   - 输入超出范围时会自动修正并显示警告 / Auto-correction and warnings for out-of-range inputs
3. **运输步骤 / Transport Steps:**
   - **Python版：** 在 Excel 模板的"Config_Settings"中设置全局运输时间，代码自动在所有相邻工序间插入
   - **网页版：** 每个运输步骤可独立配置，点击工序后的"运输"按钮启用
4. **WIP Storage 计算 / WIP Storage Calculation:**
   - **有转运场景**：基于转运间隔和节拍差异计算
   - **无转运场景**：基于上下游速率差异 + 连续生产目标（12小时）+ CV变异缓冲
   - 必须是上游工序HU的整数倍
   - 显示格式：`100件 (5 HU)`
   - 如果上游比下游快，仍需要变异缓冲（基于CV计算）
5. **边界情况 / Edge Cases:**
   - 利用率 ≥ 1.0 触发产能扩展建议
   - WIP以HU为单位向上取整，并考虑连续生产需求
   - 极端拥堵（利用率 → 1.0）导致非常高的在制品
   - 产出计算假设设备100%按计划运行

---

## 🐛 错误处理 / Error Handling

| 错误 / Error | 原因 / Cause | 解决方案 / Solution |
|-------|-------|----------|
| `Please check input data` | 工序数据不完整 / Incomplete process data | 检查所有工序的C.T.、机器数、OEE参数是否填写 |
| `PermissionError` (Python) | Excel 文件已打开 / Excel file is open | 关闭文件后重试 / Close file and retry |
| `Error reading Excel` (Python) | 文件格式无效 / Invalid file format | 检查文件结构 / Check file structure |
| `Calculation failed` | 参数无效 / Invalid parameters | 验证所有数值输入 / Verify all inputs |

**调试提示 / Debug Tip:** 如果验证失败，打开浏览器控制台（F12）查看具体哪个字段有问题。

---

## 📈 输出解读 / Output Interpretation

### 何时采取行动 / When to Take Action

- **🔴 超载 / Overloaded:** 立即需要资本支出 / Immediate CapEx required
- **🟡 高风险 / High Risk:** 安排产能规划 / Schedule capacity planning
- **🟢 健康 / Healthy:** 无需行动 / No action needed

### 产能规划 / Capacity Planning

如果 / If `additional_machines > 0`：
```
新总机器数 / New Total = 当前 / Current + 新增 / Additional
预计利用率 / Projected Util. = (当前利用率 × 当前机器数) / 新总数
```

### 产出分析 / Output Analysis

**关键指标 / Key Indicators:**
```
如果 基于设置天数的产出 < 调整后需求:
    → 当前设置天数不足，需要增加天数或设备
    
如果 基于设置天数的产出 >= 调整后需求:
    → 当前设置天数可以满足需求
```

---

## 📝 版本历史 / Version History

- **v4.13 V1 (当前版本 / Current):**
  - **修复WIP Storage计算逻辑 / Fixed WIP Storage Calculation Logic**
    - **问题1**：无转运时WIP storage计算结果总是显示1 HU
    - **解决1**：添加阈值判断（variability_buffer > 0.5×HU），避免极小值向上取整为1 HU
    - **问题2**：WIP Storage仅在存在中间转运时产生
    - **解决2**：新增无转运场景计算，基于上下游速率差异 + 连续生产目标 + CV变异缓冲
  
  - **优化输出列结构 / Optimized Output Column Structure**
    - 删除Target WIP列（意义不明确）
    - WIP Storage列移至表格后部（HU列之后）
    - 添加天产能（Day Capa.）列
    - OEE列名改为"OEE (with breaks)"
  
  - **优化Summary卡片 / Optimized Summary Cards**
    - Total WIP改为Total WIP Storage
    - 同时显示绝对值和HU总数

- **v4.09 V1:**
  - 新增生产天数与产出计算 / Added production days and output calculation
    - 设置工作天数 vs 建议天数对比
    - 基于两种天数的产出计算
  - 新增 WIP Storage / 上游成品缓冲 / Added WIP Storage calculation
    - 基于转运间隔和上下工序节拍
    - 必须是上游HU的整数倍
    - 显示格式：`100件 (5 HU)`
  - 优化Excel输出列顺序 / Optimized Excel output column order
    - WIP Storage列移到工序名称后
  - 自动生成HTML报告 / Auto-generate HTML report
  - 修复Adjusted Demand计算逻辑 / Fixed Adjusted Demand calculation for transport steps
  - 修复WIP Storage HU计算错误 / Fixed WIP Storage HU calculation (使用上游HU)
  - 修复WIP Storage绝对值取整 / Fixed WIP Storage absolute value ceiling

- **v4.08 V1:**
  - 改进 Target WIP 计算逻辑 / Improved Target WIP calculation
  - Target WIP 考虑HU单位、运输间隔和连续生产需求 / Target WIP considers HU units, transport intervals, and continuous production requirements
  - 去除 target_util 参数 / Removed target_util parameter
  - 去除建议排产天数功能 / Removed recommended days feature
  - 增强数据验证 / Enhanced data validation

- **v4.07 V2:**
  - 三个月滚动需求预测 / 3-month rolling demand forecast
  - Handling Unit (HU) 包装单位 / Handling unit for WIP
  - 天产能计算 / Daily capacity calculation (with CV adjustment)
  - 数据源标识（MES/ERP接口预留）/ Data source badges
  - 选项卡式结果展示 / Tab-based results display
  - 目标利用率简化为单一输入 / Single target utilization input
  - 排班联动限制 / Shift-hours constraints

- **v4.07 V1:** 添加独立运输配置功能 / Added independent transport configuration

- **v3.0:** 添加含调整后需求的累计良率逻辑 / Added rolled yield logic with adjusted demand

- **网页版 / Web Version:** 纯前端实现，无需服务器 / Pure frontend, no server needed

- **双语支持 / Bilingual Support:** 英文+中文双语界面 / English+Chinese bilingual UI

---

## 🤝 支持 / Support

如有疑问或问题 / For questions or issues:
1. 验证 Excel 模板结构（Python版）/ Verify Excel template structure (Python)
2. 检查所有数值输入是否有效 / Check all numeric inputs are valid
3. 确保比率为小数（非百分比）/ Ensure rates are decimals (not percentages)
4. 查看控制台输出中的错误消息 / Review error messages in console (F12)

---

## 📚 相关文档 / Related Documentation

- `WIP_Storage_HU整数倍修复.md` - WIP Storage HU整数倍计算修复说明
- `WIP_Storage_最终修复总结.md` - WIP Storage最终修复总结
- `新功能实现说明.md` - V4.09新功能详细说明
- `功能更新总结.md` - 功能更新总结
- `运输时间WIP计算逻辑统一说明.md` - 运输时间WIP计算逻辑统一说明
- `运输环节产能不足问题分析.md` - 运输环节后工序产能不足问题分析

---

*更新日期 / Updated: 2026年4月13日*
*版本 / Version: 4.13 V1*
