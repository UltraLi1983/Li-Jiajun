# Demo2 T10.3 服务端版本库设计

> 日期：2026-09-05  
> 状态：T10.3 设计稿 / 后续实现依据  
> 前置：T10.1 本地草稿保存与刷新恢复已通过烟测；T10.2 当前会话、本地草稿、服务端草稿、生效版本边界已通过烟测。

## 1. 目标

T10.3 的目标是把工厂场景从“浏览器可恢复的 DEMO 草稿”推进到“企业可长期运营的场景资产”。

服务端版本库必须保存：

- 底图资产：原始 layout 图片/PDF、文件名、尺寸、校验值、文件引用；
- 空间快照：区域、工站、配送点、路径节点、路径段、比例尺、坐标；
- 业务关联：配送点连接 RouteNode、配送点服务工站、区域类型；
- 计算参数：客户需求、HU、Bin、水位、运输资源等；
- 版本状态：草稿、生效版本、历史版本、revision；
- 计算记录：基于哪个版本、哪个参数 hash、哪个引擎版本得出结果。

本阶段先定义契约，不直接实现复杂后端。前端当前的 localStorage 草稿只作为演示兜底和断点恢复，不等同服务端草稿。

## 2. 版本状态模型

```text
标准样板 / 历史生效版
        ↓ 创建或继续编辑
服务端草稿 draft
        ↓ 保存草稿，revision + 1
服务端草稿 draft saved
        ↓ 校验 + 重算成功 + 发布
生效版本 published
        ↓ 复制历史版本为新草稿
服务端草稿 draft
```

状态边界：

| 状态 | 含义 | 可编辑 | 是否影响运营基准 |
|---|---|---:|---:|
| 当前会话 | 浏览器内存中的正在编辑对象 | 是 | 否 |
| 本地草稿 | localStorage 保存的 DEMO 快照 | 是 | 否 |
| 服务端草稿 | 数据库中的共享草稿 | 是 | 否 |
| 生效版本 | 已发布、可作为运营计算起点的快照 | 否 | 是 |
| 历史版本 | 旧 published 快照 | 否；可复制成新草稿 | 否 |

published 快照不可原地修改。任何修改都必须基于 published 或 draft 创建新的 draft，再保存、校验、重算、发布。

## 3. 数据对象

### FactoryScene

| 字段 | 类型 | 说明 |
|---|---|---|
| scene_id | string | 场景主键 |
| project_id | string | 项目 ID |
| site_id | string | 工厂/基地 ID |
| name | string | 场景名称 |
| active_version_id | string? | 当前生效版本 |
| draft_version_id | string? | 当前共享草稿 |
| created_at / updated_at | datetime | 创建与更新时间 |

### SceneVersion

| 字段 | 类型 | 说明 |
|---|---|---|
| version_id | string | 版本主键 |
| scene_id | string | 所属场景 |
| parent_version_id | string? | 来源版本 |
| status | draft / published / archived | 版本状态 |
| revision | number | 草稿并发控制序号 |
| schema_version | string | 快照 schema |
| snapshot | Demo2Scenario | 完整场景快照 |
| change_summary | string? | 修改说明 |
| created_at / updated_at | datetime | 创建与更新时间 |
| published_at | datetime? | 发布时间 |

### LayoutAsset

| 字段 | 类型 | 说明 |
|---|---|---|
| asset_id | string | 资产主键 |
| scene_id | string | 所属场景 |
| version_id | string? | 绑定版本，或先挂草稿 |
| original_name | string | 原始文件名 |
| mime_type | string | 文件类型 |
| width / height | number? | 图片尺寸或页面尺寸 |
| checksum | string | 内容校验值 |
| storage_uri | string | 后台文件存储地址 |
| created_at | datetime | 上传时间 |

### CalculationRun

| 字段 | 类型 | 说明 |
|---|---|---|
| run_id | string | 计算记录主键 |
| scene_id | string | 所属场景 |
| version_id | string | 绑定的场景版本 |
| input_revision | number | 计算时使用的版本 revision |
| input_hash | string | 场景 + 参数 + 方案 hash |
| plan_id | baseline / proposed / stress | 计算方案 |
| engine_version | string | 计算引擎版本 |
| status | queued / success / failed / stale | 计算状态 |
| result | object | 计算结果 |
| computed_at | datetime | 完成时间 |

## 4. API 契约

第一版建议接口：

