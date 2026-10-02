# Cursor 交接任务包

> 本文件记录早期已完成任务包 A-F，后续工程顺序以 docs/04-development-roadmap.md 的“标准窗口投影的实施任务”和“本模块的后续工程顺序（R3-1 至 R3-5）”为准。

本文档用于让 Cursor 在较少上下文下继续开发。当前项目已经从 demo 讨论进入正式版工程化阶段。

## 0. 当前项目状态

项目位置：

```text
/Users/lijiajun/Documents/GitHub/python-document/capa. calculation/排产模型
```

当前入口：

- 旧 Demo：`index.html`
- 正式版工程壳：`formal.html`
- 正式版 UI 入口：`src/ui/formal-app.ts`
- 领域模型：`src/domain/types.ts`
- 示例数据：`src/domain/sample-data.ts`
- 核心计算：`src/engine/`

当前验证命令：

```bash
cd "/Users/lijiajun/Documents/GitHub/python-document/capa. calculation/排产模型"
npm run check
npm test
npm run build
npm run serve
```

正式版访问：

```text
http://127.0.0.1:8785/formal.html
```

当前测试状态：

```text
51 tests
16 suites
fail 0
```

## 1. 关键业务结论

1. 正式版不是从 R&R 直接开始，而是从 Product / Route / Operation / Station Assignment 的前置配置开始。
2. Product 必须先完成 Routing，才允许进入 capacity analysis。
3. Operation 必须绑定具体 station，不能只绑定 capability group。
4. 一个 operation 可以有多个 station assignment，例如 primary / parallel / backup。
5. backup 必须维护启用条件；如客户认可 gate 开启，则未批准前必须 blocking。
6. Performance rate 和 Quality rate 保留，但初始默认 100%。后续由 R&R / historical actual 校准。
7. setup / changeover 是序列相关损失，不是固定平均损失。
8. planned activity rule 是可复用标准，但不能写死；也允许没有 rule，只用 schedule / manual。
9. capacity share 分为 requested / required / actual。
10. batch 以最小工序完成品 HU 的整倍数为基准；非整倍数走 exception approval。
11. R&R 是验证活动和证据包，不是长期生产对象。
12. Most likely SA 不能只存百分比，必须保留 abnormal source structure。

## 2. 当前已完成的正式版核心

已完成 engine：

- `readiness-engine.ts`：Product readiness gate
- `routing-configuration-engine.ts`：正式 UI 可消费的 Product / Routing / Station Assignment view
- `analysis-summary-engine.ts`：capacity analysis preflight 汇总
- `capacity-share-engine.ts`：requested / required / actual share 计算和风险
- `batch-hu-engine.ts`：HU / batch policy 检查
- `approval-gate-engine.ts`：customer approval gate release
- `demand-engine.ts`：weekly demand / annual demand / manual scenario / orders fallback
- `planned-activity-engine.ts`：approved planned activity rule 展开
- `timeline-engine.ts`：timeline overlap / gap / unscheduled
- `run-rate-segment.ts`：production segment observed CT / hidden loss
- `calendar-sa.ts`：planned SA / real SA
- `setup-matrix.ts`：sequence setup event
- `capacity-engine.ts`：station capacity result

## 3. 任务包 A：正式版启动页改造

状态：已完成。

完成内容：

- `formal.html` 首屏已改为 `Product Routing Setup`。
- 左侧流程为 Product、Route、Operation、Station Assignment、Parameter Check、Capacity Analysis。
- Product selector / Route selector / Route status / Operation list 已接入。
- 点击 operation 后展示 station assignment 与参数详情。
- Capacity Analysis 已后移为 summary / preflight，不再抢占第一屏。

目标：把 `formal.html` 从“直接展示 Product A 结果页”改成正式版启动流程。

范围：

- 修改 `formal.html`
- 修改 `src/ui/formal-app.ts`
- 不修改 `index.html`
- 不重构 `src/engine`，除非 UI 必须增加轻量 view helper

业务要求：

