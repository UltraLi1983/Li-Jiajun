# 工程架构

## 目录建议

```text
src/
  domain/          # 类型、枚举、样例数据
  engine/          # 纯计算函数，无 UI 依赖
  adapters/        # Excel、MES、APS、API 数据适配
  app/             # 前端页面或路由
  tests/           # 计算用例
```

## 主数据来源边界

- 产品工程 / PLM / 工艺主数据系统是 ProcessMaster、Route、Operation 和 Stage BOM 的正式来源。
- ERP / MES / APS 可以引用这些已发布对象，但不应在本模块内重新创造一套正式路线。
- 当前模块的职责是消费路线和阶段物料状态，完成 station assignment、SA、R&R、参数校准和产能分析。
- 本地新建 Route / Operation 只允许作为验证模式或受控草稿，必须标记 `source=localDraft`，不能直接进入正式排产接口。

## 核心原则

- `engine` 只接收结构化输入，返回结构化输出。
- UI 不直接写复杂计算公式。
- Excel 导入和未来 API 接入都通过 adapters 转成 domain model。
- planned 与 actual/run-rate 数据源分离。
- 每个输出指标都能追溯到日历事件、路径、订单或 R&R 观察值。

## 推荐后续技术栈

如果继续做 Web 工具，建议：

- React + TypeScript
- Zustand 或 Redux Toolkit 管理场景状态
- TanStack Table 做可编辑表格
- Zod 做输入校验
- Vitest 做 engine 单元测试

如果先保持轻量，也可以继续用原生 HTML/JS，但应先把 `src/engine` 接进去。
