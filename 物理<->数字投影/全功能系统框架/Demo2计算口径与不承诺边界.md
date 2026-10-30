# Demo2 计算口径与不承诺边界

> 版本：`demo2-calc-boundary-v0.1-2026-08-31`  
> 状态：开发前边界说明  
> 关联：`Demo2-物理数字孪生与运营优化独立定义.md`

---

## 1. 总原则

Demo2 第一版的计算口径是：

> 售前 rough 计算，用于识别改善机会和解释改善方向，不用于直接生成工程实施图或现场最终作业标准。

必须做到：

- 公式可解释；
- 假设可见；
- 输入可调整；
- 输出可复算；
- 不夸大精度。

---

## 2. 第一版可以承诺的计算

| 计算项 | 第一版口径 |
|---|---|
| 距离 | 基于 Layout 标注点、路径和比例尺计算 |
| 单趟运输时间 | 距离 / 速度 + 装卸时间 + rough 干涉系数 |
| 运输工具需求 | 基于任务频次、单次载荷、可用率 rough 计算 |
| HU 数 | PartQty / QtyPerHU 向上取整 |
| bin 位数 | HUQty / 单 bin 可容纳 HU 向上取整 |
| 存储面积 | HU footprint、堆叠层数、作业空间 rough 估算 |
| 三水位 | Min / Operating / Max rough 计算 |
| WIP 最小值 | 基于下工序连续生产需要反推 |
| 扩产约束风险 | 生产、空间、运输、交通四类 rough 判断 |
| ROI / 年化收益 | 基于改善 KPI 的估算，不作为财务承诺 |

---

## 3. 第一版不承诺的内容

| 不承诺项 | 原因 |
|---|---|
| CAD / DXF 自动解析 | 第一版以背景图 + 人工标注为主 |
| 工程级 Layout 精度 | 售前资料与现场偏差不可控 |
| 最终可施工仓储方案 | 需要现场测量、消防、承重、安全校核 |
| 高精度交通仿真 | 需要更完整路线、规则和实时状态 |
| 多车实时调度 | 属于 WCS / 调度系统能力 |
| 自动避让 / 会车 / 让行 | 第一版只做 rough 干涉估算 |
| 实时设备接入 | 第一版不接入真实硬件 |
| APS 排程优化 | 第一版只做生产日历换算 |
| 人员效率优化 | 第一版不采集人员数据 |
| 财务收益承诺 | 第一版只提供售前估算 |

---

## 4. 面积口径

面积优先来自 Layout 标注。

```text
CalculatedArea = 标注边界 × 比例尺
EffectiveArea = OverrideArea ?? CalculatedArea
```

解释：

- `CalculatedArea`：系统根据标注边界和比例尺算出；
- `OverrideArea`：用户现场校准后手工覆盖；
- `EffectiveArea`：后续计算实际使用的面积。

仓储区面积、线边面积、超市区面积、WIP 区面积、高位货架占地区域都应采用同样口径。

---

## 5. 时间口径

第一版：

```text
EffectiveHoursPerShift = 人工输入的简化有效生产工时
```

正式版：

```text
EffectiveHoursPerShift
← PlannedEffectiveProductionTimePerShift
← SystemAvailabilityWithBreaks
```

第一版必须说明：`EffectiveHoursPerShift` 是暂用字段，不是正式系统的终态模型。

---

## 6. HU 口径

必须区分：

```text
QtyPerHU = 一个 HU 内容纳多少零件
HUQty = 某一位置需要 / 当前 / 最多 / 可容纳多少个 HU
```

禁止把“每箱多少件”和“现场放几箱”混用。

---

## 7. WIP 口径

WIP 的计算目标：

> 支持下工序连续生产的最小 HU 缓冲。

第一版公式：

```text
WIPMinHUQty
= ceil(
  DownstreamConsumptionRate × CoverageTime × SafetyFactor
  / QtyPerHU
)
```

WIP 不应被表达为“上工序多生产一点放着更安全”。

---

## 8. 运输动画边界

第一版做：

- 运输工具沿路线移动；
- 单车 / 多车任务动画；
- Baseline vs Proposed 路线变化；
- 通道压力 rough 热力；
- 响应时间变化。

第一版不做：

- 实时调度；
- 自动避让；
- 会车让行；
- WCS 控制；
- 真实交通仿真。

正式口径：

> 第一版展示的是 Transport Task Animation，不是 Traffic Simulation。

---

## 9. 高位货架与立面边界

第一版支持：

- Rack / Level / Lane / SkuSlot；
- 主仓库高位货架；
- 超市区料架 / 料道；
- 线边料架；
- HU 水位；
- 物理容量；
- rough 拣料时间。

第一版不承诺：

- 消防合规；
- 地面承重校核；
- 叉车安全通道工程设计；
- 货架供应商施工图；
- 精确拣选动作仿真。

---

## 10. 售前表达边界

可以说：

> 系统可以基于客户 Layout 和运营参数，识别路线、仓储、线边库存、WIP 和运输工具配置的改善机会。

不要说：

> 系统已经自动生成可施工的最终仓储规划，或具备真实 AGV 调度控制能力。

