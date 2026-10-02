# 第一阶段 Dify Demo 实施计划

关联文档：

- 总规划：[docs/vda68-review-service.md](../vda68-review-service.md)
- 9002 第一阶段实施计划：[docs/plan/9002-phase1-plan.md](./9002-phase1-plan.md)
- 9002 第二阶段实施计划：[docs/plan/9002-phase2-plan.md](./9002-phase2-plan.md)

本文档用于在项目第一阶段中先在 Dify 里做一个可验收 Demo。目标不是一次性完成完整 VDA 6.8 文件审核，而是先证明以下主链路可用：

```text
9000 网关
  -> Dify App API / Workflow API
  -> Dify 长期 VDA 6.8 知识库 Demo
  -> Xinference 模型供应商
  -> 返回可追溯回答
```

该 Demo 是第一阶段和第二阶段之间的过渡验证：第一阶段先跑通 Dify 调用链路和输出契约，第二阶段再扩展到真实 Workflow、OCR、embedding、rerank 和完整审核闭环。

## 1. Demo 目标

第一阶段 Dify Demo 需要完成：

```text
确认 Dify 能正常调用 Xinference 模型
创建一个 VDA 6.8 Demo 知识库
创建一个 Dify Chat App，用于验证 9000 网关代理 Dify App API
创建一个 Dify Workflow Demo，用于验证 9002 后续调用契约
获取 Dify App API Key
配置本项目 .env
通过 curl 验证 /v1/chat/completions
在 Cherry Studio 中验证 vda-rag 模型
记录 Demo 输入、输出和验收结果
```

第一阶段 Demo 不做：

```text
上传真实客户文件
复杂多文件审核
OCR
AutoDL embedding / rerank
完整动作卡版本管理
PDF / DOCX 报告
直接修改 Dify 源码
```

## 2. Dify 里需要创建的内容

### 2.1 Demo 知识库

建议名称：

```text
VDA 6.8 Demo Knowledge Base
```

第一阶段只上传少量可控内容，避免知识库过大导致调试困难。

建议内容：

```text
VDA 6.8 简化条款说明
2 到 3 个审核检查点说明
供应商审核计划示例要求
整改闭环示例要求
风险识别示例要求
```

知识库验收：

```text
Dify 控制台能检索到上传内容
用普通问题能返回相关条款
回答中不要出现明显无关内容
```

### 2.2 Demo Chat App

建议名称：

```text
vda-rag-demo-chat
```

用途：

```text
验证 9000 网关能通过 Dify App API 调用 Dify
验证 Dify 能通过 Xinference 模型返回回答
验证 Cherry Studio 的 OpenAI Compatible 配置可用
```

建议系统提示词：

```text
你是 VDA 6.8 审核助手。请优先依据知识库内容回答问题。
回答时需要包含：
1. 结论
2. 依据
3. 建议
如果知识库中没有足够依据，请明确说明“依据不足”，不要编造条款。
```

建议测试问题：

```text
请说明供应商审核计划通常需要包含哪些内容。
如果企业没有整改闭环记录，VDA 6.8 审核中可能有什么风险？
请根据知识库生成 3 个供应商审核相关的问题。
```

验收：

```text
Dify 控制台可正常回答
App API Key 可用
9000 /v1/chat/completions 可返回同类回答
Cherry Studio 中 model=vda-rag 可正常对话
```

### 2.3 Demo Workflow

建议名称：

```text
vda68-single-check-demo
```

用途：

```text
提前验证 9002 后续调用 Dify Workflow 的输入输出契约
用一个检查项和一段上传文件证据模拟单项审核
输出固定 JSON，供 9002 后续做 Schema 校验
```

输入变量建议：

```text
task_id
check_id
check_title
vda_clause
expected_evidence
judgement_rule
evidence_chunks
```

输入示例：

```json
{
  "task_id": "demo_task_001",
  "check_id": "AC-001",
  "check_title": "供应商审核计划是否建立并定期更新",
  "vda_clause": "VDA 6.8 Demo Clause",
  "expected_evidence": "年度审核计划、供应商审核记录、整改闭环记录",
  "judgement_rule": "存在计划、执行记录和问题闭环，判为符合；缺少闭环，判为部分符合。",
  "evidence_chunks": "文件 supplier_audit_plan.pdf 第 3 页显示已有年度供应商审核计划，但未发现整改闭环记录。"
}
```