1. 第一屏名称建议为 `Route Setup` 或 `Product Routing Setup`。
2. 顶部/左侧流程建议为：Product、Route、Operation、Station Assignment、Parameter Check、Capacity Analysis。
3. 第一屏应包含 Product selector、Route selector、Route status、Operation list。
4. Operation list 要显示 station assignment completeness 和 parameter completeness。
5. 选择某个 operation 后，展示 primary / parallel / backup station assignment、planningAllowed、customer approval gate、standard CT、pieces/cycle、P rate / Q rate。
6. `Capacity Analysis` 面板可以保留，但应放在后面或作为 summary，不应抢占第一屏。

验收标准：

```bash
npm run check
npm test
npm run build
npm run serve
```

打开：

```text
http://127.0.0.1:8785/formal.html
```

应看到正式版从 Product / Route 选择开始，而不是直接进入结果展示。

## 4. 任务包 B：Product / Route / Operation mock 编辑态

状态：已完成。

完成内容：

- Product card 支持 local in-memory mock edit：productId、projectId、version、weeklyDemand、demandScenario。
- ProductId 修改会同步当前页面会话中的 route / assignment / share / policy / order 引用。
- Route card 展示 routeId、productId、operation count、route status。
- Operation table 展示 sequence、operationId、name、processType、digitalTwinNodeId、predecessor / successor，并支持部分 mock edit。
- 页面已用 master data、calculated / checked result、blocking issue 标签区分信息性质。

目标：在正式版 UI 里补齐前置配置的“可编辑样式”，先不要求真实持久化。

范围：

- `src/ui/formal-app.ts`
- 如必要，可新增 `src/ui/state.ts`
- 暂不引入 React / Vue，除非明确决定重建前端工程

业务要求：

1. Product card 支持展示和模拟编辑：productId、projectId、version、weeklyDemand、demandScenario。
2. Route card 支持展示：routeId、productId、operation count、route status。
3. Operation table 支持展示：sequence、operationId、name、processType、digitalTwinNodeId、predecessor / successor。
4. 编辑态先用 local in-memory state，不需要写回文件。
5. 页面上要明确区分 master data、calculated / checked result、blocking issue。

验收标准：

- 切换 Product 后，Route / Operation / Assignment 视图同步变化。
- TypeScript check 通过。
- 现有 32 条测试仍通过。

## 5. 任务包 C：Station Assignment 专项页

状态：已完成。

完成内容：

- 新增 `Station Assignment Configuration / 工站分配专项页`。
- 对每个 operation 展示多个 station assignment。
- 每个 assignment 展示 stationId / station name、role、allocationMode、plannedShare、planningAllowed、customerApprovalRequired、approvalStatus、backupCondition、planningBlockerReason。
- OP10C / Future Machining 03 因 customer approval pending 显示为 blocking。
- OP20 primary 显示可用。

目标：把 station assignment 从“结果卡片”变成正式配置页。

业务要求：

1. 对每个 operation 展示多个 station assignment。
2. 每个 assignment 显示 stationId / station name、role、allocationMode、plannedShare、planningAllowed、customerApprovalRequired、approvalStatus、backupCondition、planningBlockerReason。
3. backup station 必须突出显示前置条件。
4. customer approval pending 时，必须显示为 blocking，而不是 warning。
5. parallel station 要展示 plannedShare 或 forecast calculated 状态。

验收标准：

- OP10 可看到 OP10 primary、OP10B parallel、OP10C backup。
- OP10C 状态为 blocked，原因包含 customer approval pending。
- OP20 primary 可用。

## 6. 任务包 D：Parameter Check / Preflight 页面

状态：已完成。

完成内容：

- `runCapacityAnalysisPreflight()` 已渲染为正式 Parameter Check / Capacity Preflight 页面。
- 展示 readiness ready / blocked、blockers、warnings、readiness issue、capacity share evaluation、batch HU check。
- Hard blockers 会禁用 `Enter Capacity Analysis`。
- Warnings 保留显示但允许继续。
- Capacity share table 展示 operationId、stationId、requested share、required share、actual share、risk status、risk message。
- HU policy check 展示 operationId、planned quantity、minimum process HU、batch multiple、status、suggested quantity。

目标：把 `runCapacityAnalysisPreflight()` 做成正式版 capacity analysis 前的检查页。

业务要求：

