# 排产产能参数工具

正式版入口：`formal.html`（本地服务地址：`http://127.0.0.1:8785/formal.html`）。`index.html` 是旧验证原型。

第一阶段最上方已接入可视化路线编排（本地验证路线可插入、重排和选站编辑）；独立界面示意见 `route-editor-demo.html`。正式路线仍只读，设备换绑未实现。

## 当前主流程

1. 工艺路线与工站：选择产品、工序及可用工站。
2. 标准 SA 设定：按工站记录最多 48 小时的计划时间段，建立 Best case 基准。
3. 现场 R&R 跟踪：对照同一工站基准记录生产段、OK/NOK 和节拍。
4. 参数校准与产能分析：复核当前草稿与标准基准，查看工艺、份额及批量预检。

当前第四阶段已提供计划/实际对账、参数建议的本地确认与 CT/P/Q 本地发布、同窗口产能试算和预检。标准 SA 页面已能把复制源日和一个平稳日合成一周，并按四周重复成整月；月内一至三次换型只从整月生产分钟扣除。Most likely 已在周账和月账下按班次预留，并按生产日生效的 CT/P/Q 换成当前工站件数，详见 `docs/04-development-roadmap.md`。本地发布只在当前会话有效，不等于正式主数据审批。

## 启动与检查

macOS 可直接双击项目根目录的 `启动排产产能工具.command`：脚本会构建计算引擎、选择空闲端口、启动本地服务并打开正式版页面。保持弹出的终端窗口开启；关闭窗口即停止本次服务。首次运行若缺少项目依赖，脚本会执行 `npm install`。

手动启动：在本目录运行 `npm run build`，然后运行 `npm run serve`。打开上述本地服务地址。检查命令为 `npm run check` 与 `npm test`。工序切换与同窗路线结果可用 `npm run test:browser` 在隔离的 Chrome 中回归；默认读取 macOS Chrome 路径，其他环境可设置 `CAPA_CHROME_PATH`。

## Cursor 任务包的末轮验证

所有当前及未来的 Cursor 任务包均遵循同一顺序：先核对任务包的范围与验收条件，再查看本轮代码差异及其相关依赖，接着检查已有测试证据和未覆盖的风险；仅在发现依赖影响、证据不足或异常时，按需扩大检查范围。不要为了“全面”而无目的地重复跑测试或扫描无关模块。交付时说明实际检查了什么、结果如何，以及哪些人工烟测或风险仍未完成。

## 文档

- `docs/04-development-roadmap.md`：当前工程计划和进度，继续开发先看这里。
- `docs/17-cursor-process-library.md`：当前 Cursor 任务包；独立工艺库与前置建档。代码已接入，5.17 待人工烟测。
- `docs/16-process-execution-equipment-architecture.md`：已确认的工艺库、逻辑执行单元与物理设备架构；设备换绑仍待实现。
- `docs/00-product-position.md`：产品定位与四阶段业务口径。
- `docs/06-local-access-runbook.md`：当前目录、启动命令与浏览器入口。
- `docs/07-smoke-test-runbook.md`：人工烟测步骤。
- `docs/15-cursor-local-process-route.md`：本地验证模式新增工艺、路线工序及工站分配。代码已接入，5.16 待人工烟测。清除本地验证路线不会删除工艺库。
- `docs/14-cursor-weekly-route-report.md`：路线周计划汇总与 A4 内部双页报告。代码已接入，5.15 A 段通过，B/C 段由用户后置。`report-preview.html` 仍只是静态版式示意。
- `docs/13-cursor-cycle-samples-ct-policy.md`：逐次节拍样本与 CT/P 建议边界。5.14 已于 2026-10-12 通过。窄屏不在本包。
- `docs/12-cursor-week-month-capacity.md`：当前工站周/月 Best case 与 Most likely 排产件数，5.13 已验收。
- `docs/11-cursor-independent-week-planning.md`：另编整周的原任务包。页面已改成平稳日与整月重复，5.12 已于 2026-10-11 通过。Most likely 的排产件数不在本包。
- `docs/10-cursor-operation-navigation-route-capacity.md`：上一轮工序导航与同窗路线能力任务包，5.8 已验收。
- `docs/06-cursor-task-packages.md`、`docs/08-cursor-task-packages.md`、`docs/09-rr-mvp-task-sequence.md`：历史任务包，不能代替当前工程计划。