输出 JSON 约定：

```json
{
  "check_id": "AC-001",
  "status": "partial",
  "score": 6,
  "max_score": 10,
  "evidence": [
    {
      "filename": "supplier_audit_plan.pdf",
      "page": 3,
      "summary": "存在年度供应商审核计划"
    }
  ],
  "issues": ["未发现整改闭环记录"],
  "suggestions": ["补充整改责任人、完成时间和验证记录"],
  "standard_basis": ["VDA 6.8 Demo Clause"],
  "confidence": "medium"
}
```

验收：

```text
Workflow 能稳定输出合法 JSON
缺少证据时输出 evidence_insufficient 或类似状态
不会编造文件名、页码和证据
输出字段能被 9002 后续 result schema 复用
```

## 3. 本项目配置

Demo Chat App 创建后，获取 Dify App API Key，配置本项目 `.env`：

```env
DIFY_API_BASE=http://你的Dify公网地址/v1
DIFY_APP_API_KEY=你的Dify Chat App API Key
API_AUTH_KEY=给Cherry Studio使用的访问密钥
MODEL_NAME=vda-rag
ENABLE_VDA_PROMPT=true
REQUEST_TIMEOUT=180
```

重启 9000 网关：

```bash
docker compose up -d --build
```

验证健康检查：

```bash
curl http://127.0.0.1:9000/health
```

验证模型列表：

```bash
curl http://127.0.0.1:9000/v1/models \
  -H "Authorization: Bearer 你的API_AUTH_KEY"
```

验证 Chat Completions：

```bash
curl -X POST http://127.0.0.1:9000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 你的API_AUTH_KEY" \
  -d '{
    "model": "vda-rag",
    "messages": [
      {"role": "user", "content": "请说明供应商审核计划通常需要包含哪些内容。"}
    ],
    "stream": false
  }'
```

## 4. Cherry Studio 配置

在 Cherry Studio 中添加 OpenAI Compatible 服务商：

```text
API Base: http://你的服务器IP:9000/v1
API Key: .env 中的 API_AUTH_KEY
Model: vda-rag
```

验收问题：

```text
请说明供应商审核计划通常需要包含哪些内容。
请根据知识库生成 3 个 VDA 6.8 审核问题。
如果没有整改闭环记录，应如何整改？
```

## 5. Demo 验收清单

必须满足：

```text
Dify 模型供应商 Xinference 状态正常
Dify Demo 知识库可检索
Dify Chat App 控制台可回答
Dify Chat App API Key 可调用
9000 /health 显示 DIFY_APP_API_KEY 已配置
9000 /v1/models 返回 vda-rag
9000 /v1/chat/completions 返回 Dify 回答
Cherry Studio 可通过 vda-rag 对话
Dify Workflow Demo 能输出合法 JSON
Demo 输入输出样例已记录
```

## 6. 失败排查顺序

建议按以下顺序排查：

```text
1. Dify 控制台是否能直接调用 Xinference 模型
2. Dify 知识库是否能检索到 Demo 内容
3. Dify Chat App 是否能在控制台正常回答
4. Dify App API Key 是否正确，不要使用 dataset- 开头的知识库 Key
5. DIFY_API_BASE 是否包含 /v1
6. 9000 /health 是否显示 dify_app_api_key_configured=true
7. 9000 到 Dify 公网地址是否网络可达
8. Cherry Studio API Base 是否填写到 /v1
9. Cherry Studio Model 是否填写 vda-rag
```

## 7. 与第一阶段和第二阶段的关系

第一阶段中，这个 Demo 用来验证：

```text
9000 网关到 Dify 的代理链路
Dify 到 Xinference 的模型链路
Demo 知识库检索链路
Workflow 输入输出契约
```

第二阶段中，在这个 Demo 基础上继续扩展：

```text
真实 VDA 6.8 长期知识库
真实单检查项审核 Workflow
真实任务汇总 Workflow
9002 Dify Workflow Client 真实调用
AutoDL OCR / embedding / rerank
审核结果 JSON Schema 校验
```
