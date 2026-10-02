# Planning_4.07_V1 - 精益在制品与资本支出规划工具 / Lean WIP & CapEx Master Plan

> **版本 / Version:** 4.07 V2（含三个月滚动预测 + Handling Unit + 独立运输配置）

---

## 📋 概述 / Overview

此工具实现了一个用于制造过程的**精益在制品 (WIP) 和资本支出 (CapEx) 规划工具**。它根据需求需求和工艺参数，计算最优在制品水平、识别瓶颈、确定机器利用率，并推荐产能扩展策略。

**提供两种使用方式 / Two Usage Modes:**
1. **Python 脚本版** - 通过Excel输入输出（`Planning_4.07_V1.py`）
2. **纯网页版** - 直接在浏览器中使用，无需服务器（`index.html`）

This tool implements a **Lean Work-In-Progress (WIP) and Capital Expenditure (CapEx) planning tool** for manufacturing processes. It calculates optimal WIP levels, identifies bottlenecks, determines machine utilization, and recommends capacity expansion strategies based on demand requirements and process parameters.

**Two Usage Modes:**
1. **Python Script** - Excel-based input/output (`Planning_4.07_V1.py`)
2. **Pure Web Version** - Direct browser usage, no server needed (`index.html`)

---

## 🎯 核心功能 / Key Features

- **三个月滚动需求预测 / 3-Month Rolling Demand Forecast:** 同时输入N+1~N+3月需求和天数，选项卡切换查看结果
- **多步骤工艺建模 / Multi-step Process Modeling:** 对具有多个连续操作的复杂生产线进行建模
- **OEE 分析 / OEE Analysis:** 计算设备综合效率（可用性 × 性能 × 质量）
- **天产能计算 / Daily Capacity Calculation:** 结合OEE、节拍和CV计算每日实际产能
- **在制品计算 / WIP Calculation:** 使用排队论（Kingman 公式）确定最优在制品水平
- **Handling Unit (HU) / 包装单位:** 定义每个工序完成后的最小标准包装，WIP以HU为单位计量
- **产能规划 / Capacity Planning:** 识别超载工位并计算所需增加的机器数量
- **建议排产天数 / Recommended Production Days:** 基于目标利用率计算每个工序的建议排产天数
- **累计良率 / Yield Accumulation:** 考虑整个工艺链中的质量损失
- **独立运输配置 / Independent Transport Configuration:** 每两个相邻工序间可独立配置运输时间和变异系数
- **瓶颈检测 / Bottleneck Detection:** 自动识别限制产能的工序
- **排产超限警告 / Schedule Exceeds Warning:** 当建议天数超过最大可排天数时，提示需增加的设备数
- **数据源标识 / Data Source Badge:** 预留MES/ERP系统对接接口
- **双语界面 / Bilingual UI:** 英文+中文双语显示，方便国际团队使用

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
│  3. 生成分析结果 (选项卡显示)                    │
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
| `openpyxl`| Excel 文件写入 |

**运行 / Run:**
```bash
python Planning_4.07_V1.py
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
| `handling_unit` | `int` | 包装单位（最小标准包装）/ Handling unit size |

#### 计算指标 / Calculated Metrics

| 指标 / Metric | 描述 / Description |
|--------|-------------|
| `effective_time` | 每件良品的有效加工时间 / Effective time per good part |
| `utilization` | 当前机器利用率 / Current utilization |
| `theoretical_capacity` | 理想条件下的最大产出 / Max output (ideal) |
| `effective_capacity` | 考虑 OEE 损失后的实际产能 / Realistic output |
| `oee_value` | 设备综合效率 (A×P×Q) / Overall Equipment Effectiveness |
| `day_capacity` | 天产能（考虑OEE和CV）/ Daily capacity (with OEE & CV) |
| `adjusted_demand` | 该工序必须加工的实际数量 / Actual qty to process |
| `cumulative_yield_to_end` | 从该工序到终点的累计良率 / Cumulative yield to end |
| `target_wip` | 推荐的总在制品水平（以HU为单位）/ Total recommended WIP (in HU) |
| `additional_machines` | 超载时需增加的机器数量 / Machines to add |
| `projected_utilization` | 产能扩展后的利用率 / Utilization after expansion |
| `recommended_days` | 建议排产天数 / Recommended production days |
| `is_overloaded` | 当前产能是否不足 / Is capacity insufficient |

---

## ⚙️ 核心算法 / Core Algorithm

### `calculate_wip_scenario(steps, demand, available_time, target_util, shifts_per_day, hours_per_shift)`

**用途 / Purpose:** 在制品和产能分析的核心计算引擎。

#### 参数 / Parameters
- `steps` (list): `ProcessStep` 对象列表 / List of ProcessStep objects
- `demand` (int): 目标生产数量 / Target production quantity
- `available_time` (float): 总可用生产时间（秒）/ Total available time (sec)
- `target_util` (float): 目标利用率 (0-1) / Target utilization rate
- `shifts_per_day` (int): 每日班次 / Shifts per day
- `hours_per_shift` (float): 每班工时 / Hours per shift

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
    
    # 天产能计算（考虑CV调整）
    cv_adjust_factor = max(0.5, 1 - s.cv_proc * 0.2)
    s.day_capacity = floor((seconds_per_day * s.oee_value * s.num_machines / s.std_proc_time) * cv_adjust_factor)
    
    # 建议排产天数
    recommended_days = ceil(raw_days / target_util)
    
    s.utilization = s.adjusted_demand / s.effective_capacity
    base_wip, queue_wip, total_wip = calc_wip_details(...)
    
    # WIP转换为HU单位
    s.wip_int = ceil(total_wip / s.handling_unit)
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

**3. 天产能 / Daily Capacity:**
```
天产能 = (每天秒数 × OEE × 机器数 / 节拍) × CV调整系数
Daily Capa. = (Seconds/Day × OEE × Machines / Cycle Time) × CV Adjustment

