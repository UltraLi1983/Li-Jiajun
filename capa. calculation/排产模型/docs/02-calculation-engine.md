# 计算引擎边界


## 0. 生产日、排班分钟与班制

生产日从可配置的白班开班时间起算 24 小时，可连续记录 1–2 个生产日。每班为 8H/480 分钟或 12H/720 分钟；每日班数为班长的完整倍数。R&R 实际观察仍可只覆盖若干小时，不强制补足生产日。排班分钟不由用户手工输入，而由班长、每日班数和生产日数推导。

```text
day_minutes = 1440 × production_day_count
scheduled_minutes = shift_minutes × shifts_per_day × production_day_count
off_shift_minutes = day_minutes - scheduled_minutes
planned_production_minutes = scheduled_minutes - planned_break - setup - maintenance - planned_stop - other_scheduled_loss
SA_with_breaks = planned_production_minutes / day_minutes
SA_without_breaks = planned_production_minutes / (scheduled_minutes - planned_break)
```

说明：

- With breaks 包含未开班、计划休息及计划动作损失，是全天排产机会口径，不是 OEE。
- Without breaks 从分母排除非排班和**计划**休息；计划换型、维护、停机仍是开动损失。Actual 也必须保持同一计划分母，实际休息超时不得从分母再扣一次。
- 2 个 12H 班或 3 个 8H 班可覆盖完整生产日；少开班次形成非排班时间，不应误报为时间账空档。
- 计划良品能力应使用具体生产分钟和 CT/P/Q，不能把 `scheduled_minutes × SA_with_breaks` 当作可用分钟。周内“平均每班停机分钟”是产能表的单班输入，原始事件和逐班能力同时保留以供核对。
- 交接班、开班、复线或切换造成的时间损失不单列；应进入 setup / changeover 或对应 planned event。

### 周级汇总与日历机会

先由计划指定工作日；即使该日生产为零，也不能事后从工作日数中剔除。工作日从各自白班开班时刻起算 24 小时。按日汇总的生产、休息、换型、维护、停机及未排产分钟必须覆盖该日排班分钟，非排班分钟单列；不要求每个周级输入都有具体起止时钟。

```text
weekly_SA_with_breaks = sum(working_day_production_minutes) / (working_day_count × 1440)
weekly_SA_without_breaks = sum(working_day_production_minutes) / (sum(working_day_scheduled_minutes) - sum(working_day_planned_break_minutes))
weekly_calendar_utilization = sum(weekly_production_minutes) / (7 × 1440)
```

无计划工作日或无有效排班分母时，相应 SA 不可计算，不以零代替。With breaks 包含已指定工作日内的非排班，却不把整周停工日算进分母；整周日历利用率才包含停工日，用于展示增开工作日/班次的机会，不能冒充原表 SA。原始表按每周班数选择 5/6 个工作日，默认工作日由 2×12H 或 3×8H 排满；8H×2 班与班内未排产是本系统的扩展口径。

## 1. SA 三视角

计算引擎同时维护三套 SA 视角。它们使用同一套日历和事件事实，但服务不同业务决策。

### Best case SA

Best case SA 只使用已安排、可解释、可进入计划的 planned activity。它是生产计划和 APS 的基础能力输入。

```text
planned_loss = setup + maintenance + planned_stop
best_case_sa_with_breaks = planned_production_minutes / day_minutes
best_case_sa_without_breaks = planned_production_minutes / (scheduled_minutes - planned_break)
```

说明：

- setup 是被安排的计划事件，不是异常损失。
- 不同生产日因排产内容不同，Best case SA 可以不同；日界以白班开班时刻而非午夜为准。
- Best case SA 不包含 R&R 或量产过程中偶发的异常损失。

### Most likely SA

Most likely SA 在 Best case SA 基础上叠加已观测异常损失的风险结构，用于产能模拟、风险提示和缓冲建议。

```text
expected_abnormal_loss = sum(abnormal_loss_source.minutes * weight)
most_likely_sa = (scheduled_minutes - planned_loss - expected_abnormal_loss) / scheduled_minutes
```

说明：

- Most likely SA 不能只保存一个百分比。
- 每一份 expected abnormal loss 都必须保留来源结构：category、station、shift、date/time bucket、minutes、source、estimated flag。
- Most likely SA 不应自动写入 APS 的基础排产约束，除非业务明确选择按风险能力排产。

### Actual SA

Actual SA 用于 R&R 或量产实绩复盘。它基于真实发生的 planned activity 和 abnormal loss 回算。

