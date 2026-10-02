# 9002 第一阶段项目实施计划

总规划文档：[docs/vda68-review-service.md](../vda68-review-service.md)

第一阶段 Dify Demo：[docs/plan/dify-phase1-demo.md](./dify-phase1-demo.md)

第二阶段计划：[docs/plan/9002-phase2-plan.md](./9002-phase2-plan.md)

本文档面向当前项目的 `9002` VDA 6.8 文件审核服务，目标是把 [docs/vda68-review-service.md](../vda68-review-service.md) 中的第一阶段规划落成可运行、可排错、可验收的应用服务。

第一阶段只做业务闭环和工程底座，不扩展完整登录、PDF / DOCX 报告、OCR、向量库、AutoDL 实际推理和复杂管理后台。

## 1. 第一阶段目标

第一阶段需要完成：

```text
第一阶段 Dify Demo
9002 FastAPI 服务骨架
API Key + X-User-Id 用户隔离
ZIP / 多文件上传
任务持久化
Redis + RQ / Celery 队列
Worker 异步处理任务
基础文件解析
可追溯 chunk metadata
结构化执行动作卡 JSON / YAML
Dify Workflow Client 占位和调用链路
结构化审核结果 result.json
JSON 报告下载
Docker Compose 9002 api + worker + redis
/health 和 /ready
第一阶段验收用例
```

第一阶段明确不做：

```text
完整账号登录
管理员后台
PDF / DOCX 报告
OCR 实际执行
AutoDL 实际推理
长期向量库
复杂重试调度
动作卡在线编辑
```

## 2. 推荐目录结构

建议新增 `fuller_rag/` 作为 9002 服务目录，保留现有 `app/` 作为 9000 网关。

```text
fuller_rag/
  main.py
  config.py
  auth.py

  api/
    reviews.py
    reports.py

  core/
    tasks.py
    storage.py
    errors.py
    security.py

  upload/
    validators.py
    zip_handler.py

  parsing/
    extractors.py
    ocr.py
    chunking.py

  standards/
    action_cards.py
    schemas.py

  workflow/
    dify_client.py
    autodl_client.py
    review_runner.py

  queue/
    redis.py
    jobs.py
    worker.py

  reports/
    json_report.py

  models/
    task.py
    review_result.py
    chunk.py

  data/
    action_cards/
      vda68.yml
```

## 3. 技术选型

第一阶段建议选型：

```text
Web 框架：FastAPI
任务队列：Redis + RQ，Celery 可替代
任务数据库：SQLite 起步；如确定容器多 Worker，直接 PostgreSQL
文件存储：本地挂载目录 data/
报告格式：JSON
文件解析：TXT / Markdown / DOCX / XLSX / 可抽文本 PDF
OCR：仅标记 needs_ocr，不执行
AutoDL：仅配置占位
```

数据目录建议：

```text
data/
  uploads/{task_id}/original/
  uploads/{task_id}/extracted/
  chunks/{task_id}/chunks.json
  results/{task_id}/result.json
  reports/{task_id}/report.json
```

## 4. 里程碑拆分

### 4.1 M1：9002 服务骨架

任务：

```text
创建 fuller_rag/ 目录结构
创建 FastAPI app
挂载 /health
挂载 /ready
拆分 api/reviews.py 和 api/reports.py
补充 9002 配置项
```

配置项至少包括：

```text
API_AUTH_KEY
REVIEW_DATA_DIR
REVIEW_DATABASE_URL
REDIS_URL
REVIEW_QUEUE_NAME
DIFY_WORKFLOW_API_BASE
DIFY_WORKFLOW_API_KEY
DIFY_SINGLE_CHECK_WORKFLOW_ID
DIFY_SUMMARY_WORKFLOW_ID
AUTODL_API_BASE
AUTODL_API_KEY
AUTODL_ENABLE_OCR=false
AUTODL_ENABLE_RERANK=false
AUTODL_ENABLE_LLM=false
```

验收：

```text
GET /health 返回 ok
GET /ready 能检查配置、数据库、Redis、数据目录
9002 可以通过 Docker Compose 启动
```

### 4.2 M2：鉴权和用户隔离

任务：

```text
实现 Authorization: Bearer API_AUTH_KEY 校验
实现 X-User-Id 解析
没有 X-User-Id 时拒绝创建任务
查询任务时校验 owner_id
下载报告时校验 owner_id
```

接口行为：

```text
无 Authorization 返回 401
无 X-User-Id 返回 401 或 422
非 owner 访问 task_id 返回 403
不存在 task_id 返回 404
```

