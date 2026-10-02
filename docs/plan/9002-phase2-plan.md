# 9002 第二阶段项目实施计划

总规划文档：[docs/vda68-review-service.md](../vda68-review-service.md)

第一阶段计划：[docs/plan/9002-phase1-plan.md](./9002-phase1-plan.md)

本文档面向 `9002` VDA 6.8 文件审核服务第二阶段。第二阶段建立在第一阶段已经完成文件上传、任务队列、基础解析、chunk metadata、结构化结果和 JSON 报告的基础上，重点接入线上 Dify VDA 6.8 Workflow、长期知识库、AutoDL OCR / embedding / rerank，并把审核结果从 mock / 占位输出推进到可验证的业务闭环。

当前假设：

```text
线上 Dify 已部署完成
Dify 模型供应商 Xinference 已配置完成
9000 网关已能稳定代理 Dify App API
9002 第一阶段服务骨架和任务生命周期已完成
```

## 1. 第二阶段目标

第二阶段需要完成：

```text
Dify VDA 6.8 长期知识库建设流程
Dify 单检查项审核 Workflow
Dify 任务汇总 Workflow
9002 Dify Workflow Client 从 mock 切换为真实调用
9002 将任务级 chunk 和执行动作卡发送给 Dify Workflow
9002 校验 Dify Workflow 输出 JSON Schema
AutoDL OCR HTTP Client
图片、扫描版 PDF、文本过少 PDF 的 OCR 处理
AutoDL embedding / rerank Client 占位或最小可用实现
chunk 摘要、关键词、候选条款初筛
执行动作卡版本管理
评分权重和 prompt 版本记录
审核结果质量验收集
线上联调、日志和错误码完善
```

第二阶段明确不做：

```text
完整账号登录
管理员后台
动作卡在线编辑
PDF / DOCX 精美报告
长期自建向量库
直接读写 Dify 底层数据库
修改 Dify 核心源码
9000 路由 Fuller-RAG 生产化
```

## 2. 核心边界

第二阶段必须保持以下边界：

```text
Dify 负责长期 VDA 6.8 知识库、标准检索、Workflow 编排和模型推理
Xinference 只作为 Dify 的模型供应商，不由 9002 直接调用
9002 负责上传文件、任务状态、权限隔离、文件解析、OCR、chunk、Workflow 调用、结果校验和报告保存
AutoDL 只作为 HTTP 推理能力服务，不保存任务状态，不负责用户权限
用户上传文件不进入 Dify 长期 VDA 6.8 知识库
前端不直接调用 Dify 或 AutoDL
```

推荐链路：

```text
用户浏览器
  -> 9002
  -> 文件解析 / OCR / chunk
  -> 执行动作卡
  -> Dify Workflow
  -> Dify 长期 VDA 6.8 知识库
  -> Xinference 模型
  -> 9002 结果校验 / 汇总 / 报告
```

## 3. 新增配置项

第二阶段建议在第一阶段配置基础上补充：

```env
DIFY_WORKFLOW_API_BASE=http://你的Dify公网地址/v1
DIFY_WORKFLOW_API_KEY=你的DifyWorkflow应用APIKey
DIFY_SINGLE_CHECK_WORKFLOW_ID=
DIFY_SUMMARY_WORKFLOW_ID=
DIFY_WORKFLOW_TIMEOUT=300
DIFY_WORKFLOW_MAX_RETRIES=2

AUTODL_API_BASE=http://你的AutoDL服务地址
AUTODL_API_KEY=
AUTODL_ENABLE_OCR=true
AUTODL_ENABLE_EMBEDDING=false
AUTODL_ENABLE_RERANK=false
AUTODL_TIMEOUT=300

REVIEW_ACTION_CARD_VERSION=vda68-2026-01
REVIEW_PROMPT_VERSION=vda68-workflow-2026-01
REVIEW_RESULT_SCHEMA_VERSION=v1
```

注意：

```text
DIFY_WORKFLOW_API_KEY 必须使用 Workflow / Chatflow App API Key
不要使用 dataset- 开头的知识库 Key
Workflow ID 如 Dify API 不要求显式传入，可以只保留版本记录
所有密钥只进入 .env 或部署平台 Secret，不写入代码和文档
```

## 4. 里程碑拆分

### 4.1 M1：Dify 长期知识库建设

任务：

```text
整理 VDA 6.8 标准源文件
整理条款解释、评分参考、审核问题模板
上传到 Dify 长期知识库
配置切片策略、Embedding 模型和检索参数
建立知识库更新流程
记录知识库版本
```

验收：