| 方法 | 路径 | 用途 |
|---|---|---|
| GET | /api/demo2/scenes | 列出可用场景 |
| POST | /api/demo2/scenes | 创建场景 |
| GET | /api/demo2/scenes/:sceneId | 获取场景元数据、生效版和草稿摘要 |
| GET | /api/demo2/scenes/:sceneId/active | 获取当前生效版本快照 |
| GET | /api/demo2/scenes/:sceneId/draft | 获取当前草稿；没有则返回 404 |
| POST | /api/demo2/scenes/:sceneId/draft | 从指定版本创建或继续草稿 |
| PUT | /api/demo2/scenes/:sceneId/draft | 保存草稿，必须携带 expected_revision |
| POST | /api/demo2/scenes/:sceneId/assets | 上传底图资产 |
| POST | /api/demo2/scenes/:sceneId/calculate | 基于草稿或生效版触发计算 |
| POST | /api/demo2/scenes/:sceneId/publish | 发布草稿为生效版本，必须携带 expected_revision |
| GET | /api/demo2/scenes/:sceneId/versions | 查询历史版本 |
| GET | /api/demo2/scenes/:sceneId/calculations | 查询计算记录 |

保存草稿请求示例：

```json
{
  "expected_revision": 3,
  "change_summary": "调整 DP-A1 接入节点与 A 线线边区宽度",
  "snapshot": {}
}
```

保存成功响应示例：

```json
{
  "version_id": "ver_draft_001",
  "scene_id": "scene_seat_frame_demo",
  "status": "draft",
  "revision": 4,
  "updated_at": "2026-09-05T21:30:00+08:00"
}
```

冲突响应示例：

```json
{
  "error": "revision_conflict",
  "current_revision": 5,
  "message": "草稿已被其他窗口或用户更新，请重新加载后比对。"
}
```

## 5. 保存与发布规则

保存草稿：

- 前端必须提交 `expected_revision`；
- 服务端只在当前 revision 匹配时写入；
- 保存成功后 revision + 1；
- 保存失败时前端保留当前会话和本地草稿；
- 禁止静默覆盖服务端较新草稿。

发布生效：

- 只允许发布服务端草稿；
- 发布前必须完成结构校验、引用校验、必要参数校验；
- 当前草稿对应的计算必须成功，且 input_hash 仍匹配；
- 发布事务同时写入 published 版本并切换 `active_version_id`；
- 旧生效版保留为历史版本；
- 发布失败不得改变 `active_version_id`。

## 6. 校验规则

最低校验集：

- 所有 ID 唯一；
- deliveryPoint.routeNodeId 必须引用存在的 pathNetwork.nodes；
- routeSegment.fromNodeId / toNodeId 必须引用存在的节点；
- 坐标必须为有限数字；
- calculationScaleMPerPx 必须大于 0；
- LayoutAsset 不允许只保存临时 blob URL；
- 删除对象必须通过显式操作，不由 CSV 缺行推断；
- published 版本不可被 PUT 修改。

## 7. 前端接入方式

前端保留现有四段状态卡：

```text
当前会话 → 本地草稿 → 服务端草稿 → 生效版本
```

接入服务端后：

- `保存本地草稿` 保留为断网兜底；
- 新增 `保存到服务端草稿`；
- 新增 `发布为生效版本`，但发布前必须先校验和重算；
- 刷新页面优先读取服务端草稿；服务端不可用时才提示可恢复本地草稿；
- 计算页与总览页读取 active 或 draft 时必须显示版本来源。

## 8. T10.3 不做的事

本阶段不直接做：

- 完整登录、权限、租户管理；
- 多人实时协同；
- 可视化版本 diff；
- CAD/PDF 自动解析；
- CSV 回写实现；
- T5.4 最短路算法。

这些能力后续进入对应阶段，不能混进 T10.3 最小版本库设计。

## 9. T10.3 验收与烟测

文档验收：

1. 能说清当前会话、本地草稿、服务端草稿、生效版本的差异。
2. 能说清为什么 published 不可原地修改。
3. 能说清保存草稿为什么要 expected_revision。
4. 能说清发布生效前为什么需要校验和重算。
5. 能说清 localStorage 只是 DEMO/断网兜底，不是企业后台。

后续代码验收：

1. 前端有服务端版本库契约类型。
2. 保存、加载、发布、冲突、校验失败都有明确状态。
3. 任何失败都不能把 UI 显示成“已保存/已生效”。
