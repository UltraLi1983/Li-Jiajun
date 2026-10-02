# fdr-rag / Fuller—RAG 后期规划

关联文档：

- VDA 6.8 文件审核服务总规划：[docs/vda68-review-service.md](../vda68-review-service.md)
- 9002 第一阶段实施计划：[docs/plan/9002-phase1-plan.md](./9002-phase1-plan.md)
- 9002 第二阶段实施计划：[docs/plan/9002-phase2-plan.md](./9002-phase2-plan.md)

## 1. 项目定位

本项目后期定位为：

```text
Dify 平台增强版 + 自定义 OpenAI Compatible 网关 + 自定义 RAG 服务
```

当前阶段先使用 `fdr-rag-api` 作为 Cherry Studio 的 OpenAI Compatible 入口，代理云端 Dify App API。后期基于 Dify 源码建设大平台，同时暴露第二条自定义 RAG 链路 `Fuller—RAG`。

整体方向：

```text
Cherry Studio
  |
  v
fdr-rag-api:9000
  |
  +--> Dify App API / Dify 源码平台
  |
  +--> Fuller—RAG:9002
```

## 2. 两个入口

### 2.1 Dify 原生入口

Dify 继续保留原生 Web、Console、App API、Workflow API、Dataset API。

Dify 负责：

```text
应用管理
知识库管理
文档上传
切片
Embedding
向量入库
Workflow / Chatflow
模型供应商配置
用户和权限
日志与调试
```

### 2.2 自定义网关入口

`fdr-rag-api` 使用 `9000` 端口，对 Cherry Studio 暴露 OpenAI Compatible 接口。

`fdr-rag-api` 负责：

```text
OpenAI Compatible 兼容层
Cherry Studio 适配
统一鉴权
模型路由
Prompt 包装
请求日志
错误处理
后端 Provider 切换
```

后续 Cherry Studio 只需要维护一个服务商：

```text
API Base: http://服务器IP:9000/v1
API Key: API_AUTH_KEY
```

模型路由：

```text
vda-rag -> Dify App API
Fuller—RAG -> http://127.0.0.1:9002/v1/chat/completions
```

## 3. Fuller—RAG 定义

`Fuller—RAG` 是后期自定义 RAG 服务名称，预留端口为 `9002`。

建议配置：

```env
FULLER_RAG_MODEL_NAME=Fuller—RAG
FULLER_RAG_PORT=9002
FULLER_RAG_API_BASE=http://127.0.0.1:9002/v1
```

`Fuller—RAG` 负责：

```text
自定义检索策略
多知识库路由
行业 Prompt
审核问题生成逻辑
证据链组织
引用来源控制
质量规则
复杂业务编排
AutoDL 模型服务调用
```

## 4. Dify 能力复用策略

Dify 里的向量数据库、知识库、文档切片、Embedding、Rerank 等能力可以复用，但需要明确复用方式和边界。

推荐优先级：

```text
优先：通过 Dify App / Workflow / Dataset API 复用
其次：通过 Dify 源码内部模块封装成服务复用
谨慎：自定义服务直接连 Dify 的 Postgres / Redis / Vector DB
不建议：同时让 Dify 和 Fuller—RAG 各自维护一套重复知识库
```

## 5. 向量数据库是否公用

可以公用，但不建议初期直接操作 Dify 的底层向量库。

### 5.1 推荐方式：通过 Dify API 复用

```text
Fuller—RAG -> Dify Chat App / Workflow / Dataset API -> Dify 知识库
```

优点：

```text
升级风险低
不破坏 Dify 内部数据结构
权限和知识库管理继续由 Dify 负责
知识库不重复建设
```

不足：

```text
自定义召回算法控制力有限
复杂检索策略受 Dify API 能力限制
```

### 5.2 中期方式：Dify 负责写入，Fuller—RAG 只读

如果后期需要更强检索控制，可以让 Dify 和 Fuller—RAG 共用同一个底层向量数据库，但建议边界如下：

```text
Dify：负责文档上传、切片、Embedding、写入、更新、索引
Fuller—RAG：只读检索、重排、Prompt 编排、答案生成
```

这样可以避免两套系统同时写入同一个向量库导致索引结构混乱。

### 5.3 不建议初期直接读写底层库

直接访问 Dify 的 Postgres、Redis 或 Vector DB 风险较高：

```text
Dify 的 collection 命名可能变化
metadata 和 chunk 结构可能变化
权限字段可能被绕过
版本升级可能破坏兼容
误写可能破坏 Dify 知识库
多租户隔离风险较高
```

因此初期不建议 Fuller—RAG 直接读写 Dify 底层数据库。

## 6. 推荐演进路线

### 阶段 1：Dify Gateway 稳定化

目标：

```text
Cherry Studio -> fdr-rag-api:9000 -> Dify App API
```

重点：

```text
稳定 OpenAI Compatible 接口
完善鉴权
完善错误返回
完善日志
支持 Dify 云端配置
支持 VDA 6.8 Prompt 包装
```

### 阶段 2：Provider 抽象

将 Dify 从硬编码代理改为 Provider：

```text
DifyAppProvider
DifyWorkflowProvider
FullerRagProvider
AutoDLProvider
```

`fdr-rag-api` 根据模型名或配置路由：

```text
vda-rag -> DifyAppProvider
Fuller—RAG -> FullerRagProvider
```

### 阶段 3：Fuller—RAG 初版

新增 `9002` 服务：

```text
Fuller—RAG:9002
```

初版不急于自建向量库，先复用 Dify 能力：

```text
Fuller—RAG -> Dify API -> Dify 知识库
```

重点做业务增强：

```text
行业 Prompt 模板
审核问题结构化生成
多轮上下文
引用来源组织
质量规则
响应格式规范
日志和评分
```

### 阶段 4：Dify 源码平台增强

基于 Dify 源码做平台增强，但尽量控制改动边界。

优先顺序：

```text
先外部网关
再插件扩展
最后改核心源码
```

可以优先增强：

```text
自定义模型供应商
自定义工具
自定义 Workflow 节点
企业权限
审计日志
知识库策略
后台页面
```

### 阶段 5：自定义 Retriever

当 Dify 召回效果不够时，再引入自定义 Retriever：

```text
Fuller—RAG -> 自定义 Retriever -> Dify 向量库 / 独立向量库
```

初期建议只读 Dify 向量库，不写入。

### 阶段 6：关键业务自研

当业务稳定后，再决定哪些能力从 Dify 外挂出来：

```text
自定义切片
自定义 Embedding
自定义 Rerank
自定义向量库
自定义权限
自定义评测
自定义知识库版本管理
```

## 7. 当前建议

短期建议：

```text
不要让 Cherry Studio 直接接 Dify
不要让 Fuller—RAG 初期直接写 Dify 向量库
不要重复建设两套知识库
先让 fdr-rag-api 成为统一控制入口
先让 Dify 继续负责知识库建设和管理
```

中期目标：

```text
Dify 负责平台和知识库
fdr-rag-api 负责统一入口和路由
Fuller—RAG 负责业务问答编排
```

长期目标：

```text
Dify 作为平台底座
Fuller—RAG 作为自定义 RAG 引擎
关键业务能力逐步可替换、可控、可观测
```

