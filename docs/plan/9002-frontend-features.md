# 9002 知识中台前端功能清单

关联文档：

- 总规划：[docs/vda68-review-service.md](../vda68-review-service.md)
- 第一阶段实施计划：[docs/plan/9002-phase1-plan.md](./9002-phase1-plan.md)
- 第二阶段实施计划：[docs/plan/9002-phase2-plan.md](./9002-phase2-plan.md)

本文档整理 `9002` 作为“知识中台”前端在第一阶段应提供的功能。第一阶段前端只负责上传、查看进度、展示审核结果和下载 JSON 报告，不直接调用 Dify，不直接处理文件解析，不做完整账号系统和管理后台。

## 1. 前端定位

9002 前端是面向业务用户的文件审核入口。

前端职责：

```text
上传 ZIP / 多文件
携带 Authorization 和 X-User-Id
创建审核任务
轮询任务状态
展示任务进度
展示审核结果
展示解析告警
展示执行动作状态
展示执行任务列表
下载 JSON 报告
```

前端不负责：

```text
拼接 Prompt
直接调用 Dify
直接调用 AutoDL
本地解析 ZIP / PDF / Word / Excel
直接读取服务器文件路径
维护长期 VDA 6.8 知识库
编辑执行动作卡
修改已生成的审核结果
完整账号登录和权限后台
```

## 2. 第一阶段页面结构

第一阶段建议只有一个主工作台页面，必要时加一个任务详情页。

```text
/                 知识中台审核工作台
/reviews           执行任务列表，可选；第一阶段可合并在首页
/reviews/{task_id} 任务详情页，可选；也可以在首页内展示
```

如果第一阶段追求最小闭环，可以只做单页：上传、进度、结果都在同一个页面内完成。

## 3. 第一阶段必须功能

### 3.1 服务连接配置

前端需要支持配置或注入：

```text
API Base URL
API_AUTH_KEY
X-User-Id
```

第一阶段不做完整登录时，`X-User-Id` 可以来自：

```text
上游系统注入
浏览器本地配置
测试输入框
部署环境默认值
```

约束：

```text
没有 Authorization 时不能提交任务
没有 X-User-Id 时不能提交任务
前端所有任务查询和报告下载请求都必须携带相同 X-User-Id
```

### 3.2 文件上传区

上传区需要支持：

```text
选择 ZIP 文件
选择多个文件
拖拽上传
显示待上传文件列表
显示文件名、大小、类型
移除待上传文件
提交审核任务
```

第一阶段允许类型：

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

前端应提前提示限制：

```text
单文件最大 100MB
单任务总大小 200MB
ZIP 解压后最大 500MB
ZIP 内最多 200 个文件
图片和扫描 PDF 第一阶段只标记 needs_ocr
```

前端校验只是用户体验优化，最终校验仍以后端为准。

### 3.3 创建任务

提交上传后调用：

```text
POST /api/reviews
```

成功后展示：

```text
task_id
status = pending
创建时间
当前用户标识
```

成功响应：

```json
{
  "task_id": "task_xxx",
  "status": "pending"
}
```

前端行为：

```text
提交后禁用重复提交
显示任务已创建
自动开始轮询任务状态
保留 task_id，便于刷新后继续查询
```

### 3.4 任务进度展示

前端通过轮询查询：

```text
GET /api/reviews/{task_id}
```

需要展示：

```text
任务状态
进度百分比
当前步骤
错误码
错误信息
告警信息
```

状态展示映射：

```text
pending：等待处理
extracting：正在解压和解析文件
chunking：正在生成证据切片
reviewing：正在调用审核工作流
reporting：正在生成报告
completed：审核完成
failed：审核失败
cancelled：任务已取消，后续可选
```

建议轮询策略：

```text
pending / extracting / chunking / reviewing / reporting：每 2-5 秒轮询
completed / failed：停止轮询
浏览器页面隐藏时降低轮询频率
```

### 3.5 解析结果和告警展示

前端需要展示文件解析情况：

```text
parsed_files：成功解析文件
failed_files：解析失败文件
unsupported_files：不支持文件
needs_ocr_files：需要 OCR 的文件
warnings：审核风险提示
```

第一阶段重点提示：

```text
图片和扫描 PDF 未进入 OCR，结果可能缺少这些证据
部分文件解析失败，审核结果可能不完整
不支持的文件未参与审核
```

### 3.6 审核结果总览

任务 completed 后，前端展示：

```text
总评分 total_score
总体结论 conclusion
审核标准 standard
风险摘要 risk_summary
总体整改建议 recommendations
缺失证据 missing_evidence
```

结论建议用清晰状态展示：

```text
符合
部分符合
不符合
证据不足
审核失败
```

