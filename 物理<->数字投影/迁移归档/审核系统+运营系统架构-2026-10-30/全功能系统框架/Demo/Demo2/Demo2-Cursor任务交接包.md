# Demo2 Cursor 任务交接包

> 目的：当 ChatGPT Plus 当前会话 token/时间临近限制时，用 Cursor 接管一个小切片开发任务；完成后把结果回填到 Demo2 进度看板，保证主线不断。

## 1. 协作方式

采用“任务包”协作，不让两个 AI 同时凭聊天记忆自由发挥。

```text
进度看板
→ 生成单个任务包
→ Cursor 执行小切片
→ Cursor 回填结果
→ ChatGPT 继续接管或复核
```

每个任务包只处理一个边界清楚的小目标。不要让 Cursor 同时做 T3.5、T10、T6、报告页等跨阶段任务。

## 2. Cursor 接管前必须读取

Cursor 开始前按顺序读取：

1. `全功能系统框架/Demo/Demo2/Demo2开发进度看板.md`
2. `demo2-web/README.md`
3. 与任务相关的源码文件，例如：
   - `demo2-web/src/pages/LayoutAnnotationPage.tsx`
   - `demo2-web/src/app/scenarioStore.ts`
   - `demo2-web/src/types/demo2.ts`
   - `demo2-web/src/styles/global.css`
4. 如涉及产品边界，再读：
   - `全功能系统框架/Demo/Demo2/Demo2软件开发任务计划.md`
   - `全功能系统框架/Demo/Demo2/Demo2工厂场景编辑与版本存储规格.md`

## 3. 任务包模板

复制以下模板给 Cursor：

```md
# Demo2 Cursor Task

## 当前主线

Phase 1 / T3.5 工厂场景轻量编辑 UI。

只做本任务，不提前做 T6 总览重排、T10 后台、CSV、PDF/CAD、真实最短路。

## 必读文件

- 全功能系统框架/Demo/Demo2/Demo2开发进度看板.md
- demo2-web/README.md
- demo2-web/src/pages/LayoutAnnotationPage.tsx
- demo2-web/src/app/scenarioStore.ts
- demo2-web/src/types/demo2.ts
- demo2-web/src/styles/global.css

## 本任务目标

填写一个小目标，例如：

“在工厂场景右侧属性面板中，为配送点增加连接 RouteNode 的查看与选择能力。选择连接节点后写回 deliveryPoint.routeNodeId 或等价字段，并保持现有路径网络不被重建破坏。”

## 不做

- 不做后台持久化。
- 不做 CSV 回写。
- 不改总览 Plane Operation View。
- 不做真实最短路算法。
- 不重构全项目。

## 验收

- npm run typecheck 通过。
- npm run build 通过。
- 工厂场景页仍可打开。
- 原有对象树、搜索、图层、属性面板、复制、删除、撤销不回退。
- 本任务新增能力可以通过用户烟测验证。

## 完成后回填

请更新：

- 全功能系统框架/Demo/Demo2/Demo2开发进度看板.md
- demo2-web/README.md

并在回复中列出：

- 改了哪些文件；
- 完成了什么；
- 没做什么；
- 测试命令和结果；
- 需要 ChatGPT 接回后复核的点。
```

## 4. 当前适合交给 Cursor 的小任务

优先级从高到低：

| 优先级 | 任务 | 文件范围 | 注意 |
|---|---|---|---|
| P0 | 配送点连接 RouteNode 编辑 | `LayoutAnnotationPage.tsx`、`demo2.ts`、`scenarioStore.ts` | 只定义连接关系，不做最短路 |
| P0 | 保存状态表达 | `LayoutAnnotationPage.tsx`、`scenarioStore.ts`、`global.css` | 明确“当前会话同步”与“后台未持久化” |
| P1 | T3.5 烟测记录区 | `Demo2开发进度看板.md`、`README.md` | 记录用户烟测问题和结果 |
| P1 | 属性面板体感优化 | `LayoutAnnotationPage.tsx`、`global.css` | 只优化工厂场景，不改总览 |

## 5. 不适合交给 Cursor 的任务

这些任务需要重新讨论或由 ChatGPT 先拆包：

- 后台数据库与文件存储方案；
- 草稿/生效版本服务；
- CSV 回写完整校验；
- 真实路网最短路和路径方案计算；
- 总览和 Plane Operation View 的布局重排；
- 售前报告完整重写。

## 6. 合并回 ChatGPT 的方式

Cursor 做完后，把它的总结粘回 ChatGPT，或直接让 ChatGPT 读取文件状态。

ChatGPT 接回后必须做：

1. 读取 `Demo2开发进度看板.md`。
2. 检查 Cursor 修改是否越过当前主线边界。
3. 运行 `npm run typecheck` 和 `npm run build`。
4. 根据烟测要求提示用户用 Chrome 做关键检查。
5. 更新看板中的“已完成、剩余事项、烟测结果、下一步动作”。

## 7. 工作原则

- 任务越小越好，最好 30-90 分钟内能完成。
- 每个任务只改必要文件。
- 不用 Cursor 直接“大改产品方向”。
- 用户反馈优先进入看板，再决定是否转成当前任务。
- T6、T10、T11 的任务不能因为看起来顺手就提前做。
