# 计算引擎边界


## 0. scheduled minutes 与班制

scheduled minutes 不由用户手工输入，而由班制、排产计划和未排产窗口推导。

```text
shift_end = shift_start + shift_duration
scheduled_minutes = sum(planned_operation_windows) - unscheduled_not_planned_minutes
```

说明：

- 2 班制不等于固定 16H，也可以是 12H + 12H 覆盖完整 24H。
- 班次只需要定义开始时间和持续时长，结束时间由系统推导。
- 计划运行分钟不作为手工输入字段，避免使用者重复定义同一件事。
- 交接班、开班、复线或切换造成的时间损失不单列；应进入 setup / changeover 或对应 planned event。

## 1. SA 三视角

计算引擎同时维护三套 SA 视角。它们使用同一套日历和事件事实，但服务不同业务决策。

### Best case SA

Best case SA 只使用已安排、可解释、可进入计划的 planned activity。它是生产计划和 APS 的基础能力输入。

```text
planned_loss = setup + break + maintenance + planned_stop
best_case_sa = (scheduled_minutes - planned_loss) / scheduled_minutes
```

说明：

- setup 是被安排的计划事件，不是异常损失。
- 不同自然日因排产内容不同，Best case SA 可以不同。
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
available_minutes = scheduled_minutes * SA * project_share
capacity_gap = available_minutes - required_minutes * (1 + buffer_rate)
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