### 3.7 分项评分表

前端需要展示 `items` 列表。

每一行至少展示：

```text
check_id
VDA 条款 clause / vda_clause
检查项标题 title
分数 score / max_score
状态 status
证据数量
问题数量
建议数量
```

支持基础交互：

```text
按状态筛选
按条款搜索
按分数排序
展开查看详情
```

第一阶段可以不做复杂表格组件，但必须能扫描和定位不符合项。

### 3.8 单项详情展示

展开单个检查项后展示：

```text
检查项标题
对应 VDA 6.8 条款
状态
得分
引用证据 evidence
缺失证据 missing_evidence
问题 issues
整改建议 suggestions
```

证据展示至少包含：

```text
filename
page / sheet_name / row_range / paragraph_index
chunk_id
summary
```

第一阶段不需要在线预览原文件，但要能显示证据来源位置。

### 3.9 不符合项列表

前端应提供一个独立区域，汇总：

```text
status = partial
status = non_compliant
status = evidence_insufficient
status = failed
```

每条展示：

```text
检查项
对应条款
问题描述
缺失证据
整改建议
```

这是业务用户最常用的区域，应优先保证可读性。

### 3.10 报告下载

第一阶段只支持 JSON 报告下载：

```text
GET /api/reviews/{task_id}/report
```

前端行为：

```text
任务 completed 后启用下载按钮
任务未完成时禁用下载按钮
如果后端返回 409 TASK_NOT_COMPLETED，展示任务尚未完成
如果返回 403，提示无权访问该任务
```

第一阶段不做 PDF / DOCX 下载按钮，或显示为后续功能。

### 3.11 错误提示

前端需要识别并展示统一错误码：

```text
UNAUTHORIZED：认证失败
FORBIDDEN：无权访问该任务
TASK_NOT_FOUND：任务不存在
TASK_NOT_COMPLETED：任务尚未完成
FILE_TOO_LARGE：文件过大
TOO_MANY_FILES：文件数量过多
UNSUPPORTED_FILE_TYPE：文件类型不支持
ZIP_EXTRACT_FAILED：ZIP 解压失败
EXTRACT_FAILED：文件解析失败
DIFY_CALL_FAILED：审核工作流调用失败
REVIEW_OUTPUT_INVALID：审核结果格式无效
INTERNAL_ERROR：服务内部错误
```

错误展示原则：

```text
用户能理解原因
提示下一步动作
保留 task_id 便于排查
不要暴露服务器内部路径和密钥
```

### 3.12 审核结果只读

审核内容输出结果不允许在前端直接修改。审核结果属于系统根据上传证据、执行动作卡和 VDA 6.8 知识库生成的正式输出，前端只能展示、下载和复制。

前端约束：

```text
不提供编辑 total_score / conclusion / items 的入口
不提供编辑 evidence / issues / suggestions 的入口
不提供直接覆盖 result.json 的入口
报告下载内容与后端保存的 result.json 保持一致
```

如果业务需要人工补充或复核，应作为后续“人工复核 / 审核管理”流程单独设计，不能直接修改原始审核输出。建议采用追加记录：

```text
review_result：系统原始审核结果，只读
review_notes：人工备注，后续阶段可选
review_overrides：人工复核结论，后续阶段可选，必须保留审计记录
```

### 3.13 执行动作状态展示

执行卡的动作与动作之间需要有动作状态，用于展示审核过程、定位卡点和后续预警。

前端需要展示动作卡检查项状态：

```text
not_started：未开始
queued：已入队
running：执行中
passed：通过
partial：部分符合
failed：不符合或执行失败
evidence_insufficient：证据不足
skipped：跳过
```

在分项评分表中，每个 `check_id` 应展示：

```text
动作状态
开始时间
完成时间
耗时
关联证据数量
错误码，可选
```

如果后端第一阶段暂时没有逐动作状态接口，前端可先用 `items.status` 和任务阶段推导展示；后续应由后端提供动作级状态。

### 3.14 缺少相关文档时的补充入口

当审核过程中发现没有相关文档或证据不足时，前端需要在审核管理区域提示用户补充资料。

触发场景：

```text
missing_evidence 非空
needs_ocr_files 非空
unsupported_files 非空
某个检查项 status = evidence_insufficient
某个检查项 evidence 为空
```

第一阶段前端建议提供：

```text
缺失文档提示
缺失证据清单
需要补充的文件类型说明
重新上传 / 新建任务入口
```

第一阶段不建议直接在原任务内追加文件并重跑。更稳的做法是提示用户补充材料后创建新任务，避免原始审核结果被覆盖。

后续阶段可增强为：

