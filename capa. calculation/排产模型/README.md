# 排产产能参数工具

正式版入口：`formal.html`（本地服务地址：`http://127.0.0.1:8785/formal.html`）。`index.html` 是旧验证原型。

## 当前主流程

1. 工艺路线与工站：选择产品、工序及可用工站。
2. 标准 SA 设定：按工站记录最多 48 小时的计划时间段，建立 Best case 基准。
3. 现场 R&R 跟踪：对照同一工站基准记录生产段、OK/NOK 和节拍。
4. 参数校准与产能分析：复核当前草稿与标准基准，查看工艺、份额及批量预检。

当前第四阶段提供草稿对比和预检。异常事件对账、Most likely SA 的来源结构、参数审批、长周期投影及完整产出模拟仍在后续开发范围，详见 `docs/04-development-roadmap.md`。

## 启动与检查

在本目录运行 `npm run build`，然后运行 `npm run serve`。打开上述本地服务地址。检查命令为 `npm run check` 与 `npm test`。

## 文档

- `docs/00-product-position.md`：产品定位与四阶段业务口径。
- `docs/04-development-roadmap.md`：已实现内容与后续工程阶段。
- `docs/06-cursor-task-packages.md`：后续交接任务包。
- `docs/09-rr-mvp-task-sequence.md`：早期任务记录，供追溯。
