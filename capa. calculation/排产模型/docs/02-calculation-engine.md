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

### 一周、整月与换型次数（2026-10-10 确认）

计划运作状态只定义一次。源窗口保留真实起止时钟，供跑线对照，也作为周内需要极端或复杂安排的日期。其余工作日只编一个平稳日。8 小时可选 1 至 3 班，12 小时可选 1 至 2 班。已开班次用生产、休息、换型、维护、计划停机排满；未开班次自动记为未排产，但不进入 Without breaks 分母。Without breaks 分母只等于各工作日排班分钟减去班次内休息。同一周里其他未复制源窗口的工作日套用这一天。非工作日两边都不进入。整周可以全部复制源窗口。整周 SA 由这两类工作日的分钟加总，不把百分比乘回周分钟。一周成立后，整月重复这一周的结构。

每周都会发生的换型留在复制源日或平稳日里，周 SA 和整月重复都带着它。一个月只发生一次、两次或三次的换型不放进被重复的那一周，只在月账记单次分钟和次数。月纯生产时间减去 `次数 × 单次分钟`。同一次换型只进一处。这几笔没有起止时钟，也不能当作跑线对照轴。

当前页面已按本节生成一周和整月预览，并在周账、月账下给出 Most likely：当前工站跑线里落在已开班次上的非计划停机分钟，除以观察到的班次数，再按源窗口日和平稳日各自的班数从 Best case 生产分钟扣除。分母与 Best case 相同。没有跑线时 Most likely 与 Best case 相同。正式跨工站产能仍未交付。

## 工站产出与路线件数换算（本地首段已接入）

进入本模块的是指定零件号的成品需求件数；整车需求到零件需求的 EBR/VR 换算由前置系统完成。对当前线性、单目标产出的路线：

```text
工站计划良品能力 = 计划生产分钟 × 60 ÷ 工站 CT × 工站 piecesPerCycle × P × Q
工序计划良品能力 = 同工序可用工站能力之和（本窗口按 100% 生产时间，不乘周/月占用比例）
工序所需产出件数 = 成品需求件数 × 本工序每成品所需产出件数
工序成品等效能力 = 工序良品能力 ÷ 本工序每成品所需产出件数
路线成品等效能力 = 各串行工序成品等效能力的最小值
```

Actual 使用完整同窗实录 OK 件数作相同的工序换算，并向下取整为完整成品件数；它是该窗口的路线等效产出上限，不代表已实际装成的成品，也不跨窗口抵扣 WIP 库存。缺少工序用量、单位或版本匹配时，保留工站/工序原单位结果，路线级结果不可计算，不能默认为 1:1。`piecesPerCycle` 只描述机台单循环产出，不能替代工序件数换算。良率 Q 与工序用量分别计算。工站 70% / 30% 一类占用只进入周或月的综合产能，不乘进本窗口的计划或实跑件数。当前只读取本地路线/阶段 BOM 对象，上游正式接口尚未接入。

## 1. 三版数据与排产两版

系统留下三版数据：

1. 纯排版只含计划动作：源窗口、平稳日、每周换型，以及一个月一次到三次的换型次数。
2. 真实跑线版记录实际起止、非计划中断、实际休息、实际节拍和实际产量，用来对照纯排版。
3. 第三版以纯排版为骨架，只写回跑线里被接受的部分。修订计划 CT 时，必须同时确认按新 CT 复核的 P。计划 SA 时间轴不随 CT、P、Q 改变。休息、换型、维护、计划停机和非计划中断不随这次发布改写时间轴。

排产同时使用两版，共用纯排版时间账和修订后的计划 CT：

- Best case 是最佳状态。可用时间来自纯排版，不含非计划停机。单件时间用修订后的计划 CT，性能和良率用与这份 CT 一起确认的计划 P、计划 Q。
- Most likely 使用同一份计划 CT，以及与该 CT 同时确认的计划 P。它另外纳入当前阶段躲不开的内容：按班次摊好的非计划停机预留，以及在计划 P、Q 之上再反写的部分。反写多少尚未确定，须与相关职能确认后再展开。真实跑线记录本身不直接变成排产数据。
- 修改计划 CT 时，必须同时确认一份按新 CT 复核过的 P，避免速度损失被 CT 和 P 各计一次。计划 SA 时间轴不随 CT、P、Q 改变。