```text
Dify 控制台直接提问可检索到 VDA 6.8 条款
同一问题多次测试返回稳定条款依据
知识库版本、上传文件列表、更新时间可追溯
9002 不保存长期标准知识副本，只记录知识库版本引用
```

### 4.2 M2：单检查项审核 Workflow

用途：

```text
对一个 action_card check_id 完成标准检索、上传证据比对、单项评分和整改建议
```

输入契约：

```json
{
  "task_id": "task_xxx",
  "owner_id": "user_xxx",
  "standard": "VDA 6.8",
  "action_card_version": "vda68-2026-01",
  "check": {
    "check_id": "AC-001",
    "title": "供应商审核计划是否建立并定期更新",
    "vda_clause": "VDA 6.8 x.x",
    "expected_evidence": ["年度审核计划", "供应商审核记录"],
    "judgement_rule": "存在计划和执行记录，且有问题闭环，判为符合",
    "max_score": 10,
    "weight": 1.0
  },
  "chunks": [
    {
      "chunk_id": "c001",
      "filename": "supplier_audit_plan.pdf",
      "page": 3,
      "sheet_name": null,
      "content": "..."
    }
  ]
}
```

输出契约：

```json
{
  "check_id": "AC-001",
  "vda_clause": "VDA 6.8 x.x",
  "status": "partial",
  "score": 6,
  "max_score": 10,
  "evidence": [
    {
      "filename": "supplier_audit_plan.pdf",
      "page": 3,
      "chunk_id": "c001",
      "summary": "存在年度供应商审核计划"
    }
  ],
  "issues": ["缺少供应商审核整改闭环记录"],
  "suggestions": ["补充整改责任人、计划完成时间和验证记录"],
  "standard_basis": ["VDA 6.8 x.x 对供应商审核计划和执行记录的要求"],
  "confidence": "medium"
}
```

验收：

```text
Workflow 能稳定输出合法 JSON
9002 能按 JSON Schema 校验输出
证据必须引用 chunk_id / filename / page 或等价来源字段
无证据时必须输出 evidence_insufficient，不允许编造证据
```

### 4.3 M3：任务汇总 Workflow 或本地汇总

任务：

```text
汇总所有单检查项结果
计算 total_score
生成 conclusion
生成 risk_summary
生成 recommendations
保留每个检查项的 evidence、issues、suggestions
```

策略：

```text
如果评分权重和结论规则明确，9002 本地汇总
如果需要自然语言总结和风险摘要，调用 Dify 汇总 Workflow
无论哪种方式，最终 result.json 结构由 9002 固定
```

验收：

```text
total_score 可复算
conclusion 规则可解释
单项分数、权重、扣分原因可追溯
汇总失败不影响已完成单项结果的保存
```

### 4.4 M4：9002 Dify Workflow Client 真实调用

任务：

```text
实现 blocking Workflow 调用
支持 request_id / task_id 日志
支持超时和有限重试
记录 Dify response id、耗时、状态码、错误详情
把 mock 输出切换为真实 Workflow 输出
支持按配置回退到 mock 模式，便于本地开发
```

错误码：

```text
DIFY_WORKFLOW_CONFIG_MISSING
DIFY_WORKFLOW_TIMEOUT
DIFY_WORKFLOW_HTTP_ERROR
DIFY_WORKFLOW_INVALID_JSON
DIFY_WORKFLOW_SCHEMA_INVALID
DIFY_WORKFLOW_EMPTY_RESULT
```

验收：

```text
Workflow 调用失败时任务进入 failed 或 partial_failed
错误信息能定位到 Dify、网络、超时、JSON Schema 还是业务输出问题
日志里不能记录完整密钥
```

### 4.5 M5：OCR 接入 AutoDL

任务：

```text
实现 AutoDL OCR HTTP Client
处理图片文件
处理扫描版 PDF
处理直接抽文本过少的 PDF
保存 OCR 文本、页码、图片索引、置信度
低置信度 OCR 写入 warnings
OCR 失败不导致整个任务直接失败，除非没有任何有效文本证据
```

OCR 输出结构：

```json
{
  "filename": "scan.pdf",
  "page": 2,
  "image_index": 0,
  "extract_method": "ocr",
  "ocr_confidence": 0.86,
  "content": "..."
}
```

验收：

```text
图片和扫描 PDF 能生成 OCR chunk
OCR chunk 与普通文本 chunk 使用统一 metadata
报告中能提示哪些证据来自 OCR
低置信度 OCR 不作为强证据，必须有 warnings
```

### 4.6 M6：chunk 增强和候选条款初筛

任务：

```text
为 chunk 生成 summary
提取 keywords
生成 possible_clauses
可选调用 AutoDL embedding
可选调用 AutoDL rerank
按 check_id 选择更相关的 chunk 传给 Dify Workflow
控制单次 Workflow 输入 token 成本
```

