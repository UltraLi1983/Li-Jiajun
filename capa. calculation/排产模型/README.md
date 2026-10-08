# 排产产能参数工具

正式版入口：`formal.html`（本地服务地址：`http://127.0.0.1:8785/formal.html`）。`index.html` 是旧验证原型。

## 当前主流程

1. 工艺路线与工站：选择产品、工序及可用工站。
2. 标准 SA 设定：按工站记录最多 48 小时的计划时间段，建立 Best case 基准。
3. 现场 R&R 跟踪：对照同一工站基准记录生产段、OK/NOK 和节拍。
4. 参数校准与产能分析：复核当前草稿与标准基准，查看工艺、份额及批量预检。

当前第四阶段已提供计划/实际对账、参数建议的本地确认与 CT/P/Q 本地发布、同窗口产能试算和预检。标准 SA 页面已有整周复制及后续三周逐周复制/空置的本地预览；另编整周、Most likely 产能、可恢复的 R&R 证据包及正式跨周期产能仍待开发，详见 `docs/04-development-roadmap.md`。本地发布只在当前会话有效，不等于正式主数据审批。

## 启动与检查

macOS 可直接双击项目根目录的 `启动排产产能工具.command`：脚本会构建计算引擎、选择空闲端口、启动本地服务并打开正式版页面。保持弹出的终端窗口开启；关闭窗口即停止本次服务。首次运行若缺少项目依赖，脚本会执行 `npm install`。

手动启动：在本目录运行 `npm run build`，然后运行 `npm run serve`。打开上述本地服务地址。检查命令为 `npm run check` 与 `npm test`。

## 文档

- `docs/04-development-roadmap.md`：当前工程计划和进度，继续开发先看这里。
- `docs/00-product-position.md`：产品定位与四阶段业务口径。
- `docs/06-local-access-runbook.md`：当前目录、启动命令与浏览器入口。
- `docs/07-smoke-test-runbook.md`：人工烟测步骤。
- `docs/06-cursor-task-packages.md`、`docs/08-cursor-task-packages.md`、`docs/09-rr-mvp-task-sequence.md`：历史任务包，不能代替当前工程计划。