```text
在审核管理中为原 task 追加补充文档
生成补充审核任务
保留原任务和补充任务关联关系
展示补充前后对比
```

### 3.15 运营反馈和调度任务预警

根据运营系统反馈数据和调度任务信息，前端需要预留预警展示能力。第一阶段可先做静态入口或接口占位，后续接入实际运营系统。

预警来源：

```text
运营系统反馈数据
调度任务状态
审核任务失败率
Dify 调用失败
文件解析失败
证据不足比例
任务长时间卡在某一状态
```

预警类型：

```text
任务超时预警
审核失败预警
证据不足预警
文档缺失预警
调度任务异常预警
运营反馈风险预警
```

第一阶段前端建议：

```text
在任务详情显示当前任务预警
在任务列表显示预警标识
预留预警列表区域
展示 warning_code / warning_message / created_at
```

后续阶段再接入运营系统反馈接口和调度任务监控接口。

### 3.16 执行任务列表

前端需要提供执行任务列表，用于查看当前用户的审核任务。第一阶段如果后端暂未提供任务列表接口，可以先使用 localStorage 记录当前浏览器创建过的 task_id；后续由后端提供正式列表接口。

任务列表字段：

```text
task_id
任务名称，可选
owner_id
status
progress
current_step
created_at
updated_at
finished_at
warnings_count
error_code
```

列表能力：

```text
查看任务详情
按状态筛选
按创建时间排序
搜索 task_id
展示失败原因
展示预警标识
下载 completed 任务报告
```

后续正式接口建议：

```text
GET /api/reviews?status=&page=&page_size=
```

列表只展示当前 `X-User-Id` 有权限访问的任务。

## 4. 第一阶段可选增强

以下功能可以做，但不应阻塞第一阶段验收：

```text
执行任务列表，仅显示当前 X-User-Id 的任务
最近任务列表，可用 localStorage 记录 task_id
任务详情页 URL 可复制
上传历史保存在浏览器本地
结果 JSON 预览和复制
分项结果导出 CSV
前端主题和品牌样式
任务失败后重新提交相同文件
缺失文档补充提示
预警标识和预警列表占位
```

如果后端未提供任务列表接口，最近任务列表可以先用浏览器 localStorage 记录当前用户创建过的 task_id。

## 5. 后续阶段前端功能

第二阶段或第三阶段再考虑：

```text
完整登录页
用户任务历史
管理员任务管理
动作卡版本管理页面
VDA 知识库维护入口
OCR 结果复核页面
原文件在线预览
证据 chunk 高亮定位
PDF / DOCX 报告下载
任务重试和取消
审核结果人工复核，不直接修改原始结果
补充文档追加审核
运营系统反馈预警
调度任务状态监控
多租户空间管理
审计日志查询
```

## 6. 第一阶段前端验收标准

前端完成需要满足：

```text
可以选择 ZIP 或多文件并提交审核
提交时携带 Authorization 和 X-User-Id
提交成功后显示 task_id
能自动轮询任务状态
能展示 pending / extracting / chunking / reviewing / reporting / completed / failed
能展示 progress 和 current_step
能展示 failed 任务的 error_code 和 error_message
能展示 parsed_files / failed_files / unsupported_files / needs_ocr_files / warnings
completed 后能展示 total_score / conclusion / items
能展示分项评分表
能展开查看 evidence / missing_evidence / issues / suggestions
能汇总展示不符合项和整改建议
审核结果页面不提供直接修改入口
能展示动作卡检查项状态
能展示缺失文档和证据不足提示
能查看当前用户执行任务列表或本地最近任务列表
能展示任务预警标识或预警占位
completed 后能下载 JSON 报告
未 completed 下载报告时能处理 409 TASK_NOT_COMPLETED
非 owner 访问时能处理 403 FORBIDDEN
任务不存在时能处理 404 TASK_NOT_FOUND
```

## 7. 建议页面布局

第一阶段建议采用单页工作台布局：

```text
顶部：知识中台 / VDA 6.8 文件审核
左侧：上传区、用户标识、任务信息
中部：任务进度、状态、告警
右侧或下方：审核结果总览
下方：分项评分表、不符合项、整改建议、报告下载
```

如果内容较多，可以拆为：

```text
上传与任务状态
审核结果总览
分项检查结果
问题与整改建议
报告下载
```

## 8. 与后端接口关系

第一阶段前端依赖接口：

```text
POST /api/reviews
GET /api/reviews/{task_id}
GET /api/reviews/{task_id}/report
GET /api/reviews，后续正式任务列表接口
GET /health
GET /ready
```

所有受保护接口需要携带：

```text
Authorization: Bearer API_AUTH_KEY
X-User-Id: 当前用户标识
```
