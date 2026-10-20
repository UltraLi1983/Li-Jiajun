# 物理设备唯一身份体系：研究结论与 Codex 交接任务

> 状态：业务设计草案（待确认），不是已批准的实现规范。
> 适用项目：On-site R&R 校准生产核心参数；后续兼容 ERP/EAM、MES、APS、IoT 与数字孪生。
> 目的：供 Codex 读取、检查现有代码和文档、提出实施设计；**未经确认不得直接重构现有主数据或迁移历史记录**。

## 1. 背景与现有约束

根据 `04-development-roadmap.md`：

- 产品路线 Operation、工序内设备关联流水号（如 `OP10-1`）、唯一物理设备号是不同身份；当前 `stationId` 不可直接作为永久物理设备 ID。
- 设备先声明可承接的工艺类型，再确认具体工艺资格；CT、pieces/cycle、P、Q 按设备分别复核，复制参数仅生成待确认草稿。
- 一台设备跨工序只能拥有一份工时预算；没有分时分配时不能重复计入产能。
- 工艺库的资源补录已要求独立物理设备号、工站排产键、来源和具体工艺资格；正式上游导入、资格审批、时效绑定和共享预算规则尚待实现。
- 现有研发优先级仍以 R&R 与产能参数计算为主，不在本任务引入完整 APS 或完整数字孪生平台。

## 2. 外部实践与标准的参考定位

| 体系 | 核心概念 | 对本项目的意义 |
|---|---|---|
| SAP EAM / PM | Equipment Number 与 Functional Location 分离 | 设备实体身份不等于安装位置 |
| SAP FI-AA | Fixed Asset Number | 财务资产身份不等于生产设备身份；关系未必一对一 |
| 制造商 | Serial Number | 作为外部标识，可能缺失、重复或需与制造商共同判定 |
| GB/T 14885-2022 | 固定资产等资产基础分类与代码 | 资产**分类码**不是单台设备的唯一实例码 |
| ISO 55000 系列 | 资产管理原则 | 关注生命周期管理，不规定统一的设备实例流水号格式 |
| ISO 23247 | 制造数字孪生框架 | 物理制造元素与数字表示分离 |
| IDTA Asset Administration Shell (AAS) | `globalAssetId`、`specificAssetIds`、`AAS.id` | 物理资产全球标识、特定系统标识、数字管理壳标识不可混淆 |

注意：以上是架构参考，不代表存在一套中外企业统一强制使用的设备编码规则。不同企业具体实施应通过真实客户样本验证。

参考入口：
- SAP Help: https://help.sap.com/
- GB/T 14885-2022 国家标准信息公共服务平台：https://std.samr.gov.cn/
- ISO 23247：https://www.iso.org/standard/75066.html
- IDTA AAS：https://industrialdigitaltwin.org/en/content-hub/aasspecifications

## 3. 建议冻结的身份原则（待业务批准）

1. **设备实体永久身份**：每个纳入管理、可独立识别的物理设备实例拥有不可变 `equipmentUid`；报废后不可复用。
2. **业务可读码独立**：`equipmentCode` 供铭牌、二维码、现场操作使用；建议企业范围唯一，且原则上稳定。
3. **不编码易变信息**：永久 ID 不内嵌工厂、车间、产线、工序、安装位置、资产类别。
4. **外部系统别名映射**：ERP Equipment Number、财务资产号、制造商序列号、PLC/IoT 标识等保存来源、作用域和有效期，不能默认为内部主键。
5. **历史不可改写**：搬迁、换绑、资格变化、CT/P/Q 版本变化不能反向覆盖历史 R&R 证据与产能计算依据。
6. **数字孪生独立身份**：未来 `AAS.id` 与设备 UID 不应直接混为一项；预留 `globalAssetId` 和 `specificAssetIds` 的映射能力。
7. **设备与产能资源解耦**：设备可能一机多工序、多设备构成一个工站；产能预算不得按关联条数重复累计。

## 4. 建议的数据对象

| 对象 | 示例 | 职责 |
|---|---|---|
| Physical Equipment | `EQ-000001872` | 物理设备永久身份 |
| Equipment Type / Model | `CNC-3AXIS` | 设备类别、型号、能力模板 |
| Functional Location | `CN-SH-P01-L03` | 随时间变化的安装位置 |
| Station / Capacity Resource | `ST-000034` | 可排产资源与共享工时预算 |
| Operation | `OP20` | 产品路线中的工序实例 |
| Operation Equipment Assignment | `OP20-2` | 设备/工站与工序的有时效关联；显示流水号不作为永久主键 |
| Digital Twin / AAS | `urn:example:aas:eq:000001872` | 数字表示独立身份（未来） |

以上是**关联对象**，不是必须按六级父子层级建模。

### 4.1 建议字段