### 4.3 M3：数据库和任务模型

第一阶段至少实现以下数据对象：

```text
review_tasks
review_files
review_chunks
review_results
```

`review_tasks` 至少包含：

```text
task_id
owner_id
status
progress
current_step
queue_job_id
action_card_version
workflow_version
prompt_version
error_code
error_message
created_at
updated_at
started_at
finished_at
result_json_path
report_path
```

任务状态固定为：

```text
pending
extracting
chunking
reviewing
reporting
completed
failed
cancelled
```

验收：

```text
创建任务后数据库可查
Worker 更新状态后 GET /api/reviews/{task_id} 可见
失败任务能记录 error_code 和 error_message
```

### 4.4 M4：上传和 ZIP 安全

实现接口：

```text
POST /api/reviews
```

成功响应：

```json
{
  "task_id": "task_xxx",
  "status": "pending"
}
```

上传限制默认值：

```text
单文件最大：100MB
单任务上传总大小：200MB
ZIP 解压后最大：500MB
ZIP 内最大文件数：200
ZIP 最大目录深度：8
单任务最大 chunk 数：3000
```

允许类型：

```text
.zip
.pdf
.docx
.xlsx
.txt
.md
.png
.jpg
.jpeg
```

禁止类型：

```text
.exe
.bat
.sh
.dll
.so
.js
.html
.php
```

ZIP 必须实现：

```text
Zip Slip 防护
解压路径必须在 data/uploads/{task_id}/extracted/ 内
文件数量限制
解压后总大小限制
目录深度限制
危险扩展名拒绝
```

### 4.5 M5：队列和 Worker

第一阶段必须引入队列，不使用 FastAPI BackgroundTasks 作为主方案。

建议：

```text
Redis + RQ
队列名称：review_default
Worker 并发：1-2
单任务超时：30 分钟
Dify 单次调用超时：120 秒
Dify 调用失败重试：1 次
```

Worker 主流程：

```text
读取 task
更新 extracting
安全解压 ZIP / 整理多文件
文件类型识别
文本抽取
更新 chunking
生成 chunk metadata
读取 action_cards/vda68.yml
更新 reviewing
按动作卡调用 Dify 单检查项 Workflow
汇总 items
更新 reporting
生成 result.json 和 report.json
更新 completed
```

失败处理：

```text
文件校验失败：不入队，直接返回 400
文件解析失败：记录 failed_files，可继续则继续
Dify 调用失败：记录 DIFY_CALL_FAILED
Dify 输出无效：记录 REVIEW_OUTPUT_INVALID
Worker 未捕获异常：记录 INTERNAL_ERROR
```

### 4.6 M6：文件解析和 needs_ocr

第一阶段支持：

```text
TXT / Markdown 直接读取
DOCX 抽取段落和表格文本
XLSX 按 Sheet 抽取单元格文本
PDF 先尝试直接抽文本
```

第一阶段不执行 OCR：

```text
图片标记 needs_ocr
扫描版 PDF 标记 needs_ocr
文本过少 PDF 标记 needs_ocr
```

解析结果需要记录：

```text
parsed_files
failed_files
unsupported_files
needs_ocr_files
warnings
```

### 4.7 M7：chunking 和证据溯源

每个 chunk 至少包含：

```text
task_id
owner_id
file_id
filename
file_type
source_path
page
sheet_name
row_range
paragraph_index
heading_path
chunk_id
chunk_text
char_count
token_count
extract_method
ocr_confidence
```

切片规则：

```text
ZIP 不直接切片
PDF 按页和段落切片
DOCX 按标题层级、段落、表格切片
XLSX 按 Sheet 和连续表格区域切片
TXT / Markdown 按标题、段落和长度切片
普通文本 chunk：800-1500 中文字
overlap：100-200 字
```

验收：

```text
chunks.json 存在
chunk 能追溯到原始文件、页码、Sheet 或段落
GET 任务结果里的 evidence 能引用 chunk_id
```

### 4.8 M8：执行动作卡和 Dify Workflow Client

第一阶段动作卡用文件维护：

```text
fuller_rag/data/action_cards/vda68.yml
```

动作卡字段：

```text
check_id
title
vda_clause
expected_evidence
judgement_rule
max_score
weight
```

Dify Workflow 设计：

```text
Workflow 1：单检查项审核
Workflow 2：任务汇总审核
Workflow 3：证据增强 / 初筛，第二阶段启用
```

9002 第一阶段必须实现：