### Best case SA

```text
planned_loss = setup + maintenance + planned_stop
best_case_sa_with_breaks = planned_production_minutes / day_minutes
best_case_sa_without_breaks = planned_production_minutes / (scheduled_minutes - planned_break)
```

周和月使用第 0 节的汇总分母。月生产分钟先重复整周，再减去只发生一次到三次的换型分钟。

说明：

- setup 是被安排的计划事件，不是异常损失。
- 不同生产日因排产内容不同，Best case SA 可以不同；日界以白班开班时刻而非午夜为准。
- Best case 不包含非计划中断。

### Most likely SA

```text
per_shift_unplanned_minutes = observed_unplanned_minutes / observed_shift_count
most_likely_production_minutes = max(0, best_case_production_minutes - per_shift_unplanned_minutes × shift_count)
```

With breaks 与 Without breaks 的分母和 Best case 相同，只替换生产分钟。

说明：

- Most likely 不能只保存一个百分比。每一笔预留都保留来源：category、station、shift、minutes、source、estimated flag。
- 预留不改写纯排版时间轴，也不进入 CT/P/Q 发布。
- 排产同时读取 Best case 和 Most likely。

### Actual SA

Actual SA 回看真实跑线，基于实际发生的计划动作和非计划中断。它不是排产输入。

```text
actual_loss = actual_planned_activity_loss + actual_abnormal_loss
actual_sa = (scheduled_minutes - actual_loss) / scheduled_minutes
```

说明：

- 跑线可以只覆盖源窗口的一段，但这段必须落在源窗口的标准时间轴上。
- 量产阶段的异常中断按定义的时间颗粒度反向生成 Actual SA。
- 数据来源优先级建议为：设备/MES/PLC/Andon 自动信号，其次人工标准事件记录，最后用产出与节拍缺口反推并标记为估算。

## 2. R&R 参数校准

R&R 不是把一段低 SA 覆盖到未来排产。跑线结果回到排产的方式分三路：修订计划 CT，并同时确认按新 CT 复核的 P，Best case 与 Most likely 都用这一对；Q 以及进一步的 P 反写只进入 Most likely，比例待职能确认；已归类的非计划中断按班次预留，只减少 Most likely 的生产分钟。

可发布到计划参数的对象：

- standard cycle time。
- performance rate。
- quality rate。

留在真实跑线版、不随 CT/P/Q 发布改写时间轴的对象：

- break、setup / changeover、maintenance、planned stop 的实际差异。
- equipment failure、tooling / fixture issue、logistics waiting、quality hold、labor / staffing issue。

写回流程：

```text
实测发现厂商建议 CT 达不到
  -> 修订计划 CT
  -> 必须同时确认按新 CT 复核的 P
  -> Best case 与 Most likely 都改用这一对 CT、P
  -> 计划 SA 时间轴不变

P、Q 的进一步反写
  -> 比例与相关职能确认后再定
  -> 只进入 Most likely

非计划中断
  -> 归类：category、station、shift、minutes、source、estimated
  -> 实跑分钟保持原记录
  -> 可补救分钟由相关职能确认，默认 0
  -> 进入排产分钟 = 已记录分钟 − 可补救分钟
  -> 每班预留 = 进入排产分钟 / 观察到的班次数
  -> 只从 Most likely 生产分钟扣除
  -> 不改时间轴，也不随 CT/P/Q 发布
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

排产同时使用两版 SA：

- Best case：纯排版分钟，配上已发布的 CT/P/Q。
- Most likely：同一套分钟和 CT/P/Q，再扣每个班次的非计划停机预留。
- Actual：只回看已经发生的跑线，不作为排产输入。

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
