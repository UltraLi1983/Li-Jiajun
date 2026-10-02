# fdr-rag 初期项目规划

## 1. 初期定位

基于当前项目状态，初期项目应定位为：

```text
fdr-rag-api = Cherry Studio 的统一 OpenAI Compatible 网关
Dify = 云端 RAG 平台底座
Fuller—RAG = 后期自定义 RAG 引擎，初期只预留
```

当前阶段不建议马上做完整 RAG 平台，也不建议直接改 Dify 核心源码。更稳的方式是先把 `fdr-rag-api:9000` 作为统一入口打稳。

## 2. 当前项目现状

当前已经具备的能力：

```text
GET /health
GET /v1/models
POST /v1/chat/completions
Docker 部署
.env 配置
Dify blocking 调用
VDA 6.8 Prompt 包装
Bearer 鉴权
```

当前主链路：

```text
Cherry Studio
  -> fdr-rag-api:9000
  -> Dify App API
  -> Dify 知识库
  -> AutoDL 模型服务
```

这说明当前项目最适合先做“稳定网关”，而不是马上扩展成完整平台。

## 3. 初期核心目标

第一阶段目标：

```text
让 Cherry Studio 稳定调用 Dify
让 Dify 稳定调用知识库和 AutoDL
让 fdr-rag-api 成为自己的控制入口
```

初期不要让 Cherry Studio 直接连接 Dify。统一通过 `fdr-rag-api` 的原因：

```text
统一鉴权
统一模型名
统一 Prompt 包装
统一业务路由
统一日志
统一错误处理
为后续 Fuller—RAG 分流做准备
```

## 4. 初期整体链路

稳定版本链路：

```text
Cherry Studio
  |
  v
fdr-rag-api:9000
  |
  v
Dify App API
  |
  v
Dify 知识库
  |
  v
AutoDL 模型服务
```

后续预留链路：

```text
Cherry Studio
  |
  v
fdr-rag-api:9000
  |
  +--> vda-rag -> Dify App API
  |
  +--> Fuller—RAG -> Fuller—RAG:9002
```

## 5. 初期开发顺序

### 5.1 稳定 Dify Gateway

先把 `vda-rag` 这条链路做稳：

```text
model: vda-rag -> Dify App API
```

需要完善：

```text
Dify App Key 配置
Dify API Base 配置
错误信息
超时设置
健康检查
Docker 启停说明
Cherry Studio 配置说明
```

关键注意点：

```text
DIFY_APP_API_KEY 必须使用 Dify Chat App / Chatflow App 的 App API Key
不要使用 dataset- 开头的知识库 Key
修改 .env 后需要 docker compose up -d --force-recreate
```

### 5.2 增加日志和 request_id

当前项目还比较轻，但后面一旦接入 Dify、AutoDL、知识库，问题排查会变复杂。初期就应增加基础可观测能力。

建议记录：

```text
request_id
请求耗时
模型名
用户问题摘要
Dify 状态码
Dify message_id
conversation_id
错误日志
```

目标是后续能快速判断问题出在：

```text
Cherry Studio
fdr-rag-api
Dify App API
Dify 知识库
AutoDL 模型服务
```

### 5.3 保留 OpenAI Compatible 入口

所有客户端统一走：

```text
GET /v1/models
POST /v1/chat/completions
```

初期不要过早暴露太多自定义接口。OpenAI Compatible 入口可以被 Cherry Studio 和后续其他客户端复用。

### 5.4 增加 Provider 抽象

当前 `dify_client.py` 还是硬编码 Dify。下一步建议抽象成 Provider：

```text
providers/
  base.py
  dify_app.py
  fuller_rag.py
```

后续路由：

```text
vda-rag -> DifyAppProvider
Fuller—RAG -> FullerRagProvider
```

这样可以让 Dify 和 Fuller—RAG 都作为后端能力接入，而不是把业务逻辑都堆在 `main.py`。

### 5.5 先预留 Fuller—RAG

`Fuller—RAG:9002` 初期只规划，不急着实现完整 RAG。

初期可以做到：

```text
.env.example 里有配置
README 里有说明
docs/plan 里有路线
/v1/models 后续可返回两个模型
```

真正的自定义 RAG 等 Dify 主链路稳定后再做。

## 6. 初期目录演进方向

当前目录可以继续使用，但后续建议逐步整理为：

```text
app/
  main.py

  api/
    routes/
      health.py
      models.py
      chat.py

  core/
    config.py
    auth.py
    logging.py
    errors.py

  schemas/
    openai.py
    dify.py

  services/
    chat_service.py
    prompt_service.py
    router_service.py

  providers/
    base.py
    dify_app.py
    fuller_rag.py

  prompts/
    vda68.py
```

不要一次性大改。建议分两步：

第一步：

```text
保持 auth.py、config.py、dify_client.py、prompt_templates.py 稳定
增加 services/chat_service.py
增加 providers/dify_app.py
```

第二步：

```text
拆 main.py 路由
增加 api/routes/
增加 schemas/openai.py
增加 providers/base.py
```

## 7. Dify 与 Fuller—RAG 初期边界

初期建议边界：

```text
Dify：知识库、切片、向量化、检索、Workflow
fdr-rag-api：入口、鉴权、Prompt、路由
Fuller—RAG：规划中的自定义服务，暂不承担主链路
```

初期不要直接操作 Dify 的向量库。短期只通过 Dify API 使用知识库能力。

## 8. 初期里程碑

建议按以下节奏推进：

```text
M1：本地 Docker 跑通 fdr-rag-api
M2：Cherry Studio 成功调用 vda-rag
M3：云端 Dify App API 打通
M4：Dify 知识库 + AutoDL 模型链路稳定
M5：增加日志、request_id、conversation_id
M6：Provider 抽象
M7：/v1/models 返回 vda-rag 和 Fuller—RAG
M8：Fuller—RAG:9002 做最小服务骨架
```

## 9. 当前最应该做的事

近期优先级：

```text
1. 拿到正确的 Dify App API Key，不要使用 dataset key
2. 让 /v1/chat/completions 真正返回 Dify 答案
3. 在 README 和 docs/plan 固化部署流程
4. 给项目增加日志和 request_id
5. 抽象 Provider，为 Fuller—RAG 做准备
```

## 10. 初期结论

初期不要急着改 Dify 源码，也不要急着做 `9002` 的完整 RAG。

最关键的是先把 `9000` 这个统一入口打稳：

```text
Cherry Studio -> fdr-rag-api:9000 -> Dify -> 知识库 -> AutoDL
```

只要 `fdr-rag-api` 稳定，后面接 Dify 源码平台、接 Fuller—RAG、接 AutoDL、自定义检索都会更顺。