增强后 chunk 示例：

```json
{
  "chunk_id": "c001",
  "summary": "描述供应商年度审核计划和审核频次",
  "keywords": ["供应商审核", "年度计划", "审核频次"],
  "possible_clauses": ["VDA 6.8 x.x"]
}
```

验收：

```text
每个 check_id 只传入相关 chunk 子集
无相关 chunk 时仍能返回 evidence_insufficient
possible_clauses 只能作为候选标签，不能替代最终判断
增强失败时可回退到基础 chunk 流程
```

### 4.7 M7：执行动作卡和评分版本管理

任务：

```text
为 action_cards 增加 version
为每个 check 增加 max_score、weight、required_evidence、risk_level
任务创建时固化 action_card_version
结果中记录 prompt_version、workflow_version、schema_version
支持旧任务按历史版本查询结果
```

验收：

```text
同一个 task 的审核过程只使用一个固定动作卡版本
动作卡更新不影响历史任务结果
result.json 中能看到 action_card_version、prompt_version、workflow_version、schema_version
```

### 4.8 M8：质量验收集

任务：

```text
准备 3 到 5 组典型审核样例
每组包含上传文件、预期关键证据、预期检查项结果
覆盖符合、部分符合、不符合、证据不足、OCR 文件
记录 Dify Workflow 输出和人工复核结论
```

验收：

```text
同一验收集重复运行结果稳定
关键证据引用准确
明显缺失证据时不应判为符合
OCR 样例能产生 warnings
人工复核可解释总分和扣分项
```

## 5. API 行为调整

第二阶段不需要大幅改变第一阶段 API，但需要增强响应字段。

`GET /api/reviews/{task_id}` 建议增加：

```json
{
  "task_id": "task_xxx",
  "status": "reviewing",
  "progress": 72,
  "current_step": "calling_dify_workflow",
  "action_card_version": "vda68-2026-01",
  "workflow_version": "vda68-workflow-2026-01",
  "schema_version": "v1",
  "warnings": [
    {
      "code": "LOW_OCR_CONFIDENCE",
      "message": "部分扫描件 OCR 置信度较低"
    }
  ]
}
```

`GET /api/reviews/{task_id}/report` 继续优先返回 JSON。PDF / DOCX 报告留到后续阶段。

## 6. 日志和可观测性

第二阶段必须补充跨系统排障字段：

```text
request_id
task_id
owner_id
queue_job_id
dify_request_id
dify_message_id
dify_workflow_run_id
autodl_request_id
model_name
workflow_version
action_card_version
elapsed_ms
error_code
```

排障目标：

```text
能判断问题发生在 9002、Redis / Worker、文件解析、AutoDL、Dify Workflow、Dify 知识库还是 Xinference 模型
```

## 7. 数据保留和安全

第二阶段处理 OCR 和更多任务证据后，需要明确数据保留策略：

```text
上传原文件按 task_id 隔离保存
OCR 文本、chunk、result.json、report.json 按 owner_id 校验访问
临时文件清理策略可配置
日志不记录完整上传文件正文
日志不记录密钥
对 Dify 和 AutoDL 的错误响应做脱敏后保存
```

建议配置：

```env
REVIEW_UPLOAD_RETENTION_DAYS=30
REVIEW_RESULT_RETENTION_DAYS=180
REVIEW_LOG_BODY_MAX_CHARS=500
```

## 8. 第二阶段验收标准

第二阶段完成时，至少满足：

```text
Dify 长期 VDA 6.8 知识库可用
单检查项 Workflow 可真实调用
任务汇总可生成稳定 result.json
9002 不再依赖 mock 审核结果完成主流程
图片和扫描 PDF 可通过 AutoDL OCR 进入审核证据
每个扣分项能追溯到 VDA 条款和上传文件证据
证据不足时不会编造符合结论
错误码和日志能定位跨系统问题
验收集重复运行结果基本稳定
Cherry Studio 通过 9000 调 Dify 的链路不受 9002 改动影响
```

## 9. 推荐实施顺序

建议顺序：

```text
1. 先完成 Dify 长期知识库和单检查项 Workflow
2. 再让 9002 Dify Workflow Client 切换到真实调用
3. 固定 result.json Schema 和输出校验
4. 接入任务汇总 Workflow 或本地汇总
5. 接入 AutoDL OCR
6. 增加 chunk 摘要、关键词和候选条款初筛
7. 固化动作卡、prompt、workflow、schema 版本
8. 建立验收集并跑通线上联调
```

不要先做复杂前端和管理后台。第二阶段的重点是让审核推理链路可信、可追溯、可排错。