```text
actual_loss = actual_planned_activity_loss + actual_abnormal_loss
actual_sa = (scheduled_minutes - actual_loss) / scheduled_minutes
```

说明：

- Actual SA 是回看口径，不是默认计划口径。
- 量产阶段的异常中断应按定义的时间颗粒度反向生成 Actual SA。
- 数据来源优先级建议为：设备/MES/PLC/Andon 自动信号，其次人工标准事件记录，最后用产出与节拍缺口反推并标记为估算。

## 2. R&R 参数校准

R&R 不是把一段低 SA 覆盖到未来排产，而是把现场观察转为参数建议。

R&R 校准对象：

- setup / changeover 标准耗时。
- break 标准耗时与复线节奏。
- maintenance 标准耗时与窗口。
- planned stop 标准耗时。
- standard cycle time 和 performance rate。
- quality rate。

R&R 观察对象：

- equipment failure。
- tooling / fixture issue。
- logistics waiting。
- quality hold。
- labor / staffing issue。

校准流程：

```text
R&R observation
  -> compare planned standard vs observed minutes
  -> generate parameter calibration proposal
  -> approval
  -> new effective planned activity standard
```

异常损失流程：

```text
abnormal loss observation
  -> restore physical scenario
  -> classify category / station / shift / time bucket
  -> feed Most likely SA source structure
  -> improvement action / owner
```

## 3. 分段产出与隐藏时间损失识别

原 `Capacity record & calculation` 的分段产出计算，需要在正式软件中保留为 R&R 记录能力，而不是塞进计划时间轴编辑器。

基础计算：

```text
segment_elapsed_minutes = output_record.end_at - output_record.start_at
segment_average_pace_sec = segment_elapsed_minutes * 60 / actual_qty
```

当该段存在可信的 cycle check 时：

```text
observed_cycle_sec = average(credible_cycle_samples)
recorded_production_minutes = sum(production_state_minutes within segment)
expected_qty = recorded_production_minutes * 60 / observed_cycle_sec
missing_qty = max(0, expected_qty - actual_qty)
estimated_hidden_loss_minutes = missing_qty * observed_cycle_sec / 60
```

判定逻辑：

- 如果 cycle check 支持 observed cycle 正常，而 segment average pace 明显慢于 observed cycle，优先怀疑状态账漏抓 SA 损失。
- 这种情况不应直接把 performance rate 调低；应生成 `HiddenLossFinding`，提示反查未记录的 waiting、短停、复线损失或其他 abnormal interruption。
- 确认后的损失应归入具体 abnormal category；未确认前只能作为 Actual SA 的估算来源，并带 `isEstimated` 或证据等级。
- 如果 cycle check 同时显示 observed cycle 变慢，则 performance rate 和 SA 需要共同检查，不能只靠分段产出反推。

这条能力的核心目的，是把“产出比预期少”拆解成两类问题：真实运行速度问题，或时间状态账未抓住的问题。

## 4. required minutes

每个订单经过产品路径，被拆成各工站需求分钟：

```text
required_good_qty = order_qty * part_share
required_gross_qty = required_good_qty / quality_rate
required_minutes = required_gross_qty * cycle_sec / 60 / performance_rate
```

在 run-rate 视角下，performance rate 可以由节拍抽检反推：

```text
observed_performance = standard_cycle_sec / observed_cycle_sec
```

说明：

- performance rate 与 quality rate 不应被合并成一个 OEE 黑箱。
- cycle check 用于验证 performance，OK/NOK 用于验证 quality。
- SA、performance、quality 的校准周期可以不同。

## 5. station capacity

```text
best_available_minutes = planned_production_minutes * project_share
                       = day_minutes * SA_with_breaks * project_share
                       = (scheduled_minutes - planned_break) * SA_without_breaks * project_share
capacity_gap = best_available_minutes - required_minutes * (1 + buffer_rate)
```

不同视角使用不同 SA：

- 排产基础能力：使用 Best case SA。
- 风险模拟能力：使用 Most likely SA。
- 实绩复盘能力：使用 Actual SA。

输出产能结论时，应同时展示 Best case、Most likely 和 Actual 的差异，而不是只展示一个实测产能数字。

## 6. aggregation policy

必须同时保留：

- day-level SA
- shift-level SA
- station-level weekly SA
- Most likely SA source structure
- order/route-level required minutes
- bottleneck station
- best case vs most likely vs actual gap

不要只输出一个平均 OEE，也不要只输出一个不可解释的 SA 百分比。
