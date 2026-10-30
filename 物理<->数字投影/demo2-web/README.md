# Demo2 Web App（恢复版）

当前演示工程位于本目录；启动地址固定为 `http://127.0.0.1:5173/`。恢复过程中的旧版副本已移至 `../迁移归档/审核系统+运营系统架构-2026-10-30/demo2-web/`。

## 启动

在本目录执行：

```bash
npm install
npm run dev -- --host 127.0.0.1 --strictPort
```

也可以双击 `启动Demo2.command`。脚本会显示网页地址，由用户手动打开；5173 被占用时会明确报错。

## 当前恢复状态

- React + TypeScript + Vite；七个页面可切换，样板场景可运行。
- T2 恢复版几何已核对：两条产线、八个工站、八个配送点及主通道/支路使用统一坐标。
- 工厂场景页支持图片导入、配送点和路径段的有限编辑。本地草稿可以导出 JSON；切换演示样板前会备份旧草稿，且可恢复。
- 原始 2026-09-05 工厂 Layout PNG 已丢失。依据开发日志生成的**重建参考版**位于 `../output/demo2-factory-layout-recovered/`；原图中的 55 个障碍物边界未恢复，参考图暂未接入软件计算。
- 后续按 `../全功能系统框架/Demo/Demo2/Demo2软件开发任务计划.md` 的 T0–T11 恢复，当前进度见同目录的 `Demo2恢复工程看板-2026-10-30.md`。

## 检查

```bash
npm run build
node --test test/recovery-guard.test.cjs
```