```text
PhysicalEquipment
  equipmentUid             // 不可变技术主键；推荐 UUIDv7 或等效全局唯一 ID
  equipmentCode            // 人工可读、租户/企业内唯一，如 EQ-000001872
  equipmentTypeId          // 设备类型引用
  manufacturer             // 可选
  manufacturerSerialNo     // 可选，不单独承担唯一主键职责
  lifecycleStatus          // planned/received/active/inactive/retired 等，需受控词表
  createdAt
  retiredAt                // 可选

EquipmentExternalIdentity
  identityId
  equipmentUid
  systemType               // ERP/EAM/FI-AA/MES/IoT/AAS/other
  sourceSystemId
  namespace
  externalId
  validFrom
  validTo

EquipmentLocationHistory
  equipmentUid
  functionalLocationId
  validFrom
  validTo

EquipmentStationBinding
  bindingId
  equipmentUid
  stationId
  role                     // 主设备/子设备/辅助设备等（待确认）
  validFrom
  validTo

EquipmentProcessQualification
  qualificationId
  equipmentUid
  processId
  status
  validFrom
  validTo
  approvalReference

EquipmentConfigurationVersion
  configurationVersionId
  equipmentUid
  validFrom
  validTo
  changeReason
```

> 字段仅为逻辑草案；Codex 应先与当前 domain types 对照，避免重复定义。外部资产号与设备号可能为多对多，不能简单假设每台设备只有一个固定资产卡片号。

## 5. 生命周期与数字投影

- 设备从 A 工厂搬到 B 工厂：保留 `equipmentUid`，结束旧位置绑定并创建新绑定。
- 工序从 OP10 改为 OP20：保留物理身份，新增有时效的 Assignment，必要时重新确认工艺资格和 CT/P/Q。
- 更换 PLC、IP、传感器：保留设备身份，调整数据源映射及有效期。
- 重大改造：原则上保留设备身份并生成配置版本；若实体整体替换、拆分、合并，需制定新 UID 与前后继关系规则。
- R&R 历史记录：保留当时的 `equipmentUid`、`stationId`、`operationId`、assignment/version、参数版本、事件时间和证据来源快照。
- 数字孪生：先解决物理身份、拓扑、状态、时效和数据血缘，再考虑 AAS 互操作、仿真、三维呈现。

## 6. 必须确认的关键业务问题

1. **Station 定义**：它是单台物理设备，还是可由多台设备组成的生产能力单元？建议按后者建模。
2. **设备颗粒度**：机器人本体、焊机、变位机、PLC 是否各自建档？建议以独立维护/替换/监控/生命周期价值为依据，而非所有零件都建档。
3. **产能资源归属**：一台设备支持多个工序时，哪个 `capacityResourceId` 持有唯一工时预算？组合工站如何避免重复计数？
4. **设备号生成权威**：系统自己发号，还是接受客户 EAM 主档为权威？建议支持双模式并建立不可变内部 UID。
5. **多租户作用域**：`equipmentCode` 在租户内还是企业集团内唯一？跨法人调拨时是否延续同一主档？
6. **历史迁移**：现有 `stationId` 和本地验证资源怎样安全映射到新设备主档？
7. **待投资设备**：应先拥有规划资源 ID，而非冒充已到货设备；不得提前计入实际可排产能力。

## 7. Codex 后续工作任务（先分析，不直接写代码）

请按以下顺序执行：

1. 阅读本文件与 `04-development-roadmap.md`，再阅读 `docs/16-process-execution-equipment-architecture.md`、`docs/17-cursor-process-library.md` 以及现有 domain types、Station Assignment、capacity engine 相关实现。
2. 绘制现有对象关系：`ProcessMaster`、`Operation`、`stationId`、资源主档、设备编号、资格、参数、事件账、R&R 证据包、产能预算；区分已实现、仅文档定义、未实现。
3. 逐项评估本文件建议与既有口径是否冲突；**不要把 `stationId` 批量重命名为 `equipmentUid`**。
4. 提出目标领域模型（实体、主键、唯一约束、关联基数、时间有效期、版本/审计规则），并提供最小迁移方案。
5. 设计三组验收场景：A. 一机一站；B. 一机多工序共享时间预算；C. 多设备组成一个工站；再覆盖搬迁、设备更换、报废与历史 R&R 追溯。
6. 将开发任务拆为小包：设备主档与别名映射、时效绑定、工艺资格、产能资源预算去重、历史证据兼容、数字孪生接口预留。
7. 输出**待用户确认的问题清单**，标明每个决定对当前 R&R、后续 APS 和数字孪生的影响。等待业务确认后再实施。

### Codex 预期交付

- 当前状态与差距分析（含代码位置）
- 建议 ER/领域模型与字段约束
- 兼容/迁移与回滚策略
- 关键测试场景与验收条件
- 分阶段实施任务包
- 尚待业务决策的事项（不得自行替用户决定）

## 8. 当前不做的事情

- 不实现完整 EAM、财务固定资产管理、APS 或 AAS Server。
- 不强制所有设备具备制造商序列号、PLC 或三维模型。
- 不把物理设备数量直接等同于独立产能资源数量。
- 不将当前本地验证的设备资格视为正式批准。
- 不自动改写已发布 CT/P/Q、既有 R&R 历史或正式主数据。
