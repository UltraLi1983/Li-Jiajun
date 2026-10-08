# R&R MVP Cursor 执行任务序列

> 历史任务记录：本文件描述早期 P1-A 等任务，不再代表当前开发主流程。当前四阶段流程及后续范围以 `docs/00-product-position.md`、`docs/04-development-roadmap.md` 和 `docs/06-cursor-task-packages.md` 为准。

本文档用于让 Cursor 按小任务包逐步开发当前程序。不要一次性实现完整 APS，也不要一次性实现所有 R&R 功能。每完成一个任务包后，先停止，运行检查，再让用户回到 Codex 做验收。

## 当前产品目标

当前目标不是完整 APS，而是实现：

On-site R&R 矫正生产核心参数工具。

核心闭环：

Product / Route / Operation / Station
-> Planned SA Input
-> Best case SA / Best case capa
-> R&R observation
-> Actual SA / Performance calibration
-> Most likely SA / Most likely capa

## 当前工程状态

项目路径：

/Users/lijiajun/Documents/GitHub/Li-Jiajun/capa. calculation/排产模型

正式版入口：

formal.html
src/ui/formal-app.ts

旧 demo：

index.html

不要继续扩展旧 demo，除非只是修访问问题。

当前检查命令：

npm run check
npm test

当前基线：

34 tests
fail 0

## 已完成

- Product / Route / Operation / Station Assignment 前置配置
- primary / parallel / backup / customer approval gate
- Station Assignment Configuration 页面
- Parameter Check / Capacity Preflight 页面
- Product / Route / Operation mock edit
- Routing configuration view engine
- Capacity analysis preflight engine
- timeline validation engine
- calendar SA engine
- production segment calculation engine
- formal UI smoke test
- R0 bugfix：B-Housing 切换不再因 hardcoded op-a-10 崩溃
- R0 bugfix：Route selector 已能传入 selected routeId 驱动 routing view

## 总体执行规则

1. 每次只执行一个任务包。
2. 完成任务包后立刻停止，不要自动做下一个任务包。
3. 必须运行：
   - npm run check
   - npm test
4. 不要修改 index.html。
5. 不要做 APS。
6. 不要做自动排产。
7. 不要把 production 算作 SA loss。
8. 不要把 unscheduled / not planned 当作 open capacity。
9. 不要把 R&R actual loss 直接写入 planned baseline。
10. 不要删除现有 tests。

## 当前任务包：P1-A Planned SA Input Layer 基础骨架

### 目标

在正式版 formal.html 中新增 Planned SA 输入区块，用于展示计划动作和 Best case SA 的基础计算。

本任务只做：

- 基础 UI 区块
- 默认 planned activity 数据
- summary 计算
- timeline validation 展示

本任务不做：

- 复杂编辑
- 拖拽
- R&R segment record
- cycle check
- APS
- 自动排产

### 修改范围

允许修改：

- formal.html
- src/ui/formal-app.ts
- test/formal-ui-smoke.test.mjs

如确实需要，可新增轻量 helper，但优先不要新增文件。

禁止修改：

- index.html

### 新增区块名称

Planned SA Input / Calendar Setup

### 放置位置

放在 Station Assignment Configuration 之后，Parameter Check / Capacity Preflight 之前。

### 默认 planning window

第一版默认：

- window type = singleDay
- scheduled minutes = 1440
- horizon minutes = 1440

本任务暂不做真实日期选择。
本任务暂不做跨天。

### 默认 planned activity events

使用不跨天样例：

1. production: 08:30-11:00
   - startMinute = 510
   - endMinute = 660

2. break: 11:00-11:30
   - startMinute = 660
   - endMinute = 690

3. production: 11:30-17:00
   - startMinute = 690
   - endMinute = 1020

4. break: 17:00-17:30
   - startMinute = 1020
   - endMinute = 1050

5. production: 17:30-19:00
   - startMinute = 1050
   - endMinute = 1140

6. setup: 19:00-21:00
   - startMinute = 1140
   - endMinute = 1260

stationId：优先使用当前 selected operation 的第一个 planning-allowed station。若没有 selected operation，则使用当前 route 中第一个 planning-allowed station。若都没有，可用 OP10 作为 fallback。

productId：当前 selected product。

### Planned activity kind

支持以下 kind：

- production
- setup
- break
- maintenance
- plannedStop
- unscheduled

### Planned activity 表格字段

需要展示表格，字段至少包括：

- event id
- stationId
- kind
- startMinute
- endMinute
- duration min，系统计算
- label / note

本任务只需要展示，不要求编辑。

### Best case SA 计算规则

planned loss kinds：

- setup
- break
- maintenance
- plannedStop

production 不算 loss。
unscheduled 不算 open capacity。
unscheduled / not planned 不进入可用产能。

计算字段：

scheduled_minutes = horizon minutes

production_minutes = sum duration where kind = production

planned_loss_minutes = sum duration where kind in setup / break / maintenance / plannedStop

unscheduled_minutes = horizon - production_minutes - planned_loss_minutes

best_case_available_minutes = scheduled_minutes - planned_loss_minutes - unscheduled_minutes

best_case_sa = best_case_available_minutes / scheduled_minutes

说明：

第一版中 best_case_available_minutes 实际等于 production_minutes。这样做是为了明确：未排产时间不是 open capacity。后续 P1-B 再扩展 planned operation window。

### Summary cards

新增 summary cards：

- Scheduled min
- Production min
- Planned loss min
- Unscheduled min
- Best case available min
- Best case SA

### Validation panel

使用已有 timeline engine：

- validateTimelineEvents
- findTimelineGaps

展示 validation panel，至少覆盖：

- overlap
- invalid boundary
- outside horizon
- gap warning

gap 是 warning，不一定是 blocker。

本任务不要求 Fill gaps 按钮。

### UI 验收

打开：

http://127.0.0.1:8785/formal.html

应看到：

- Planned SA Input / Calendar Setup
- planned activity 表格
- Scheduled min
- Production min
- Planned loss min
- Unscheduled min
- Best case available min
- Best case SA
- timeline validation result

### 测试要求

扩展 test/formal-ui-smoke.test.mjs。

至少检查 formal UI 编译产物或 HTML 中存在：

- Planned SA Input / Calendar Setup
- Best case SA
- Planned loss
- Unscheduled

必须通过：

npm run check
npm test

当前基线：

34 tests
fail 0

完成后 tests 数量可以是 34 或更多，但必须全部通过。

### 完成后停止

完成 P1-A 后，不要继续做 P1-B。

请输出：

- 修改了哪些文件
- 新增了哪些功能
- npm run check 结果
- npm test 结果
- 是否有遗留问题

然后等待用户回到 Codex 做验收。

## 后续任务预告，不要现在做

P1-B：Planned SA Input 编辑态
- Add production / setup / break / maintenance / planned stop
- Fill gaps as unscheduled
- 表格编辑 start/end/kind/note

P1-C：24H / 48H / custom horizon
- 支持 1H 到 48H
- 支持跨天显示

P2：Best Case Capacity Calculation View
- Planned SA + CT + pieces/cycle + P/Q
- 输出 Best case capa

R1：R&R Scope Setup
- Time-window R&R，用于 SA calibration
- Cycle-check R&R，用于 Performance calibration