CV调整系数 = max(0.5, 1 - CV × 0.2)
CV越高，有效产能越低 / Higher CV reduces effective capacity
```

**4. 利用率 / Utilization:**
```
利用率 = 调整后需求 / 有效产能
Utilization = Adjusted Demand / Effective Capacity
```

**5. 建议排产天数 / Recommended Production Days:**
```
建议天数 = ceil(调整后需求 × 有效时间 / (机器数 × 目标利用率 × 每天秒数))
Rec. Days = ceil(Adj. Demand × Eff. Time / (Machines × Target Util × Seconds/Day))
```

**6. 在制品排队公式（Kingman 近似）/ WIP Queueing (Kingman's Approx.):**
```
等待时间 = [(CV_到达² + CV_加工²) / 2] × [ρ^(√(2(m+1)) - 1) / (1 - ρ)] × 有效时间
Wait Time = [(CV_arrival² + CV_process²) / 2] × [ρ^(√(2(m+1)) - 1) / (1 - ρ)] × Eff. Time

WIP (HU) = ceil(总在制品 / Handling Unit)
```

**7. 产能扩展 / Capacity Expansion:**
```
如果 / If 利用率 > 1.0:
    所需总机器数 = ceil(当前机器数 × 利用率)
    Total Machines = ceil(Current Machines × Utilization)
    需增加机器数 = 所需总数 - 当前数量
    Additional = Total Needed - Current