1. 页面明确展示 readiness ready / blocked、blockers、warnings、share evaluation、batch HU check。
2. blockers 必须阻止进入 capacity analysis。
3. warnings 可以允许继续，但要保留说明。
4. capacity share table 至少展示 operationId、stationId、requested share、required share、actual share、risk status。
5. HU policy check 至少展示 operationId、planned quantity、minimum process HU、batch multiple、status、suggested quantity。

验收标准：

- Product A 当前应 ready，但有 backup blocked warning / message。
- op-a-10 quantity 250 应触发 HU exception approval。
- 删除 OP20 parameter 的测试场景仍能通过 engine 测试。

## 7. 任务包 E：正式版 UI 自动 smoke test

状态：已完成。

完成内容：

- 新增 `test/formal-ui-smoke.test.mjs`。
- 使用 Node 内置 HTTP server 和 fetch，不引入 Playwright 或额外依赖。
- `npm test` 会覆盖 `formal.html`、`dist/ui/formal-app.js`、`dist/domain/sample-data.js` 的 200 检查。
- 自动检查关键文本：Product Routing Setup、Station assignment configuration、Parameter check / capacity preflight、Product A Housing、Future Machining 03、Customer approval pending。

目标：给 `formal.html` 增加最小浏览器 smoke test，确认页面不是空白，关键文本存在。

建议方案：

- 轻量方案：使用 Node 内置 fetch 检查 `formal.html` 和 `dist/ui/formal-app.js` 返回 200。
- 更强方案：引入 Playwright，检查页面上存在 Product Routing Setup、Product A Housing、Machining 01、Future Machining 03、Customer approval pending。

注意：如果引入 Playwright，需要更新 package 依赖，可能会增加安装成本。

验收标准：

- `npm test` 或新脚本可以覆盖正式版页面最小可访问性。
- 不影响现有核心测试；当前总计 32 条测试通过。

## 8. 任务包 F：文档整理

状态：已完成。

完成内容：

- 已同步 `docs/04-development-roadmap.md`、`docs/06-local-access-runbook.md`、`docs/07-smoke-test-runbook.md` 和本文档。
- 已记录 A / C / D / B / E 完成内容、启动方式、测试方式和剩余问题。

目标：让后续任何 IDE / agent 都能低上下文接手。

需要同步：

- `docs/04-development-roadmap.md`
- `docs/06-local-access-runbook.md`
- `docs/07-smoke-test-runbook.md`
- 本文件 `docs/08-cursor-task-packages.md`

每完成一个任务包，应记录改了哪些文件、新增了哪些业务能力、如何启动、如何测试、当前剩余问题。

当前剩余问题：

- R0 入口稳定化修复已完成：B-Housing 切换不再因 hardcoded `op-a-10` 崩溃；Route selector 已能传入 selected routeId 驱动 routing view。
- Mock edit 只在页面内存中生效，刷新后恢复样例数据。
- 正式版仍未引入 React / Vue 等前端框架，当前以原生 TypeScript 渲染为主。
- 自动 UI smoke test 目前是轻量 HTTP / 文本检查，还不是完整浏览器交互测试。
- `npm run serve` 当前固定使用 `8785`；如端口被旧服务占用，需要手动停止旧进程或换端口。

## 9. 禁止事项 / 边界

1. 不要再继续扩展旧 demo `index.html`，除非只是修复访问问题。
2. 不要把 R&R 作为正式版一级启动对象。
3. 不要把 operation 只绑定 capability group；operation 必须最终落到 station assignment。
4. 不要把 OEE 存成单一百分比，必须保留 SA / Performance / Quality 分拆。
5. 不要把 unplanned interruption 直接平均塞回 SA，必须保留 source structure。
6. 不要把 setup 简化成固定损失，后续应按 sequence / changeover rule 计算。
7. 不要把 unscheduled / not planned 当作 open capacity。
8. 不要删除现有 smoke tests。

## 10. 推荐执行顺序

建议 Cursor 按以下顺序执行：

1. 任务包 A：正式版启动页改造
2. 任务包 C：Station Assignment 专项页
3. 任务包 D：Parameter Check / Preflight 页面
4. 任务包 B：Product / Route / Operation mock 编辑态
5. 任务包 E：正式版 UI 自动 smoke test
6. 任务包 F：文档整理

原因：先把正式版主流程调整正确，再补编辑态。否则会在错误的信息架构上做太多无效页面。