```text
Dify Workflow Client
单检查项 Workflow 调用
任务汇总 Workflow 调用或本地汇总
Dify 输出 JSON schema 校验
原始响应保存
规整 result.json 保存
```

Dify 输出失败策略：

```text
非 JSON：重试 1 次
schema 不通过：REVIEW_OUTPUT_INVALID
单项失败：item 标记 failed 或 evidence_insufficient
失败项超过阈值：task failed
```

### 4.9 M9：报告和查询接口

接口：

```text
GET /api/reviews/{task_id}
GET /api/reviews/{task_id}/report
```

`GET /api/reviews/{task_id}` 返回：

```json
{
  "task_id": "task_xxx",
  "status": "reviewing",
  "progress": 60,
  "current_step": "calling_dify_workflow",
  "result": null,
  "error_code": null,
  "error_message": null,
  "warnings": []
}
```

第一阶段报告只支持 JSON。

行为：

```text
completed 任务可以下载 report.json
未 completed 任务下载报告返回 409 TASK_NOT_COMPLETED
非 owner 下载返回 403
不存在 task_id 返回 404
```

### 4.10 M10：部署、日志和清理

Docker Compose 至少包含：

```text
9002 api
9002 worker
redis
```

如使用 PostgreSQL，加入：

```text
postgres
```

如使用 SQLite：

```text
挂载 data/ 持久化目录
```

日志必须包含：

```text
task_id
owner_id
queue_job_id
current_step
duration_ms
error_code
```

清理策略：

```text
completed 任务保留 30 天
failed 任务保留 7 天
临时解压目录任务完成后可清理
result.json 和 report.json 按任务保留期清理
清理任务由 Worker 或独立 scheduler 执行
```

## 5. 第一阶段统一错误码

```text
UNAUTHORIZED
FORBIDDEN
TASK_NOT_FOUND
TASK_NOT_COMPLETED
FILE_TOO_LARGE
TOO_MANY_FILES
UNSUPPORTED_FILE_TYPE
ZIP_EXTRACT_FAILED
EXTRACT_FAILED
DIFY_CALL_FAILED
REVIEW_OUTPUT_INVALID
INTERNAL_ERROR
```

统一错误响应：

```json
{
  "error_code": "TASK_NOT_FOUND",
  "message": "Task not found"
}
```

## 6. 第一阶段验收标准

必须满足：

```text
可以上传 ZIP / 多文件并立即返回 task_id
任务写入数据库并投递队列
Worker 可以消费任务并更新状态
GET /api/reviews/{task_id} 可以看到 pending / extracting / chunking / reviewing / completed / failed
不同 X-User-Id 不能访问彼此 task_id
无 Authorization 返回 401
非 owner 访问返回 403
不存在 task_id 返回 404
超大文件被拒绝
异常 ZIP 被拒绝
不支持文件类型进入 unsupported_files 或直接被拒绝
图片和扫描 PDF 标记为 needs_ocr
成功任务生成 result.json
Dify 返回异常时任务 failed，并有 error_code
completed 任务可以下载 JSON 报告
未 completed 任务下载报告返回 409
日志可以按 task_id 追踪完整处理链路
```

## 7. 建议执行顺序

建议按以下顺序实现，避免队列、解析和 Dify 同时耦合导致难排错：

```text
1. 9002 FastAPI 骨架、配置、健康检查
2. 数据库模型和任务状态流转
3. 鉴权、X-User-Id、owner 校验
4. 上传接口、文件保存、上传限制
5. Redis + 队列 + Worker 空任务跑通
6. ZIP 安全解压和文件类型识别
7. 基础文本抽取和 needs_ocr 标记
8. chunking.py 和 chunks.json
9. action_cards/vda68.yml
10. Dify Workflow Client 占位和 mock 输出
11. Dify 真实调用和 JSON schema 校验
12. result.json / report.json
13. Docker Compose api + worker + redis
14. 第一阶段验收测试
```

第一阶段中的 Dify Demo 先按 [docs/plan/dify-phase1-demo.md](./dify-phase1-demo.md) 执行，用于确认 Dify 知识库、Xinference 模型供应商、9000 网关和 Cherry Studio 链路可用。

第一阶段完成并验收后，继续执行第二阶段计划：[docs/plan/9002-phase2-plan.md](./9002-phase2-plan.md)。第二阶段重点是接入真实 Dify VDA 6.8 Workflow、长期知识库、AutoDL OCR / embedding / rerank，并把第一阶段的 mock / 占位审核输出推进到真实业务闭环。
