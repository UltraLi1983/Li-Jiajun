# Demo2 工厂 Layout 重建参考

原文件于 2026-09-05 生成在 `output/demo2-factory-layout/`：`01-source-layout.png/.svg`、`02-digital-reference.png/.svg`、`03-spatial-ground-truth.json`、`04-calculation-checks.json` 和 `generate_layout.py`。当前文件系统及 Git 对象中未找到原图和生成脚本。

本目录是**依据当日开发执行日志重新生成的参考版，不是原图的逐像素恢复**。

- 可直接查看：`01-source-layout-reconstructed.png`（无路线覆盖）、`02-digital-reference-reconstructed.png`（带路网）。SVG 是同一版的可编辑矢量文件。
- `03-spatial-ground-truth-reconstructed.json`：日志中恢复的 120×60m 厂房、26 个区域、26 个路网节点、26 条路径段和 8 个配送点。工站位置除 A1 外按产线与对应配送点推定，已在 JSON 标注。
- 原图中 55 个障碍物的边界、原始像素画法和完整原始生成脚本未找回。本版未伪造这些障碍物数据；不可据此判断真实通行或施工可行性。
- `generate_recovered_layout.py` 用于从本目录 JSON 重绘 SVG/PNG；运行需 Python Pillow 和可用中文字体。

这份重建图和路网现已接入 `../../demo2-web/` 的默认样板。浏览器里已有草稿时，旧草稿仍会优先加载；先导出当前场景 JSON，再点击“恢复演示样板”切换。原图和障碍物仍待恢复或重新标注，T2 烟测以恢复看板为准。