```

---

## 📊 默认配置 / Default Configuration

| 工序 / Process | C.T.(s) | 机器数 | 性能 | 可用 | 良率 | CV | HU |
|---------|--------|-------|------|------|------|-----|-----|
| 激光切割 / Laser Cutting | 300 | 2 | 0.90 | 0.95 | 0.98 | 0.3 | 50 |
| 人工焊接 / Manual Welding | 720 | 3 | 0.85 | 0.90 | 0.95 | 0.6 | 20 |
| 部件组装 / Component Assembly | 480 | 2 | 0.92 | 0.96 | 0.99 | 0.4 | 30 |
| 最终包装 / Final Packaging | 180 | 1 | 0.95 | 0.98 | 0.99 | 0.2 | 100 |

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

**排班限制 / Scheduling Constraints:**
- 每日班次 ≤ 3
- 每班工时 ≤ 12小时
- 3班制时，每班 ≤ 8小时

---

## 🚀 使用方法 / Usage

### 纯网页版 / Pure Web Version

**使用方法 / How to Use:**
1. **打开文件 / Open File:** 双击 `index.html`
2. **输入需求 / Enter Demand:** 填写N+1~N+3月的需求量和最大可排天数
3. **设置班次 / Set Shifts:** 配置每日班次、每班工时、目标利用率
4. **配置工序 / Configure Processes:** 填写每个工序的 C.T.、机器数、性能、可用、良率、CV、HU
5. **配置运输 / Configure Transport:** 点击每个工序后的"运输"按钮，启用并配置运输时间和CV（可选）
6. **执行计算 / Calculate:** 点击"Calculate / 执行计算"按钮
7. **查看结果 / View Results:** 通过选项卡切换查看N+1、N+2、N+3月的分析结果

**结果表格列说明 / Result Table Columns:**
| 列名 / Column | 说明 / Description |
|------|-------------|
| ID | 工序序号（运输步骤显示→） |
| Process Name | 工序名称（运输显示"起点→终点"） |
| C.T.(s) | 节拍时间（秒）/ Cycle time |
| OEE | 设备综合效率 / Overall Equipment Effectiveness |
| Day Capa. | 天产能（考虑OEE和CV）/ Daily capacity |
| Qual | 良率 / Quality rate |
| Adj. Demand | 需加工数量（含累计良率补偿）/ Adjusted demand |
| Machines | 当前机器数 / Current machines |
| Utilization | 当前利用率 / Current utilization |
| Add | 需增机器数 / Additional machines needed |
| Proj. Util. | 扩产后利用率 / Projected utilization after expansion |
| Rec. Days | 建议排产天数（⚠️=超限）/ Recommended days |
| HU | 包装单位 / Handling unit |
| Target WIP (HU) | 建议在制品（HU单位）/ Target WIP in HU |
| Status | 状态（🟢健康/🟡高风险/🔴超载） |

**独立运输配置 / Independent Transport Configuration:**
- ✅ 每个工序后都有可展开的运输配置行
- ✅ 可为每两个相邻工序设置不同的运输时间和变异系数
- ✅ 灵活开关控制，按需启用/禁用运输
- ✅ 动态路线标签，显示"从 [当前工序] 到 [下一工序]"

**数据源标识 / Data Source Badge:**
- 🟢 **M** = Manual（手动输入）
- 🔵 **MES** = 从MES系统获取（预留接口）
- 🟣 **ERP** = 从ERP系统获取（预留接口）
- 🟠 **CALC** = 计算值（预留接口）

**优势 / Advantages:**
- ✅ 无需安装 / No installation
- ✅ 无需服务器 / No server needed
- ✅ 本地计算 / Local computation
- ✅ 三个月滚动预测 / 3-month rolling forecast
- ✅ 即开即用 / Ready to use

---

## 📁 文件结构 / File Structure

```
项目目录 / Project Directory/
├── Planning_4.07_V1.py              # Python 主脚本 / Main Python script
├── index.html                       # 纯网页版（含三个月滚动预测+HU）/ Pure web version
├── WIP_CapEx_Input_Template.xlsx    # 输入配置（Python版生成）/ Input config
├── WIP_CapEx_Analysis_Result.xlsx   # 输出结果（Python版生成）/ Output results
├── WIP_CapEx_Analysis_Result.html   # HTML 报告（Python版生成）/ HTML report
└── Planning_4.07_V1.md              # 本说明文档 / This documentation
```

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

**CV对产能的影响 / CV Impact on Capacity:**
- CV越高，有效产能越低（波动导致效率损失）
- CV调整系数 = max(0.5, 1 - CV × 0.2)
- 例：CV=0.6 → 调整系数=0.88 → 天产能降低12%

### 建议排产天数 / Recommended Production Days

基于目标利用率计算的每个工序独立排产天数：
- 使该工序利用率接近目标值（默认85%）
- 避免设备过度闲置或超载
- 每个工序可有不同的建议天数

### 运输步骤 / Transport Steps

**每个运输步骤可以独立配置！**

- 运输时间：物料在工序间移动所需时间（秒）
- 运输CV：运输时间的变异系数，反映运输稳定程度
- 影响：运输时间会增加等待时间和在制品数量

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
2. **数据验证 / Data Validation:** 确保所有比率（性能、可用、良率）在 0 到 1 之间
3. **运输步骤 / Transport Steps:**
   - **Python版：** 在 Excel 模板的"Config_Settings"中设置全局运输时间，代码自动在所有相邻工序间插入
   - **网页版：** 每个运输步骤可独立配置，点击工序后的"运输"按钮启用
4. **排班限制 / Scheduling Constraints:**
   - 每日班次 ≤ 3
   - 每班工时 ≤ 12小时
   - 3班制时，每班 ≤ 8小时（自动调整并提示）
5. **边界情况 / Edge Cases:**
   - 利用率 ≥ 1.0 触发产能扩展建议
   - 建议天数超过最大可排天数时显示超限警告
   - WIP以HU为单位向上取整
   - 极端拥堵（利用率 → 1.0）导致非常高的在制品

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

### 排产超限警告 / Schedule Exceeds Warning

如果某工序的建议排产天数 > 最大可排天数：
- 显示⚠️标记和建议天数
- 提示需要增加的设备数量
- 黄色警告框列出所有超限工序

### 产能规划 / Capacity Planning

如果 / If `additional_machines > 0`：
```
新总机器数 / New Total = 当前 / Current + 新增 / Additional
预计利用率 / Projected Util. = (当前利用率 × 当前机器数) / 新总数
```

---

## 📝 版本历史 / Version History

- **v4.07 V2:** 
  - 三个月滚动需求预测 / 3-month rolling demand forecast
  - Handling Unit (HU) 包装单位 / Handling unit for WIP
  - 天产能计算 / Daily capacity calculation (with CV adjustment)
  - 数据源标识（MES/ERP接口预留）/ Data source badges
  - 选项卡式结果展示 / Tab-based results display
  - 目标利用率简化为单一输入 / Single target utilization input
  - 排班联动限制 / Shift-hours constraints

- **v4.07 V1:** 添加独立运输配置功能 / Added independent transport configuration
  - Python版：在Excel模板中设置全局运输时间，自动插入所有相邻工序间
  - 网页版：每个运输步骤可独立配置运输时间和变异系数

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

*更新日期 / Updated: 2026-04-08*
