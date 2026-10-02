import { sampleScenario } from "../domain/sample-data.js";
import { calculateProductionSegment } from "../engine/run-rate-segment.js";
import { buildParameterSuggestions, confirmParameterSuggestion } from "../engine/parameter-calibration.js";
import { calculateRouteWindowCapacity } from "../engine/route-window-capacity.js";
import { publishParameterVersion, selectEffectiveParameter } from "../engine/parameter-versioning.js";
import { createRnrValidationFixture } from "../engine/rnr-validation-fixture.js";
import { buildRnrBestActualPreview } from "../engine/rnr-best-actual-preview.js";
import { formatNumber } from "./number-format.js";
import { calculateRnrPaceSummary, reconcileRnrSpeedLoss } from "../engine/rnr-reconciliation.js";
import { buildProductRoutingConfiguration, buildRnrEvidence, reconcileRnrTimeline, runCapacityAnalysisPreflight, validateTimelineEvents, } from "../index.js";
const languageSelect = requireElement("#languageSelect");
const languageLabelRoot = requireElement("label[for=\"languageSelect\"]");
const productSelect = requireElement("#productSelect");
const routeSelect = requireElement("#routeSelect");
const stationSelect = requireElement("#stationSelect");
const summaryRoot = requireElement("#summaryCards");
const productRoot = requireElement("#productPanel");
const routingRoot = requireElement("#routingPanel");
const routeStatusRoot = requireElement("#routeStatus");
const operationDetailRoot = requireElement("#operationDetailPanel");
const stationAssignmentRoot = requireElement("#stationAssignmentPanel");
const plannedSaRoot = requireElement("#plannedSaPanel");
const rnrRoot = requireElement("#rnrPanel");
const preflightRoot = requireElement("#preflightPanel");
const calibrationRoot = requireElement("#calibrationPanel");
const loadWarningRoot = document.querySelector("#appLoadWarning");
const workflowStages = ["routing", "baseline", "reality", "calibration"];
const PLANNED_SA_BASE_DATE = todayDateValue();
const PLANNED_SA_HORIZON_MINUTES = 48 * 60;
const MINUTE_PER_DAY = 24 * 60;
function todayDateValue() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const day = String(today.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
const workflowCopy = {
    zh: {
        stageRouting: "工艺路线与工站", stageBaseline: "标准 SA 设定", stageReality: "现场 R&R 跟踪", stageCalibration: "校准与产能分析",
        stageRoutingHint: "定义产品工序及对应工站，确认工站分配与参数。",
        stageBaselineHint: "在最多 48 小时的标准窗口内记录生产、休息、换型和计划停机。",
        stageRealityHint: "以当前工站的标准 SA 为参照，记录现场产出与节拍。",
        stageCalibrationHint: "复核观察草稿与标准基准，并检查进入产能分析的条件。",
        nextBaseline: "继续：标准 SA 设定", nextReality: "继续：现场 R&R 跟踪", nextCalibration: "查看参数校准与产能预检",
        stationSelectLabel: "当前工站",
        stationRequired: "请先在第一阶段为当前工序分配可用工站。",
        baselineRequired: "请先在第二阶段为当前工站建立标准 SA 时间段。",
        baselineReference: "当前工站标准 SA 参照", sampleBaseline: "当前为样例基准，请复核",
        observedDraft: "当前 R&R 草稿试算，尚未形成正式证据",
        draftCrossesPlannedLoss: "当前生产段覆盖标准计划中的休息、换型或停机时间；节拍与性能率需扣除这些时间后再复核。",
        draftProductionOnly: "当前生产段未覆盖标准计划损失；仍需核对实际停机记录。",
        draftWindow: "草稿时段", draftPlannedLoss: "其中计划非生产分钟",
        calibrationTitle: "标准基准与现场草稿对比",
        calibrationNote: "下列结果由当前页面记录计算；原因待查不阻止 Best/Actual SA。参数建议不会自动覆盖标准基准。",
        baselineSaMetric: "标准 SA（含休息）", draftPerformanceMetric: "草稿性能率", draftQualityMetric: "草稿良率",
        capacityPreviewOnly: "同窗跨工站能力仅为本地试算；长周期投影与正式排产产能尚未接入。",
        readyForCapacity: "工艺参数预检通过", blockedBeforeCapacity: "工艺参数预检被阻止",
        canEnterCapacityAnalysis: "工艺参数预检通过",
    },
    en: {
        stageRouting: "Routing and stations", stageBaseline: "Standard SA setup", stageReality: "On-site R&R tracking", stageCalibration: "Calibration and capacity",
        stageRoutingHint: "Define product operations, assign stations and check their parameters.",
        stageBaselineHint: "Record production, breaks, changeovers and planned stops in a standard window of up to 48 hours.",
        stageRealityHint: "Use the selected station standard SA as the reference for actual output and cycle observations.",
        stageCalibrationHint: "Review draft observations against the standard baseline and check capacity readiness.",
        nextBaseline: "Continue: Standard SA setup", nextReality: "Continue: On-site R&R", nextCalibration: "Review calibration and capacity preflight",
        stationSelectLabel: "Current station",
        stationRequired: "Assign an available station to this operation in stage 1 first.",
        baselineRequired: "Create standard SA intervals for this station in stage 2 first.",
        baselineReference: "Current station standard SA reference", sampleBaseline: "Sample baseline; please review",
        observedDraft: "Current R&R draft only; no formal evidence package yet",
        draftCrossesPlannedLoss: "The draft production segment overlaps planned breaks, changeovers or stops. Deduct these minutes before reviewing cycle time and performance.",
        draftProductionOnly: "The draft segment does not overlap planned losses; actual stoppages still need review.",
        draftWindow: "Draft window", draftPlannedLoss: "Planned non-production minutes within draft",
        calibrationTitle: "Standard baseline vs on-site draft",
        calibrationNote: "These figures use current records. An unknown cause does not block Best/Actual SA. Suggestions do not automatically change the planned baseline.",
        baselineSaMetric: "Standard SA (including breaks)", draftPerformanceMetric: "Draft performance rate", draftQualityMetric: "Draft quality rate",
        capacityPreviewOnly: "Same-window multi-station capacity is a local simulation; long-horizon projection and formal planning capacity are not yet connected.",
        readyForCapacity: "Parameter preflight passed", blockedBeforeCapacity: "Parameter preflight blocked",
        canEnterCapacityAnalysis: "parameter preflight passed",
    },
};
const copy = {
    zh: {
        appTitle: "排产产能参数工具",
        appSubtitle: "正式版：产品路线、工站分配、参数检查、计划SA和产能预检。",
        navProduct: "产品",
        navRoute: "路线",
        navOperation: "工序",
        navStationAssignment: "工站分配",
        navPlannedSa: "计划SA输入",
        navRnrReality: "R&R真实追踪",
        navParameterCheck: "参数检查",
        navCapacityAnalysis: "产能分析",
        languageLabel: "界面语言",
        productSelectLabel: "当前产品",
        routeSelectLabel: "当前路线",
        pageTitle: "产品路线设置",
        pageSubtitle: "先确认产品、工艺路线、工站绑定和参数门禁，再进入产能分析。",
        engineBadge: "正式版 · 已连接编译后的计算引擎",
        loadWarning: "正在加载正式版脚本。如果这里持续显示，说明 dist/ui/formal-app.js 没有成功加载，请先运行 npm run build，并确认通过 npm run serve 从当前项目目录访问页面。",
        routeOperationEyebrow: "路线和工序清单",
        routeOperationTitle: "工艺路线与工序清单",
        masterData: "主数据",
        checkedResult: "计算 / 检查结果",
        productRouteMockEdit: "产品 / 路线主数据（本地验证模式）",
        routeSource: "路线来源",
        effectivePeriod: "生效期间",
        editMockData: "编辑模拟数据",
        doneEditing: "完成编辑",
        resetSample: "重置样例",
        productCard: "产品卡片",
        routeCard: "路线卡片",
        productId: "产品 ID",
        project: "项目",
        version: "版本",
        family: "产品族",
        weeklyDemand: "周需求",
        annualizedDemand: "年化需求（按52周）",
        demandScenario: "需求场景",
        routeId: "路线 ID",
        operationCount: "工序数量",
        routeStatus: "路线状态",
        stationAssignmentCompleteness: "工站分配",
        parameterCompleteness: "参数完整性",
        selectedOperationAssignment: "当前工序工站分配",
        processType: "工艺类型",
        digitalTwinNode: "数字孪生节点",
        predecessor: "前序",
        successor: "后序",
        stationAssignmentConfig: "工站分配配置",
        stationAssignmentTitle: "工站分配专项页",
        stationAssignmentNote: "每个工序必须落到具体工站。备用工站的前置条件和客户批准门禁会在这里按阻止项处理。",
        plannedSaEyebrow: "标准 SA / 日历基准",
        plannedSaTitle: "标准 SA 设定 / 日历基准",
        bestCaseSaInput: "最佳情形SA输入",
        windowType: "窗口类型",
        station: "工站",
        horizonMinutes: "窗口总分钟",
        scheduledMinutes: "计划分钟",
        windowStart: "窗口开始",
        windowEnd: "窗口结束",
        addTimeBlock: "新增时间段",
        resetTimeBlockStart: "重置起点",
        intervalFirst: "先选时间段",
        addTimeBlockNote: "先定义起末日期和时间，再定义这一段的状态。持续分钟由系统计算，不作为主输入。计划动作只允许换型、休息、维护保养、计划停机。现场异常损失后续进入R&R观察记录，不写入计划SA基准。",
        rrAbnormalScope: "R&R异常损失范围：设备故障、工装问题、物流等待、质量隔离、人员问题。",
        startDate: "开始日期",
        startTime: "开始时间",
        endDate: "结束日期",
        endTime: "结束时间",
        hour: "时",
        minute: "分",
        blockCategory: "时间段类别",
        detailKind: "细分类型",
        labelNote: "标签 / 说明",
        submitCreatesEvent: "提交后会从该时间段生成一条时间线事件。",
        deleteEvent: "删除",
        calendarTimeline: "计划时间轴",
        eventEditor: "事件编辑器",
        maxFortyEightHours: "最大48小时窗口",
        minOneHourGrain: "分钟级时间输入，可按小时刻度展示",
        draftErrorOverlap: "该时间段与同工站已有事件重叠，请调整起末时间。",
        draftErrorBoundary: "结束时间必须晚于开始时间。",
        draftErrorWindowSpan: "所有时间段的整体跨度不能超过48小时。请将本次过程控制在48小时内，或先删除不属于本次过程的时间段。",
        fillGaps: "将空档填为未排产",
        scheduledMin: "计划分钟",
        plannedOperationMin: "计划生产分钟",
        plannedStopMin: "计划停机分钟",
        breakMin: "休息分钟",
        setupChangeoverMin: "换型分钟",
        unscheduledMin: "未排产分钟",
        bestCaseAvailableMin: "最佳情形可用分钟",
        bestCaseSaWithBreaks: "含休息最佳情形SA",
        bestCaseSaWithoutBreaks: "不含休息最佳情形SA",
        timelineValidation: "时间线校验结果",
        gapWarning: "空档提醒",
        parameterPreflight: "参数检查 / 产能预检",
        readyForCapacity: "可进入产能分析",
        blockedBeforeCapacity: "进入产能分析前被阻止",
        blockers: "阻止项",
        warnings: "警告",
        enterCapacityAnalysis: "进入产能分析",
        readiness: "就绪状态",
        ready: "已就绪",
        blocked: "被阻止",
        canEnterCapacityAnalysis: "可进入产能分析",
        blockerCount: "个阻止项",
        routingMetric: "工艺路线",
        operationUnit: "个工序",
        stationUnit: "个工站",
        unavailableStationAssignment: "个工站分配不可用于排产",
        demandMetric: "需求",
        perWeek: "每周",
        noScenario: "无场景",
        bottleneck: "瓶颈",
        noCapacityResult: "暂无产能结果",
        productMissing: "产品主数据缺失。",
        noRoutingOperations: "当前路线还没有配置工序。",
        selectOperationEmpty: "请选择一个工序，以查看工站分配和参数。",
        assignmentsCount: "个分配",
        noStationAssignmentConfigured: "尚未配置工站分配。",
        sequence: "顺序",
        operation: "工序",
        operationId: "工序ID",
        operationName: "名称",
        digitalTwinNodeShort: "数字孪生节点",
        role: "角色",
        allocation: "分配方式",
        planning: "排产状态",
        customerGate: "客户门禁状态",
        backupConditionBlocker: "备用条件 / 阻止原因",
        group: "工站组",
        planningAllowed: "允许排产",
        allocationMode: "分配模式",
        plannedShare: "产能占用口径",
        stdCt: "标准CT",
        piecesPerCycle: "每循环件数",
        pQ: "P / Q",
        blockerReason: "阻止原因",
        yes: "是",
        no: "否",
        forecastCalculated: "按需求/预测计算占用",
        defaultCapacityCeiling: "100%（未设固定上限）",
        missing: "缺失",
        notRequired: "已放行（无需客户批准）",
        demandScenarioLabel: "需求场景",
        singleDay: "单日窗口",
        productionNotSaLoss: "生产时间不作为SA损失",
        plannedLossKinds: "换型 / 休息 / 维护保养 / 计划停机",
        notPlannedNotOpenCapacity: "未排产不等于可随意调用的空闲产能",
        productionMinutesDetail: "生产分钟",
        availableScheduled: "可用 / 计划",
        eventId: "事件ID",
        kind: "类型",
        start: "开始",
        end: "结束",
        durationMin: "持续分钟",
        noTimelineIssue: "没有重叠、边界错误或超出窗口的问题。",
        noGapInHorizon: "当前窗口内没有空档。",
        warning: "提醒",
        gap: "空档",
        readinessIssues: "就绪问题",
        operationsChecked: "已检查工序",
        planningAllowedAssignments: "允许排产的分配",
        blockedBackupAssignments: "被阻止的备用分配",
        noHardBlocker: "没有硬性阻止项。",
        noWarning: "没有警告。",
        preflightPassedAction: "预检已通过，警告项会保留给计划人员复核。",
        preflightBlockedAction: "必须先解决硬性阻止项，才能进入产能分析。",
        severity: "级别",
        code: "代码",
        message: "信息",
        noReadinessIssue: "没有就绪问题。",
        requested: "占用上限",
        required: "需求占用",
        actual: "实际占用",
        riskStatus: "风险状态",
        riskMessages: "风险信息",
        noShareEvaluation: "暂无占用评估。",
        plannedQty: "计划数量",
        minimumHu: "最小HU",
        batchMultiple: "批量倍数",
        status: "状态",
        suggestedQty: "建议数量",
        noBatchHuCheck: "暂无批量/HU校验。",
        availableWord: "可用",
        blockedWord: "被阻止",
        planningStations: "个排产工站",
        noPlanningStation: "没有排产工站",
        minuteUnit: "分钟",
        digitalTwinShort: "数字孪生",
        fixedReserved: "固定预留",
        rnrEyebrow: "R&R / Reality Tracking",
        rnrTitle: "R&R真实追踪",
        rnrNote: "这里记录真实发生的生产过程和非计划停机，用于 Actual SA 和参数校准建议，不修改标准 SA 基准。",
        startRnr: "开始R&R",
        rnrTarget: "R&R目标",
        rnrMode: "监控模式",
        timeWindowMonitoring: "时间窗口监控",
        cycleCheck: "节拍检查",
        rnrStatus: "记录状态",
        notStarted: "尚未开始",
        realityTimeWindowNote: "时间窗口模式记录实际生产、计划活动、非计划中断，并输出真实SA和异常损失结构。",
        cycleCheckNote: "节拍检查不以时间轴为主，按目标样本数记录实测CT、标准CT、性能率和节拍稳定性。",
        productionSegmentRequiresQty: "生产段必须录入 OK / NOK 数量，系统计算实测CT、标准应产、隐藏损失和性能率。",
        timelineSplitNote: "真实追踪可把计划生产拆分为：生产 + 非计划停机 + 生产。",
        unplannedStopScope: "非计划停机范围",
        productionSegmentRecord: "生产段记录",
        cycleCheckRecord: "节拍样本记录",
        linkedProductionBlock: "关联计划生产段",
        evidenceSource: "证据来源",
        okQty: "OK数量",
        nokQty: "NOK数量",
        orderReference: "工单/参考",
        elapsedMin: "经过分钟",
        actualQty: "实际数量",
        observedCtSec: "实测CT",
        expectedQty: "标准应产",
        missingQty: "产出缺口",
        hiddenLossMin: "估算隐藏损失",
        performanceRate: "性能率",
        calculatedTile: "系统计算",
        segmentStable: "节拍稳定",
        segmentNeedsReview: "需要复核",
        cycleSamplesSec: "节拍样本秒",
        targetSampleCount: "目标样本数",
        sampleCount: "样本数",
        averageCt: "平均CT",
        cycleCheckResult: "节拍检查结果",
        modeTimeWindowHint: "用于校准 SA：记录一段真实生产时间、产出数量和异常损失。",
        modeCycleCheckHint: "用于校准性能率：达到目标样本数即可输出节拍结论。",
        capacityAnalysisSeparated: "完成现场记录后，在第四阶段复核参数并进行产能预检。",
    },
    en: {
        appTitle: "Scheduling Capacity",
        appSubtitle: "Formal UI for product routing, station assignment, parameter check, Planned SA and capacity preflight.",
        navProduct: "Product",
        navRoute: "Route",
        navOperation: "Operation",
        navStationAssignment: "Station Assignment",
        navPlannedSa: "Planned SA Input",
        navRnrReality: "R&R Reality",
        navParameterCheck: "Parameter Check",
        navCapacityAnalysis: "Capacity Analysis",
        languageLabel: "Language",
        productSelectLabel: "Current Product",
        routeSelectLabel: "Current Route",
        pageTitle: "Product Routing Setup",
        pageSubtitle: "Confirm product, route, station assignment and parameter gates before capacity analysis.",
        engineBadge: "formal shell · connected to dist engine",
        loadWarning: "Loading formal app script. If this remains visible, dist/ui/formal-app.js did not load. Run npm run build and serve from the current project directory.",
        routeOperationEyebrow: "Route and operation list",
        routeOperationTitle: "Route and Operation List",
        masterData: "master data",
        checkedResult: "calculated / checked result",
        productRouteMockEdit: "Product / route master data (local validation mode)",
        routeSource: "Route source",
        effectivePeriod: "Effective period",
        editMockData: "Edit mock data",
        doneEditing: "Done editing",
        resetSample: "Reset sample",
        productCard: "Product card",
        routeCard: "Route card",
        productId: "Product ID",
        project: "Project",
        version: "Version",
        family: "Family",
        weeklyDemand: "Weekly demand",
        annualizedDemand: "Annualized demand (52 weeks)",
        demandScenario: "Demand scenario",
        routeId: "Route ID",
        operationCount: "Operation count",
        routeStatus: "Route status",
        stationAssignmentCompleteness: "Station assignment",
        parameterCompleteness: "Parameters",
        selectedOperationAssignment: "Selected operation station assignment",
        processType: "Process type",
        digitalTwinNode: "Digital twin node",
        predecessor: "Predecessor",
        successor: "Successor",
        stationAssignmentConfig: "Station assignment configuration",
        stationAssignmentTitle: "Station Assignment Configuration",
        stationAssignmentNote: "Each operation must be assigned to concrete stations. Backup conditions and customer approval gates are handled as blocking here.",
        plannedSaEyebrow: "Standard SA / calendar baseline",
        plannedSaTitle: "Standard SA Setup / Calendar Baseline",
        bestCaseSaInput: "Best case SA input",
        windowType: "Window type",
        station: "Station",
        horizonMinutes: "Horizon minutes",
        scheduledMinutes: "Scheduled minutes",
        windowStart: "Window start",
        windowEnd: "Window end",
        addTimeBlock: "Add time block",
        resetTimeBlockStart: "Reset start",
        intervalFirst: "interval first",
        addTimeBlockNote: "Define start date/time and end date/time first, then define the state of the interval. Duration is calculated by the system and is not a primary input. Planned activity only allows setup / break / maintenance / plannedStop. Actual abnormal loss belongs to R&R observation and is not written into Planned SA baseline.",
        rrAbnormalScope: "R&R abnormal loss scope: equipmentFailure / toolingIssue / logisticsWaiting / qualityHold / laborIssue.",
        startDate: "Start date",
        startTime: "Start time",
        endDate: "End date",
        endTime: "End time",
        hour: "Hour",
        minute: "Minute",
        blockCategory: "Block category",
        detailKind: "Detail kind",
        labelNote: "Label / note",
        submitCreatesEvent: "Submit creates one TimelineEvent from this interval.",
        deleteEvent: "Delete",
        calendarTimeline: "Planned timeline",
        eventEditor: "Event editor",
        maxFortyEightHours: "Maximum 48-hour window",
        minOneHourGrain: "Minute-level time input with optional hourly timeline scale",
        draftErrorOverlap: "This interval overlaps another event on the same station. Adjust the start/end time.",
        draftErrorBoundary: "End time must be later than start time.",
        draftErrorWindowSpan: "The total span of all intervals cannot exceed 48 hours. Keep this run within 48 hours or delete intervals that do not belong to it.",
        fillGaps: "Fill gaps as unscheduled",
        scheduledMin: "Scheduled min",
        plannedOperationMin: "Planned operation min",
        plannedStopMin: "Planned stop min",
        breakMin: "Break min",
        setupChangeoverMin: "Setup/changeover min",
        unscheduledMin: "Unscheduled min",
        bestCaseAvailableMin: "Best case available min",
        bestCaseSaWithBreaks: "Best case SA with breaks",
        bestCaseSaWithoutBreaks: "Best case SA without breaks",
        timelineValidation: "Timeline validation result",
        gapWarning: "Gap warning",
        parameterPreflight: "Parameter check / capacity preflight",
        readyForCapacity: "Ready for capacity analysis",
        blockedBeforeCapacity: "Blocked before capacity analysis",
        blockers: "Blockers",
        warnings: "Warnings",
        enterCapacityAnalysis: "Enter Capacity Analysis",
        readiness: "Readiness",
        ready: "Ready",
        blocked: "Blocked",
        canEnterCapacityAnalysis: "can enter capacity analysis",
        blockerCount: " blocker(s)",
        routingMetric: "Routing",
        operationUnit: " OP",
        stationUnit: " stations",
        unavailableStationAssignment: " station assignment(s) not available",
        demandMetric: "Demand",
        perWeek: "week",
        noScenario: "no scenario",
        bottleneck: "Bottleneck",
        noCapacityResult: "no capacity result",
        productMissing: "Product is missing in master data.",
        noRoutingOperations: "No routing operations configured.",
        selectOperationEmpty: "Select an operation to inspect station assignments and parameters.",
        assignmentsCount: " assignment(s)",
        noStationAssignmentConfigured: "No station assignment configured.",
        sequence: "Sequence",
        operation: "Operation",
        operationId: "Operation ID",
        operationName: "Name",
        digitalTwinNodeShort: "Digital Twin Node",
        role: "Role",
        allocation: "Allocation",
        planning: "Planning",
        customerGate: "Customer gate status",
        backupConditionBlocker: "Backup condition / blocker",
        group: "Group",
        planningAllowed: "Planning allowed",
        allocationMode: "Allocation mode",
        plannedShare: "Capacity ceiling",
        stdCt: "Std CT",
        piecesPerCycle: "Pieces/cycle",
        pQ: "P / Q",
        blockerReason: "Blocker reason",
        yes: "yes",
        no: "no",
        forecastCalculated: "forecast-calculated capacity use",
        defaultCapacityCeiling: "100% (no fixed ceiling)",
        missing: "missing",
        notRequired: "Released (no customer approval required)",
        demandScenarioLabel: "Demand scenario",
        singleDay: "single day",
        productionNotSaLoss: "production time is not SA loss",
        plannedLossKinds: "setup / break / maintenance / planned stop",
        notPlannedNotOpenCapacity: "not planned is not open capacity",
        productionMinutesDetail: "production minutes",
        availableScheduled: "available / scheduled",
        eventId: "Event ID",
        kind: "Kind",
        start: "Start",
        end: "End",
        durationMin: "Duration min",
        noTimelineIssue: "No overlap, invalid boundary or outside-horizon issue.",
        noGapInHorizon: "No gap in configured horizon.",
        warning: "warning",
        gap: "gap",
        readinessIssues: "Readiness",
        operationsChecked: "Operations checked",
        planningAllowedAssignments: "Planning-allowed assignments",
        blockedBackupAssignments: "Blocked backup assignments",
        noHardBlocker: "No hard blocker.",
        noWarning: "No warning.",
        preflightPassedAction: "Preflight passed. Warnings are retained for planner review.",
        preflightBlockedAction: "Hard blockers must be resolved before capacity analysis.",
        severity: "Severity",
        code: "Code",
        message: "Message",
        noReadinessIssue: "No readiness issue.",
        requested: "Capacity ceiling",
        required: "Required",
        actual: "Actual",
        riskStatus: "Risk status",
        riskMessages: "Risk messages",
        noShareEvaluation: "No share evaluation.",
        plannedQty: "Planned qty",
        minimumHu: "Minimum HU",
        batchMultiple: "Batch multiple",
        status: "Status",
        suggestedQty: "Suggested qty",
        noBatchHuCheck: "No batch HU check.",
        availableWord: "available",
        blockedWord: "blocked",
        planningStations: " planning stations",
        noPlanningStation: "no planning station",
        minuteUnit: "min",
        digitalTwinShort: "DT",
        fixedReserved: "fixed reserved",
        rnrEyebrow: "R&R / Reality Tracking",
        rnrTitle: "R&R Reality Tracking",
        rnrNote: "Record actual production and unplanned stops here for Actual SA and parameter suggestions. The planned SA baseline is unchanged.",
        startRnr: "Start R&R",
        rnrTarget: "R&R target",
        rnrMode: "Monitoring mode",
        timeWindowMonitoring: "Time-window monitoring",
        cycleCheck: "Cycle Check",
        rnrStatus: "Recording status",
        notStarted: "Not started",
        realityTimeWindowNote: "Time-window mode records actual production, planned activities and unplanned interruptions, then outputs real / actual SA and abnormal loss structure.",
        cycleCheckNote: "Cycle Check is not timeline-first. It records observed CT, standard CT, performance rate and cycle stability against a target sample count.",
        productionSegmentRequiresQty: "Production segments must capture OK / NOK / actual qty. The system calculates observed CT, expected qty, hidden loss and performance rate.",
        timelineSplitNote: "Reality tracking can split planned production into production + unplanned stop + production.",
        unplannedStopScope: "Unplanned stop scope",
        productionSegmentRecord: "Production segment record",
        cycleCheckRecord: "Cycle sample record",
        linkedProductionBlock: "Linked planned production block",
        evidenceSource: "Evidence source",
        okQty: "OK qty",
        nokQty: "NOK qty",
        orderReference: "Order / reference",
        elapsedMin: "Elapsed min",
        actualQty: "Actual qty",
        observedCtSec: "Observed CT",
        expectedQty: "Expected qty",
        missingQty: "Missing qty",
        hiddenLossMin: "Estimated hidden loss",
        performanceRate: "Performance rate",
        calculatedTile: "calculated",
        segmentStable: "cycle stable",
        segmentNeedsReview: "needs review",
        cycleSamplesSec: "Cycle samples sec",
        targetSampleCount: "Target sample count",
        sampleCount: "Sample count",
        averageCt: "Average CT",
        cycleCheckResult: "Cycle Check result",
        modeTimeWindowHint: "For SA calibration: record a real production window, output quantity and abnormal losses.",
        modeCycleCheckHint: "For performance calibration: output CT once the target sample count is reached.",
        capacityAnalysisSeparated: "Review observations and capacity readiness in stage four.",
    },
};
let scenarioState = cloneScenario();
let locale = "zh";
let activeWorkflowStage = "routing";
let selectedProductId = "";
let selectedOperationId = "";
let selectedWorkflowStationId = "";
let isMockEditing = false;
let plannedSaEvents = [];
let plannedSaContextKey = "";
const plannedSaContexts = new Map();
let plannedSaEventsAreDefault = false;
let plannedBlockDraft = {
    startMinute: 0,
    endMinute: 60,
    category: "production",
    kind: "production",
    note: "",
};
let plannedSaDraftError = "";
let plannedDraftFollowsLatest = true;
let rnrMode = "timeWindow";
let rnrSegmentDraft = {
    startMinute: 510,
    endMinute: 570,
    okQty: 0,
    nokQty: 0,
    standardCycleSec: 24,
    piecesPerCycle: 1,
    orderId: "",
    evidenceSource: "",
    isEstimated: false,
};
let cycleCheckDraft = {
    samples: "",
    targetSamples: 20,
    standardCycleSec: 24,
    acceptableSlowDeviationPercent: undefined,
};
let rnrContextKey = "";
const rnrActualEventsByContext = new Map();
const validationFixtureContexts = new Set();
let rnrSelectedEventId = "";
let rnrActualKind = "production";
let rnrEventNote = "";
let rnrDraftError = "";
const rnrActualKinds = [
    "production", "setup", "break", "maintenance", "plannedStop",
    "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue", "unscheduled",
];
const rnrAbnormalKinds = new Set([
    "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue",
]);
const rnrDrafts = new Map();
const confirmedSuggestions = new Map();
const publishedSuggestions = [];
const suggestionDates = new Map();
const windowDemandByRoute = new Map();
const oneToOneRoutes = new Set();
let calibrationActionError = "";
function confirmationFingerprint(target, full, observation) {
    return ["standardCycleSec", "performanceRate", "qualityRate"].includes(target) ? full : observation;
}
function requireElement(selector) {
    const element = document.querySelector(selector);
    if (!element)
        throw new Error(`Formal app mount node is missing: ${selector}`);
    return element;
}
function cloneScenario() {
    return JSON.parse(JSON.stringify(sampleScenario));
}
function init() {
    languageSelect.value = locale;
    document.querySelectorAll("[data-stage-nav], [data-stage-next]").forEach(button => {
        button.addEventListener("click", () => {
            setWorkflowStage(button.dataset.stageNav ?? button.dataset.stageNext ?? "");
            window.scrollTo({ top: 0, behavior: "smooth" });
        });
    });
    languageSelect.addEventListener("change", () => {
        locale = languageSelect.value === "en" ? "en" : "zh";
        const currentProductId = selectedProductId;
        renderProductSelector();
        selectedProductId = currentProductId;
        productSelect.value = selectedProductId;
        syncRouteSelector(selectedProductId);
        applyShellTranslations();
        render(selectedProductId);
    });
    renderProductSelector();
    productSelect.addEventListener("change", () => {
        selectedProductId = productSelect.value;
        selectedOperationId = "";
        syncRouteSelector(selectedProductId);
        render(selectedProductId);
    });
    routeSelect.addEventListener("change", () => {
        selectedOperationId = "";
        selectedWorkflowStationId = "";
        render(selectedProductId);
    });
    stationSelect.addEventListener("change", () => {
        selectedWorkflowStationId = stationSelect.value;
        render(selectedProductId);
    });
    selectedProductId = productSelect.value || scenarioState.products?.[0]?.productId || "";
    productSelect.value = selectedProductId;
    syncRouteSelector(selectedProductId);
    applyShellTranslations();
    render(selectedProductId);
    loadWarningRoot?.setAttribute("hidden", "");
}
function t(key) {
    return workflowCopy[locale][key] ?? copy[locale][key] ?? workflowCopy.en[key] ?? copy.en[key] ?? key;
}
function applyShellTranslations() {
    document.querySelectorAll("[data-i18n]").forEach(element => {
        const key = element.dataset.i18n;
        if (!key)
            return;
        element.textContent = t(key);
    });
    applyLanguageSwitcherText();
}
function setWorkflowStage(value) {
    if (!workflowStages.includes(value))
        return;
    activeWorkflowStage = value;
    document.querySelectorAll(".workflow-stage").forEach(section => {
        section.hidden = section.dataset.stage !== activeWorkflowStage;
    });
    document.querySelectorAll("[data-stage-nav]").forEach(button => {
        const active = button.dataset.stageNav === activeWorkflowStage;
        button.classList.toggle("active", active);
        if (active)
            button.setAttribute("aria-current", "step");
        else
            button.removeAttribute("aria-current");
    });
    const stageKeys = {
        routing: ["stageRouting", "stageRoutingHint"], baseline: ["stageBaseline", "stageBaselineHint"],
        reality: ["stageReality", "stageRealityHint"], calibration: ["stageCalibration", "stageCalibrationHint"],
    };
    document.querySelector(".page-head h2").textContent = t(stageKeys[activeWorkflowStage][0]);
    document.querySelector(".page-head p").textContent = t(stageKeys[activeWorkflowStage][1]);
}
function applyLanguageSwitcherText() {
    languageLabelRoot.textContent = locale === "zh" ? "Language" : "界面语言";
    const zhOption = Array.from(languageSelect.options).find(option => option.value === "zh");
    const enOption = Array.from(languageSelect.options).find(option => option.value === "en");
    if (locale === "zh") {
        if (zhOption)
            zhOption.textContent = "Chinese";
        if (enOption)
            enOption.textContent = "English";
    }
    else {
        if (zhOption)
            zhOption.textContent = "中文";
        if (enOption)
            enOption.textContent = "英文";
    }
}
function renderProductSelector() {
    productSelect.innerHTML = (scenarioState.products ?? [])
        .map(product => `<option value="${escapeHtml(product.productId)}">${escapeHtml(formatKnownText(product.name))} / ${escapeHtml(product.productId)}</option>`)
        .join("");
}
function render(productId) {
    const routingConfig = buildProductRoutingConfiguration(scenarioState, productId, selectedRouteId());
    const preflight = runCapacityAnalysisPreflight(scenarioState, {
        productId,
        availableMinutesByStation: { OP10: 2880, OP10B: 2880, OP20: 2880 },
        plannedQuantityByOperation: buildPlannedQuantityByOperation(routingConfig),
    });
    const selectedOperation = resolveSelectedOperation(routingConfig.operations);
    syncStationSelector(selectedOperation);
    renderSummary(routingConfig, preflight);
    renderProduct(routingConfig);
    renderRouteStatus(routingConfig);
    renderRouting(routingConfig.operations, selectedOperation?.operation.operationId ?? "");
    renderOperationDetail(selectedOperation);
    renderStationAssignmentPage(routingConfig.operations);
    renderPlannedSaInput(routingConfig, selectedOperation);
    renderRnrTracking(selectedOperation);
    renderCalibration(selectedOperation, routingConfig);
    renderPreflight(preflight);
    setWorkflowStage(activeWorkflowStage);
}
function syncStationSelector(selectedOperation) {
    const assignments = selectedOperation?.assignments.filter(item => item.planningStatus === "available") ?? [];
    if (!assignments.some(item => item.assignment.stationId === selectedWorkflowStationId)) {
        selectedWorkflowStationId = assignments[0]?.assignment.stationId ?? "";
    }
    stationSelect.innerHTML = assignments.length
        ? assignments.map(item => `<option value="${escapeHtml(item.assignment.stationId)}">${escapeHtml(item.station?.name ?? item.assignment.stationId)} / ${escapeHtml(item.assignment.stationId)}</option>`).join("")
        : `<option value="">${escapeHtml(t("stationRequired"))}</option>`;
    stationSelect.disabled = assignments.length <= 1;
    stationSelect.value = selectedWorkflowStationId;
}
function renderSummary(routingConfig, preflight) {
    const operations = routingConfig.operations.length;
    const assignments = routingConfig.operations.reduce((sum, operation) => sum + operation.assignments.length, 0);
    const blocked = routingConfig.operations.flatMap(operation => operation.assignments).filter(item => item.planningStatus !== "available").length;
    const worstCapacity = [...preflight.capacityResults].sort((a, b) => a.gapMinutes - b.gapMinutes)[0];
    summaryRoot.innerHTML = [
        metricCard(t("readiness"), preflight.ready ? t("ready") : t("blocked"), preflight.ready ? t("canEnterCapacityAnalysis") : `${formatNumber(preflight.blockers.length)}${t("blockerCount")}`, preflight.ready ? "good" : "bad"),
        metricCard(t("routingMetric"), `${formatNumber(operations)}${t("operationUnit")} / ${formatNumber(assignments)}${t("stationUnit")}`, `${formatNumber(blocked)}${t("unavailableStationAssignment")}`, blocked ? "warn" : "good"),
        metricCard(t("demandMetric"), `${formatNumber(routingConfig.product?.weeklyDemand ?? 0)} / ${t("perWeek")}`, routingConfig.product?.demandScenario ? formatDemandScenario(routingConfig.product.demandScenario) : t("noScenario"), "neutral"),
        metricCard(t("bottleneck"), worstCapacity ? `${worstCapacity.stationId} ${formatNumber(Math.round(worstCapacity.gapMinutes))} ${t("minuteUnit")}` : "-", worstCapacity ? `${t("status")} ${formatCapacityStatus(worstCapacity.status)}` : t("noCapacityResult"), worstCapacity?.status === "short" ? "bad" : "neutral"),
    ].join("");
}
function renderProduct(routingConfig) {
    const product = routingConfig.product;
    if (!product) {
        productRoot.innerHTML = emptyState(t("productMissing"));
        return;
    }
    productRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("productRouteMockEdit")}</p>
        <h2>${escapeHtml(formatKnownText(product.name))}</h2>
      </div>
      <div class="panel-actions">
        <span class="section-label">${t("masterData")}</span>
        <button id="toggleMockEdit" class="button ${isMockEditing ? "secondary" : ""}" type="button">${isMockEditing ? t("doneEditing") : t("editMockData")}</button>
        <button id="resetMockEdit" class="button secondary" type="button">${t("resetSample")}</button>
      </div>
    </div>
    <div class="split">
      <section class="sub-card">
        <div class="panel-head">
          <h3>${t("productCard")}</h3>
          <span class="pill">${formatDemandScenario(product.demandScenario)}</span>
        </div>
        <div class="field-grid">
          ${editableProductField(t("productId"), "productId", product.productId)}
          ${editableProductField(t("project"), "projectId", product.projectId ?? "")}
          ${editableProductField(t("version"), "version", product.version ?? "")}
          ${field(t("family"), product.family ?? "-")}
          ${editableProductField(t("weeklyDemand"), "weeklyDemand", String(product.weeklyDemand), "number")}
          ${field(t("annualizedDemand"), formatNumber(product.weeklyDemand * 52))}
          ${editableProductScenarioField(product.demandScenario)}
        </div>
      </section>
      <section class="sub-card">
        <div class="panel-head">
          <h3>${t("routeCard")}</h3>
          <span class="section-label">${t("checkedResult")}</span>
        </div>
        <div class="field-grid">
          ${field(t("routeId"), routingConfig.route?.routeId ?? "-")}
          ${field(t("productId"), routingConfig.route?.productId ?? "-")}
          ${field(t("operationCount"), formatNumber(routingConfig.operations.length))}
          ${field(t("routeStatus"), formatRouteStatusLabel(getRouteStatus(routingConfig).label))}
          ${field(t("routeSource"), routingConfig.route?.sourceSystem ?? "-")}
          ${field(t("effectivePeriod"), formatEffectivePeriod(routingConfig.route?.effectiveFrom, routingConfig.route?.effectiveTo))}
        </div>
      </section>
    </div>
  `;
    bindProductEditing(product.productId);
}
function bindProductEditing(currentProductId) {
    productRoot.querySelector("#toggleMockEdit")?.addEventListener("click", () => {
        isMockEditing = !isMockEditing;
        render(selectedProductId);
    });
    productRoot.querySelector("#resetMockEdit")?.addEventListener("click", () => {
        scenarioState = cloneScenario();
        isMockEditing = false;
        selectedProductId = scenarioState.products?.[0]?.productId ?? "";
        selectedOperationId = "";
        selectedWorkflowStationId = "";
        plannedSaContexts.clear();
        plannedSaContextKey = "";
        plannedSaEvents = [];
        rnrDrafts.clear();
        rnrActualEventsByContext.clear();
        validationFixtureContexts.clear();
        confirmedSuggestions.clear();
        publishedSuggestions.length = 0;
        suggestionDates.clear();
        windowDemandByRoute.clear();
        oneToOneRoutes.clear();
        calibrationActionError = "";
        cycleCheckDraft = { samples: "", targetSamples: 20, standardCycleSec: 24, acceptableSlowDeviationPercent: undefined };
        rnrMode = "timeWindow";
        rnrSelectedEventId = "";
        rnrContextKey = "";
        renderProductSelector();
        productSelect.value = selectedProductId;
        syncRouteSelector(selectedProductId);
        render(selectedProductId);
    });
    productRoot.querySelectorAll("[data-product-field]").forEach(input => {
        input.addEventListener("change", () => {
            updateProductField(currentProductId, input.dataset.productField ?? "", input.value);
        });
    });
}
function renderRouteStatus(routingConfig) {
    const status = getRouteStatus(routingConfig);
    routeStatusRoot.className = `pill ${status.tone}`;
    routeStatusRoot.textContent = formatRouteStatusLabel(status.label);
}
function renderRouting(operations, activeOperationId) {
    routingRoot.innerHTML = operations.length
        ? `${operations.map(operation => renderOperation(operation, activeOperationId)).join("")}${renderOperationTable(operations)}`
        : emptyState(t("noRoutingOperations"));
    routingRoot.querySelectorAll(".operation-row[data-operation-id]").forEach(row => {
        row.addEventListener("click", () => {
            selectOperation(row.dataset.operationId ?? "");
        });
        row.addEventListener("keydown", event => {
            if (event.key !== "Enter" && event.key !== " ")
                return;
            event.preventDefault();
            selectOperation(row.dataset.operationId ?? "");
        });
    });
    bindOperationEditing();
}
function bindOperationEditing() {
    routingRoot.querySelectorAll("[data-operation-field]").forEach(input => {
        input.addEventListener("change", () => {
            updateOperationField(input.dataset.opEditId ?? "", input.dataset.operationField ?? "", input.value);
        });
    });
}
function renderOperation(operationView, activeOperationId) {
    const operation = operationView.operation;
    const completeness = getOperationCompleteness(operationView);
    const isActive = operation.operationId === activeOperationId;
    return `
    <article class="operation-row selectable ${isActive ? "active" : ""}" data-operation-id="${escapeHtml(operation.operationId)}" role="button" tabindex="0" aria-pressed="${isActive ? "true" : "false"}">
      <div class="operation-main">
        <div class="op-seq">OP${operation.sequence}</div>
        <div>
          <h3>${escapeHtml(formatKnownText(operation.name))}</h3>
          <p>${escapeHtml(formatKnownText(operation.processType))}${operation.digitalTwinNodeId ? ` · ${t("digitalTwinShort")} ${escapeHtml(operation.digitalTwinNodeId)}` : ""}</p>
        </div>
      </div>
      <div class="operation-checks">
        <span class="status ${completeness.assignmentTone}">${t("stationAssignmentCompleteness")}: ${escapeHtml(completeness.assignmentLabel)}</span>
        <span class="status ${completeness.parameterTone}">${t("parameterCompleteness")}: ${escapeHtml(completeness.parameterLabel)}</span>
      </div>
      <div class="assignment-preview">
        ${operationView.assignments.map(renderAssignmentPreview).join("")}
      </div>
      ${operationView.messages.length ? `<ul class="message-list">${operationView.messages.map(message => `<li>${escapeHtml(formatKnownText(message))}</li>`).join("")}</ul>` : ""}
    </article>
  `;
}
function renderAssignmentPreview(view) {
    const assignment = view.assignment;
    const stationName = view.station?.name ?? assignment.stationId;
    const blocker = assignment.planningBlockerReason ? ` · ${assignment.planningBlockerReason}` : "";
    const tone = view.planningStatus === "available" ? "" : "bad";
    return `<span class="role-chip ${tone}">${formatRole(assignment.role)}: ${escapeHtml(formatKnownText(stationName))}${escapeHtml(formatKnownText(blocker))}</span>`;
}
function renderOperationTable(operations) {
    const rows = operations.map(operationView => {
        const operation = operationView.operation;
        return `
      <tr>
        <td>${editableOperationField(operation.operationId, "sequence", String(operation.sequence), "number")}</td>
        <td>${escapeHtml(operation.operationId)}</td>
        <td>${editableOperationField(operation.operationId, "name", operation.name)}</td>
        <td>${editableOperationField(operation.operationId, "processType", operation.processType)}</td>
        <td>${editableOperationField(operation.operationId, "digitalTwinNodeId", operation.digitalTwinNodeId ?? "")}</td>
        <td>${escapeHtml(operation.predecessorOperationIds?.join(", ") || "-")}</td>
        <td>${escapeHtml(operation.successorOperationIds?.join(", ") || "-")}</td>
      </tr>
    `;
    }).join("");
    return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>${t("sequence")}</th>
            <th>${t("operationId")}</th>
            <th>${t("operationName")}</th>
            <th>${t("processType")}</th>
            <th>${t("digitalTwinNodeShort")}</th>
            <th>${t("predecessor")}</th>
            <th>${t("successor")}</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}
function editableProductField(label, name, value, type = "text") {
    if (!isMockEditing)
        return field(label, type === "number" ? formatNumber(Number(value)) : value || "-");
    return `
    <div class="field">
      <label for="product-${escapeHtml(name)}">${escapeHtml(label)}</label>
      <input id="product-${escapeHtml(name)}" data-product-field="${escapeHtml(name)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" />
    </div>
  `;
}
function editableProductScenarioField(value) {
    const scenarios = ["launch", "rampUp", "massProduction", "peak", "custom"];
    if (!isMockEditing)
        return field(t("demandScenarioLabel"), formatDemandScenario(value));
    return `
    <div class="field">
      <label for="product-demandScenario">${t("demandScenarioLabel")}</label>
      <select id="product-demandScenario" data-product-field="demandScenario">
        ${scenarios.map(item => `<option value="${escapeHtml(item)}" ${item === value ? "selected" : ""}>${formatDemandScenario(item)}</option>`).join("")}
      </select>
    </div>
  `;
}
function editableOperationField(operationId, fieldName, value, type = "text") {
    if (!isMockEditing) {
        const displayValue = fieldName === "name" || fieldName === "processType" ? formatKnownText(value) : value;
        return escapeHtml(type === "number" ? formatNumber(Number(value)) : displayValue || "-");
    }
    return `<input class="table-input" data-op-edit-id="${escapeHtml(operationId)}" data-operation-field="${escapeHtml(fieldName)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" />`;
}
function updateProductField(currentProductId, fieldName, value) {
    const product = scenarioState.products?.find(item => item.productId === currentProductId);
    if (!product)
        return;
    if (fieldName === "productId") {
        const nextProductId = value.trim();
        const duplicate = scenarioState.products?.some(item => item.productId === nextProductId && item !== product);
        if (!nextProductId || duplicate) {
            render(selectedProductId);
            return;
        }
        cascadeProductId(product.productId, nextProductId);
        product.productId = nextProductId;
        selectedProductId = nextProductId;
        renderProductSelector();
        productSelect.value = selectedProductId;
        syncRouteSelector(selectedProductId);
        render(selectedProductId);
        return;
    }
    if (fieldName === "weeklyDemand") {
        product.weeklyDemand = Math.max(Number(value) || 0, 0);
    }
    else if (fieldName === "projectId") {
        product.projectId = value;
    }
    else if (fieldName === "version") {
        product.version = value;
    }
    else if (fieldName === "demandScenario") {
        product.demandScenario = value;
    }
    render(selectedProductId);
}
function cascadeProductId(previousProductId, nextProductId) {
    scenarioState.orders.forEach(order => {
        if (order.productId === previousProductId)
            order.productId = nextProductId;
    });
    scenarioState.routes.forEach(route => {
        if (route.productId === previousProductId)
            route.productId = nextProductId;
    });
    scenarioState.operationStationAssignments?.forEach(assignment => {
        if (assignment.productId === previousProductId)
            assignment.productId = nextProductId;
    });
    scenarioState.capacityShareProfiles?.forEach(profile => {
        if (profile.productId === previousProductId)
            profile.productId = nextProductId;
    });
    scenarioState.productionPolicies?.forEach(policy => {
        if (policy.productId === previousProductId)
            policy.productId = nextProductId;
    });
    scenarioState.batchHUPolicies?.forEach(policy => {
        if (policy.productId === previousProductId)
            policy.productId = nextProductId;
    });
}
function updateOperationField(operationId, fieldName, value) {
    const operation = scenarioState.routes
        .find(route => route.routeId === selectedRouteId())
        ?.operations.find(item => item.operationId === operationId);
    if (!operation)
        return;
    if (fieldName === "sequence") {
        operation.sequence = Math.max(Number(value) || operation.sequence, 0);
    }
    else if (fieldName === "name") {
        operation.name = value;
    }
    else if (fieldName === "processType") {
        operation.processType = value;
    }
    else if (fieldName === "digitalTwinNodeId") {
        if (value) {
            operation.digitalTwinNodeId = value;
        }
        else {
            delete operation.digitalTwinNodeId;
        }
    }
    render(selectedProductId);
}
function renderOperationDetail(operationView) {
    if (!operationView) {
        operationDetailRoot.innerHTML = emptyState(t("selectOperationEmpty"));
        return;
    }
    const operation = operationView.operation;
    operationDetailRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("selectedOperationAssignment")}</p>
        <h2>OP${operation.sequence} ${escapeHtml(formatKnownText(operation.name))}</h2>
      </div>
      <span class="pill">${escapeHtml(operation.operationId)}</span>
    </div>
    <div class="field-grid">
      ${field(t("processType"), formatKnownText(operation.processType))}
      ${field(t("digitalTwinNode"), operation.digitalTwinNodeId ?? "-")}
      ${field(t("predecessor"), operation.predecessorOperationIds?.join(", ") || "-")}
      ${field(t("successor"), operation.successorOperationIds?.join(", ") || "-")}
    </div>
    <div class="assignment-grid">
      ${operationView.assignments.map(renderAssignment).join("")}
    </div>
    ${operationView.messages.length ? `<ul class="message-list">${operationView.messages.map(message => `<li>${escapeHtml(formatKnownText(message))}</li>`).join("")}</ul>` : ""}
  `;
}
function renderStationAssignmentPage(operations) {
    const rows = operations.flatMap(operationView => operationView.assignments.map(view => renderStationAssignmentRow(operationView, view)));
    stationAssignmentRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("stationAssignmentConfig")}</p>
        <h2>${t("stationAssignmentTitle")}</h2>
      </div>
      <span class="pill">${formatNumber(rows.length)}${t("assignmentsCount")}</span>
    </div>
    <p class="note">${t("stationAssignmentNote")}</p>
    <div class="table-wrap">
      <table class="assignment-matrix">
        <thead>
          <tr>
            <th>${t("operation")}</th>
            <th>${t("station")}</th>
            <th>${t("role")}</th>
            <th>${t("allocation")}</th>
            <th>${t("planning")}</th>
            <th>${t("customerGate")}</th>
            <th>${t("backupConditionBlocker")}</th>
          </tr>
        </thead>
        <tbody>${rows.join("") || `<tr><td colspan="7">${t("noStationAssignmentConfigured")}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}
function renderStationAssignmentRow(operationView, view) {
    const operation = operationView.operation;
    const assignment = view.assignment;
    const stationName = view.station?.name ?? assignment.stationId;
    const isBlocked = isAssignmentBlocking(view);
    const planningTone = isBlocked ? "bad" : view.planningStatus === "available" ? "good" : "bad";
    const approvalTone = assignment.customerApprovalRequired && assignment.approvalStatus !== "approved" && assignment.approvalStatus !== "effective"
        ? "bad"
        : "good";
    const allocation = assignment.plannedShare !== undefined
        ? `${formatAllocationMode(assignment.allocationMode ?? "fixedShare")} · ${formatNumber(Math.round(assignment.plannedShare * 100))}%`
        : formatAllocationMode(assignment.allocationMode ?? "forecastCalculated");
    const condition = [
        assignment.backupCondition,
        assignment.planningBlockerReason,
    ].filter(Boolean).join(" / ");
    return `
    <tr class="${isBlocked ? "blocked" : ""}">
      <td>OP${operation.sequence} ${escapeHtml(formatKnownText(operation.name))}</td>
      <td>${escapeHtml(assignment.stationId)} · ${escapeHtml(formatKnownText(stationName))}</td>
      <td><span class="status ${assignment.role === "backup" ? "bad" : ""}">${formatRole(assignment.role)}</span></td>
      <td>${escapeHtml(allocation)}</td>
      <td><span class="status ${planningTone}">${isBlocked ? t("blocked") : formatPlanningStatus(view.planningStatus)}</span></td>
      <td><span class="status ${approvalTone}">${formatApprovalStatus(assignment.customerApprovalRequired ? assignment.approvalStatus : "notRequired")}</span></td>
      <td class="${assignment.role === "backup" ? "backup-condition" : ""}">${condition ? escapeHtml(formatKnownText(condition)) : "-"}</td>
    </tr>
  `;
}
function renderAssignment(view) {
    const assignment = view.assignment;
    const parameter = view.parameter;
    const statusClass = statusTone(view.planningStatus === "available" ? "good" : "bad");
    const approvalGate = assignment.customerApprovalRequired ? assignment.approvalStatus : "notRequired";
    return `
    <section class="assignment-card ${statusClass}">
      <div class="assignment-top">
        <div>
          <p class="eyebrow">${formatRole(assignment.role)}</p>
          <h4>${escapeHtml(formatKnownText(view.station?.name ?? assignment.stationId))}</h4>
        </div>
        <span class="status ${statusClass}">${formatPlanningStatus(view.planningStatus)}</span>
      </div>
      <div class="mini-grid">
        ${field(t("station"), assignment.stationId)}
        ${field(t("group"), view.stationGroup?.name ? formatKnownText(view.stationGroup.name) : "-")}
        ${field(t("planningAllowed"), assignment.planningAllowed ? t("yes") : t("no"))}
        ${field(t("customerGate"), formatApprovalStatus(approvalGate))}
        ${field(t("allocationMode"), assignment.allocationMode ? formatAllocationMode(assignment.allocationMode) : "-")}
        ${field(t("plannedShare"), assignment.plannedShare !== undefined ? `${t("fixedReserved")} ${formatNumber(Math.round(assignment.plannedShare * 100))}%` : t("defaultCapacityCeiling"))}
        ${field(t("stdCt"), parameter ? `${formatNumber(parameter.standardCycleSec)}s` : t("missing"))}
        ${field(t("piecesPerCycle"), parameter ? formatNumber(parameter.piecesPerCycle) : t("missing"))}
        ${field(t("pQ"), parameter ? `${percent(parameter.performanceRate)} / ${percent(parameter.qualityRate)}` : t("missing"))}
        ${field(t("blockerReason"), assignment.planningBlockerReason ? formatKnownText(assignment.planningBlockerReason) : "-")}
      </div>
      ${assignment.backupCondition ? `<p class="note">${escapeHtml(formatKnownText(assignment.backupCondition))}</p>` : ""}
      ${view.messages.length ? `<ul class="message-list compact">${view.messages.map(message => `<li>${escapeHtml(formatKnownText(message))}</li>`).join("")}</ul>` : ""}
    </section>
  `;
}
function isAssignmentBlocking(view) {
    const assignment = view.assignment;
    const approvalPending = assignment.customerApprovalRequired
        && assignment.approvalStatus !== "approved"
        && assignment.approvalStatus !== "effective";
    return view.planningStatus === "blocked" || approvalPending;
}
function renderPlannedSaInput(routingConfig, selectedOperation) {
    const horizonMinutes = PLANNED_SA_HORIZON_MINUTES;
    const stationId = resolvePlannedSaStationId(routingConfig.operations, selectedOperation);
    if (stationId === "-") {
        plannedSaRoot.innerHTML = emptyState(t("stationRequired"));
        return;
    }
    const productId = routingConfig.product?.productId ?? selectedProductId;
    const events = getPlannedSaEvents(stationId, productId);
    document.querySelector('[data-stage-next="reality"]').disabled = events.length === 0;
    alignPlannedBlockDraftAfterExistingEvents(events, stationId, horizonMinutes);
    const plannedWindow = derivePlannedSaWindow(events);
    const summary = summarizePlannedSa(events, plannedWindow.durationMinutes);
    const validationIssues = validatePlannedSaEvents(events, plannedWindow);
    const gaps = findTimelineGapsWithinWindow(events, stationId, plannedWindow);
    plannedSaRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("plannedSaEyebrow")}</p>
        <h2>${t("plannedSaTitle")}</h2>
      </div>
      <div class="panel-actions">
        <span class="section-label">${t("bestCaseSaInput")}</span>
        <button class="button" type="button" id="fillPlannedGaps">${t("fillGaps")}</button>
      </div>
    </div>
    <div class="field-grid">
      ${field(t("windowType"), `${t("maxFortyEightHours")} / ${t("minOneHourGrain")}`)}
      ${field(t("station"), stationId)}
      ${field(t("horizonMinutes"), formatNumber(plannedWindow.durationMinutes))}
      ${field(t("scheduledMinutes"), formatNumber(plannedWindow.durationMinutes))}
      ${field(t("windowStart"), formatOptionalMinutePoint(plannedWindow.startMinute))}
      ${field(t("windowEnd"), formatOptionalMinutePoint(plannedWindow.endMinute))}
    </div>
    ${renderPlannedBlockForm()}
    ${renderPlannedTimeline(stationId, events, plannedWindow)}
    <section class="metrics" aria-label="${t("plannedSaTitle")}" style="margin-top:14px;">
      ${metricCard(t("scheduledMin"), formatNumber(summary.scheduledMinutes), t("maxFortyEightHours"), "neutral")}
      ${metricCard(t("plannedOperationMin"), formatNumber(summary.productionMinutes), t("productionNotSaLoss"), "good")}
      ${metricCard(t("setupChangeoverMin"), formatNumber(summary.setupMinutes), t("plannedLossKinds"), summary.setupMinutes ? "warn" : "good")}
      ${metricCard(t("breakMin"), formatNumber(summary.breakMinutes), t("plannedLossKinds"), summary.breakMinutes ? "warn" : "good")}
      ${metricCard(t("plannedStopMin"), formatNumber(summary.plannedStopMinutes), t("plannedLossKinds"), summary.plannedStopMinutes ? "warn" : "good")}
      ${metricCard(t("unscheduledMin"), formatNumber(summary.unscheduledMinutes), t("notPlannedNotOpenCapacity"), summary.unscheduledMinutes ? "warn" : "good")}
      ${metricCard(t("bestCaseAvailableMin"), formatNumber(summary.bestCaseAvailableMinutes), t("productionMinutesDetail"), "good")}
      ${metricCard(t("bestCaseSaWithBreaks"), percent(summary.bestCaseSaWithBreaks), t("availableScheduled"), "good")}
      ${metricCard(t("bestCaseSaWithoutBreaks"), percent(summary.bestCaseSaWithoutBreaks), t("availableScheduled"), "good")}
    </section>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("eventId")}</th><th>${t("station")}</th><th>${t("kind")}</th><th>${t("startDate")}</th><th>${t("startTime")}</th><th>${t("endDate")}</th><th>${t("endTime")}</th><th>${t("durationMin")}</th><th>${t("labelNote")}</th><th>${t("deleteEvent")}</th></tr></thead>
        <tbody>${events.map(renderPlannedActivityRow).join("")}</tbody>
      </table>
    </div>
    <div class="split">
      <section>
        <h3>${t("timelineValidation")}</h3>
        ${renderTimelineValidation(validationIssues)}
      </section>
      <section>
        <h3>${t("gapWarning")}</h3>
        ${renderTimelineGaps(gaps)}
      </section>
    </div>
  `;
    bindPlannedSaEditing(stationId, productId, horizonMinutes);
}
function getPlannedSaEvents(stationId, productId) {
    const contextKey = `${productId}::${stationId}`;
    if (plannedSaContextKey !== contextKey) {
        if (plannedSaContextKey)
            plannedSaContexts.set(plannedSaContextKey, { events: plannedSaEvents, areDefault: plannedSaEventsAreDefault });
        const saved = plannedSaContexts.get(contextKey);
        plannedSaContextKey = contextKey;
        plannedSaEvents = saved?.events ?? buildDefaultPlannedActivityEvents(stationId, productId);
        plannedSaEventsAreDefault = saved?.areDefault ?? true;
        resetPlannedBlockDraft(stationId, PLANNED_SA_HORIZON_MINUTES);
    }
    return plannedSaEvents;
}
function renderPlannedBlockForm() {
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${t("addTimeBlock")}</h3>
        <span class="section-label">${t("intervalFirst")}</span>
      </div>
      <p class="note">${t("addTimeBlockNote")}</p>
      <p class="note">${t("rrAbnormalScope")}</p>
      <div class="field-grid">
        ${draftInputField(t("startDate"), "startDate", minuteToDateValue(plannedBlockDraft.startMinute), "date")}
        ${draftTimeField(t("startTime"), "start", plannedBlockDraft.startMinute)}
        ${draftInputField(t("endDate"), "endDate", minuteToDateValue(plannedBlockDraft.endMinute), "date")}
        ${draftTimeField(t("endTime"), "end", plannedBlockDraft.endMinute)}
        ${draftCategoryField()}
        ${draftKindField()}
        ${draftInputField(t("labelNote"), "note", plannedBlockDraft.note)}
        ${field(t("durationMin"), formatNumber(Math.max(plannedBlockDraft.endMinute - plannedBlockDraft.startMinute, 0)))}
      </div>
      ${plannedSaDraftError ? `<p class="form-error">${escapeHtml(plannedSaDraftError)}</p>` : ""}
      <div class="action-bar">
        <span>${t("submitCreatesEvent")}</span>
        <div class="panel-actions">
          <button class="button secondary" type="button" id="resetPlannedTimeBlockStart">${t("resetTimeBlockStart")}</button>
          <button class="button" type="button" id="addPlannedTimeBlock">${t("addTimeBlock")}</button>
        </div>
      </div>
    </section>
  `;
}
function draftInputField(label, fieldName, value, type = "text") {
    return `
    <div class="field">
      <label for="planned-draft-${escapeHtml(fieldName)}">${escapeHtml(label)}</label>
      <input id="planned-draft-${escapeHtml(fieldName)}" data-planned-draft-field="${escapeHtml(fieldName)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" />
    </div>
  `;
}
function draftTimeField(label, fieldPrefix, minute) {
    const minuteInDay = ((minute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
    const hourValue = Math.floor(minuteInDay / 60);
    const minuteValue = minuteInDay % 60;
    return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="time-pair">
        <select aria-label="${escapeHtml(t("hour"))}" data-planned-draft-field="${fieldPrefix}Hour">
          ${numberOptions(0, 23, hourValue)}
        </select>
        <select aria-label="${escapeHtml(t("minute"))}" data-planned-draft-field="${fieldPrefix}MinuteOfHour">
          ${numberOptions(0, 59, minuteValue)}
        </select>
      </div>
    </div>
  `;
}
function draftCategoryField() {
    const categories = [
        { value: "production", label: formatPlannedCategory("production") },
        { value: "plannedActivity", label: formatPlannedCategory("plannedActivity") },
        { value: "notPlanned", label: formatPlannedCategory("notPlanned") },
    ];
    return `
    <div class="field">
      <label for="planned-draft-category">${t("blockCategory")}</label>
      <select id="planned-draft-category" data-planned-draft-field="category">
        ${categories.map(category => `<option value="${category.value}" ${category.value === plannedBlockDraft.category ? "selected" : ""}>${escapeHtml(category.label)}</option>`).join("")}
      </select>
    </div>
  `;
}
function draftKindField() {
    const kinds = plannedKindsForCategory(plannedBlockDraft.category);
    return `
    <div class="field">
      <label for="planned-draft-kind">${t("detailKind")}</label>
      <select id="planned-draft-kind" data-planned-draft-field="kind">
        ${kinds.map(kind => `<option value="${escapeHtml(kind)}" ${kind === plannedBlockDraft.kind ? "selected" : ""}>${formatTimelineKind(kind)}</option>`).join("")}
      </select>
    </div>
  `;
}
function plannedKindsForCategory(category) {
    if (category === "plannedActivity")
        return ["setup", "break", "maintenance", "plannedStop"];
    if (category === "notPlanned")
        return ["unscheduled"];
    return ["production"];
}
function bindPlannedSaEditing(stationId, productId, horizonMinutes) {
    plannedSaRoot.querySelector("#addPlannedTimeBlock")?.addEventListener("click", () => {
        addPlannedTimeBlock(stationId, productId, horizonMinutes);
    });
    plannedSaRoot.querySelector("#resetPlannedTimeBlockStart")?.addEventListener("click", () => {
        resetPlannedBlockDraftToStart(horizonMinutes);
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#fillPlannedGaps")?.addEventListener("click", () => {
        plannedSaEvents = fillWindowGapsAsUnscheduled(plannedSaEvents, stationId, derivePlannedSaWindow(plannedSaEvents));
        plannedSaEventsAreDefault = false;
        render(selectedProductId);
    });
    plannedSaRoot.querySelectorAll("[data-planned-draft-field]").forEach(input => {
        input.addEventListener("change", () => {
            updatePlannedBlockDraft(input.dataset.plannedDraftField ?? "", input.value);
        });
    });
    plannedSaRoot.querySelectorAll("[data-planned-event-field]").forEach(input => {
        input.addEventListener("change", () => {
            updatePlannedActivityEvent(input.dataset.plannedEventId ?? "", input.dataset.plannedEventField ?? "", input.value);
        });
    });
    plannedSaRoot.querySelectorAll("[data-planned-delete-event]").forEach(button => {
        button.addEventListener("click", () => {
            deletePlannedActivityEvent(button.dataset.plannedDeleteEvent ?? "", stationId);
        });
    });
}
function resolvePlannedSaStationId(operations, selectedOperation) {
    const selectedStation = selectedOperation?.assignments.find(item => item.planningStatus === "available" && item.assignment.stationId === selectedWorkflowStationId)?.assignment.stationId
        ?? selectedOperation?.assignments.find(item => item.planningStatus === "available")?.assignment.stationId;
    if (selectedStation)
        return selectedStation;
    const routeStation = operations
        .flatMap(operation => operation.assignments)
        .find(item => item.planningStatus === "available")?.assignment.stationId;
    return routeStation ?? "-";
}
function buildDefaultPlannedActivityEvents(stationId, productId) {
    return [
        buildTimelineEvent("planned-production-1", stationId, productId, "production", 510, 660, `${formatTimelineKind("production")} 08:30-11:00`),
        buildTimelineEvent("planned-break-1", stationId, productId, "break", 660, 690, `${formatTimelineKind("break")} 11:00-11:30`),
        buildTimelineEvent("planned-production-2", stationId, productId, "production", 690, 1020, `${formatTimelineKind("production")} 11:30-17:00`),
        buildTimelineEvent("planned-break-2", stationId, productId, "break", 1020, 1050, `${formatTimelineKind("break")} 17:00-17:30`),
        buildTimelineEvent("planned-production-3", stationId, productId, "production", 1050, 1140, `${formatTimelineKind("production")} 17:30-19:00`),
        buildTimelineEvent("planned-setup-1", stationId, productId, "setup", 1140, 1260, `${formatTimelineKind("setup")} 19:00-21:00`),
    ];
}
function buildTimelineEvent(id, stationId, productId, kind, startMinute, endMinute, label) {
    return {
        id,
        stationId,
        productId,
        kind,
        startMinute,
        endMinute,
        source: "manual",
        label,
    };
}
function derivePlannedSaWindow(events) {
    if (!events.length)
        return { durationMinutes: 0 };
    const startMinute = Math.min(...events.map(event => event.startMinute));
    const endMinute = Math.max(...events.map(event => event.endMinute));
    return {
        startMinute,
        endMinute,
        durationMinutes: Math.max(endMinute - startMinute, 0),
    };
}
function validatePlannedSaEvents(events, window) {
    if (window.startMinute === undefined)
        return [];
    const normalizedEvents = events.map(event => ({
        ...event,
        startMinute: event.startMinute - window.startMinute,
        endMinute: event.endMinute - window.startMinute,
    }));
    return validateTimelineEvents(normalizedEvents, PLANNED_SA_HORIZON_MINUTES);
}
function summarizePlannedSa(events, scheduledMinutes) {
    const productionMinutes = sumTimelineDuration(events.filter(event => event.kind === "production"));
    const setupMinutes = sumTimelineDuration(events.filter(event => event.kind === "setup"));
    const breakMinutes = sumTimelineDuration(events.filter(event => event.kind === "break"));
    const plannedStopMinutes = sumTimelineDuration(events.filter(event => event.kind === "maintenance" || event.kind === "plannedStop"));
    const unscheduledEventMinutes = sumTimelineDuration(events.filter(event => event.kind === "unscheduled"));
    const recordedMinutes = productionMinutes + setupMinutes + breakMinutes + plannedStopMinutes + unscheduledEventMinutes;
    const implicitGapMinutes = Math.max(scheduledMinutes - recordedMinutes, 0);
    const unscheduledMinutes = unscheduledEventMinutes + implicitGapMinutes;
    const plannedLossWithBreaks = setupMinutes + breakMinutes + plannedStopMinutes;
    const plannedLossWithoutBreaks = setupMinutes + plannedStopMinutes;
    const bestCaseAvailableMinutes = Math.max(scheduledMinutes - plannedLossWithBreaks - unscheduledMinutes, 0);
    const bestCaseAvailableWithoutBreaks = Math.max(scheduledMinutes - plannedLossWithoutBreaks - unscheduledMinutes, 0);
    const bestCaseSaWithBreaks = scheduledMinutes > 0 ? bestCaseAvailableMinutes / scheduledMinutes : 0;
    const bestCaseSaWithoutBreaks = scheduledMinutes > 0 ? bestCaseAvailableWithoutBreaks / scheduledMinutes : 0;
    return {
        scheduledMinutes,
        productionMinutes,
        setupMinutes,
        breakMinutes,
        plannedStopMinutes,
        unscheduledMinutes,
        bestCaseAvailableMinutes,
        bestCaseSaWithBreaks,
        bestCaseSaWithoutBreaks,
    };
}
function sumTimelineDuration(events) {
    return events.reduce((sum, event) => sum + Math.max(event.endMinute - event.startMinute, 0), 0);
}
function findTimelineGapsWithinWindow(events, stationId, window) {
    if (window.startMinute === undefined || window.endMinute === undefined)
        return [];
    const stationEvents = events
        .filter(event => event.stationId === stationId)
        .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    const gaps = [];
    let cursor = window.startMinute;
    for (const event of stationEvents) {
        if (event.startMinute > cursor) {
            gaps.push({ stationId, startMinute: cursor, endMinute: event.startMinute });
        }
        cursor = Math.max(cursor, event.endMinute);
    }
    if (cursor < window.endMinute) {
        gaps.push({ stationId, startMinute: cursor, endMinute: window.endMinute });
    }
    return gaps;
}
function fillWindowGapsAsUnscheduled(events, stationId, window) {
    const gaps = findTimelineGapsWithinWindow(events, stationId, window);
    const unscheduledEvents = gaps.map((gap, index) => ({
        id: `${stationId}-unscheduled-${index + 1}`,
        stationId,
        kind: "unscheduled",
        startMinute: gap.startMinute,
        endMinute: gap.endMinute,
        source: "manual",
        label: "unscheduled / not planned",
    }));
    return [...events, ...unscheduledEvents]
        .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id));
}
function renderPlannedTimeline(stationId, events, window) {
    const stationEvents = events.filter(event => event.stationId === stationId);
    const durationMinutes = Math.max(window.durationMinutes, 1);
    const startMinute = window.startMinute ?? 0;
    const tickMinutes = timelineTicks(durationMinutes);
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${t("calendarTimeline")}</h3>
        <span class="section-label">${t("maxFortyEightHours")}</span>
      </div>
      <div class="timeline-wrap">
        <div class="timeline-hours" style="grid-template-columns: 120px repeat(${tickMinutes.length}, minmax(80px, 1fr));">
          <span>${t("station")}</span>
          ${tickMinutes.map((minute, index) => `<span>${formatTimelineTick(startMinute + minute, index === 0 ? undefined : startMinute + tickMinutes[index - 1])}</span>`).join("")}
        </div>
        <div class="timeline-row">
          <div class="timeline-station">${escapeHtml(stationId)}</div>
          <div class="timeline-track">
            ${stationEvents.map(event => renderTimelineSegment(event, startMinute, durationMinutes)).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}
function timelineTicks(durationMinutes) {
    const stepMinutes = durationMinutes <= 8 * 60
        ? 60
        : durationMinutes <= 16 * 60
            ? 120
            : durationMinutes <= 30 * 60
                ? 240
                : 360;
    const ticks = [];
    for (let minute = 0; minute < durationMinutes; minute += stepMinutes) {
        ticks.push(minute);
    }
    if (!ticks.length || ticks[ticks.length - 1] !== durationMinutes) {
        const lastTick = ticks[ticks.length - 1] ?? 0;
        if (durationMinutes - lastTick < Math.max(30, stepMinutes * 0.6)) {
            ticks[ticks.length - 1] = durationMinutes;
        }
        else {
            ticks.push(durationMinutes);
        }
    }
    return ticks;
}
function renderTimelineSegment(event, windowStartMinute, windowDurationMinutes) {
    const left = Math.max(0, Math.min((event.startMinute - windowStartMinute) / windowDurationMinutes, 1)) * 100;
    const width = Math.max(0, Math.min((event.endMinute - event.startMinute) / windowDurationMinutes, 1)) * 100;
    const label = event.note || formatTimelineKind(event.kind);
    const startDate = minuteToDateValue(event.startMinute);
    const endDate = minuteToDateValue(event.endMinute);
    const timeLabel = startDate === endDate
        ? `${minuteToTimeValue(event.startMinute)}-${minuteToTimeValue(event.endMinute)}`
        : `${startDate.slice(5)} ${minuteToTimeValue(event.startMinute)}-${endDate.slice(5)} ${minuteToTimeValue(event.endMinute)}`;
    const title = `${label} ${formatMinuteRange(event.startMinute, event.endMinute)}`;
    return `<span class="timeline-segment ${escapeHtml(event.kind)}" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;" title="${escapeHtml(title)}"><span class="timeline-segment-label">${escapeHtml(label)}</span><span class="timeline-segment-time">${escapeHtml(timeLabel)}</span></span>`;
}
function renderPlannedActivityRow(event) {
    return `
    <tr>
      <td>${escapeHtml(event.id)}</td>
      <td>${escapeHtml(event.stationId)}</td>
      <td>${plannedKindSelect(event)}</td>
      <td><input class="table-input" type="date" data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="startDate" value="${minuteToDateValue(event.startMinute)}" /></td>
      <td>${plannedTimeSelect(event, "start", event.startMinute)}</td>
      <td><input class="table-input" type="date" data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="endDate" value="${minuteToDateValue(event.endMinute)}" /></td>
      <td>${plannedTimeSelect(event, "end", event.endMinute)}</td>
      <td>${formatNumber(Math.max(event.endMinute - event.startMinute, 0))}</td>
      <td><input class="table-input" type="text" data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="label" value="${escapeHtml(event.note ?? event.label ?? "")}" /></td>
      <td><button class="button secondary" type="button" data-planned-delete-event="${escapeHtml(event.id)}">${t("deleteEvent")}</button></td>
    </tr>
  `;
}
function plannedKindSelect(event) {
    const kinds = ["production", "setup", "break", "maintenance", "plannedStop", "unscheduled"];
    return `
    <div class="kind-select-wrap">
      <span class="kind-dot ${escapeHtml(event.kind)}" aria-hidden="true"></span>
      <select class="table-input" data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="kind">
        ${kinds.map(kind => `<option value="${escapeHtml(kind)}" ${kind === event.kind ? "selected" : ""}>${formatTimelineKind(kind)}</option>`).join("")}
      </select>
    </div>
  `;
}
function plannedTimeSelect(event, fieldPrefix, minute) {
    const minuteInDay = ((minute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
    const hourValue = Math.floor(minuteInDay / 60);
    const minuteValue = minuteInDay % 60;
    return `
    <div class="time-pair compact">
      <select data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="${fieldPrefix}Hour" aria-label="${escapeHtml(t("hour"))}">
        ${numberOptions(0, 23, hourValue)}
      </select>
      <select data-planned-event-id="${escapeHtml(event.id)}" data-planned-event-field="${fieldPrefix}MinuteOfHour" aria-label="${escapeHtml(t("minute"))}">
        ${numberOptions(0, 59, minuteValue)}
      </select>
    </div>
  `;
}
function numberOptions(start, end, selectedValue) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index)
        .map(value => `<option value="${value}" ${value === selectedValue ? "selected" : ""}>${String(value).padStart(2, "0")}</option>`)
        .join("");
}
function addPlannedTimeBlock(stationId, productId, horizonMinutes) {
    const kind = plannedBlockDraft.kind;
    const startMinute = plannedBlockDraft.startMinute;
    const endMinute = plannedBlockDraft.endMinute;
    if (endMinute <= startMinute) {
        plannedSaDraftError = t("draftErrorBoundary");
        render(selectedProductId);
        return;
    }
    const draftEvent = buildTimelineEvent(nextPlannedEventId(kind), stationId, productId, kind, startMinute, endMinute, "");
    let nextEvents = [...plannedSaEvents, draftEvent];
    let nextWindow = derivePlannedSaWindow(nextEvents);
    if (plannedSaEventsAreDefault && nextWindow.durationMinutes > horizonMinutes) {
        nextEvents = [draftEvent];
        nextWindow = derivePlannedSaWindow(nextEvents);
    }
    if (nextWindow.durationMinutes > horizonMinutes) {
        plannedSaDraftError = t("draftErrorWindowSpan");
        render(selectedProductId);
        return;
    }
    if (validatePlannedSaEvents(nextEvents, nextWindow).some(issue => issue.code === "overlap")) {
        plannedSaDraftError = t("draftErrorOverlap");
        render(selectedProductId);
        return;
    }
    const eventId = nextPlannedEventId(kind);
    const label = plannedBlockDraft.note || `${formatTimelineKind(kind)} ${formatMinuteRange(startMinute, endMinute)}`;
    const finalEvent = buildTimelineEvent(eventId, stationId, productId, kind, startMinute, endMinute, label);
    plannedSaEvents = (plannedSaEventsAreDefault && derivePlannedSaWindow([...plannedSaEvents, finalEvent]).durationMinutes > horizonMinutes
        ? [finalEvent]
        : [...plannedSaEvents, finalEvent]).sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id));
    plannedSaEventsAreDefault = false;
    plannedSaDraftError = "";
    plannedDraftFollowsLatest = true;
    setPlannedBlockDraftStart(finalEvent.endMinute, horizonMinutes);
    render(selectedProductId);
}
function updatePlannedBlockDraft(fieldName, value) {
    if (fieldName === "startDate") {
        plannedDraftFollowsLatest = false;
        plannedBlockDraft.startMinute = combineDateTimeMinute(value, minuteToTimeValue(plannedBlockDraft.startMinute));
    }
    else if (fieldName === "startHour" || fieldName === "startMinuteOfHour") {
        plannedDraftFollowsLatest = false;
        plannedBlockDraft.startMinute = updateMinuteClockPart(plannedBlockDraft.startMinute, fieldName, value);
    }
    else if (fieldName === "endDate") {
        plannedBlockDraft.endMinute = combineDateTimeMinute(value, minuteToTimeValue(plannedBlockDraft.endMinute));
    }
    else if (fieldName === "endHour" || fieldName === "endMinuteOfHour") {
        plannedBlockDraft.endMinute = updateMinuteClockPart(plannedBlockDraft.endMinute, fieldName, value);
    }
    else if (fieldName === "category") {
        plannedBlockDraft.category = value;
        plannedBlockDraft.kind = plannedKindsForCategory(value)[0] ?? "production";
    }
    else if (fieldName === "kind") {
        plannedBlockDraft.kind = value;
    }
    else if (fieldName === "note") {
        plannedBlockDraft.note = value;
    }
    plannedSaDraftError = "";
    render(selectedProductId);
}
function alignPlannedBlockDraftAfterExistingEvents(events, stationId, horizonMinutes) {
    if (!plannedDraftFollowsLatest)
        return;
    const stationEvents = events.filter(event => event.stationId === stationId);
    const lastEndMinute = stationEvents.length ? Math.max(...stationEvents.map(event => event.endMinute)) : 0;
    if (plannedBlockDraft.startMinute === lastEndMinute)
        return;
    setPlannedBlockDraftStart(lastEndMinute, horizonMinutes);
    plannedSaDraftError = "";
}
function resetPlannedBlockDraft(stationId, horizonMinutes) {
    plannedDraftFollowsLatest = true;
    const stationEvents = plannedSaEvents.filter(event => event.stationId === stationId);
    const lastEndMinute = stationEvents.length ? Math.max(...stationEvents.map(event => event.endMinute)) : 0;
    setPlannedBlockDraftStart(lastEndMinute, horizonMinutes);
}
function resetPlannedBlockDraftToStart(horizonMinutes) {
    plannedDraftFollowsLatest = false;
    setPlannedBlockDraftStart(0, horizonMinutes);
    plannedSaDraftError = "";
}
function setPlannedBlockDraftStart(startMinute, _horizonMinutes) {
    const safeStartMinute = Number.isFinite(startMinute) ? startMinute : 0;
    const safeEndMinute = safeStartMinute + 60;
    plannedBlockDraft = {
        startMinute: safeStartMinute,
        endMinute: safeEndMinute,
        category: "production",
        kind: "production",
        note: "",
    };
}
function minuteToDateValue(minute) {
    return addDays(PLANNED_SA_BASE_DATE, Math.floor(minute / MINUTE_PER_DAY));
}
function minuteToTimeValue(minute) {
    const minuteInDay = ((minute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
    const hours = Math.floor(minuteInDay / 60);
    const minutes = minuteInDay % 60;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
function combineDateTimeMinute(dateValue, timeValue) {
    const dayIndex = daysBetween(PLANNED_SA_BASE_DATE, dateValue);
    const [hourPart = "0", minutePart = "0"] = timeValue.split(":");
    const minutes = Math.max(0, Math.min(Number(hourPart) || 0, 23)) * 60
        + Math.max(0, Math.min(Number(minutePart) || 0, 59));
    return dayIndex * MINUTE_PER_DAY + minutes;
}
function addDays(dateValue, days) {
    const date = parseUtcDate(dateValue);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}
function daysBetween(startDateValue, endDateValue) {
    const start = parseUtcDate(startDateValue).getTime();
    const end = parseUtcDate(endDateValue).getTime();
    return Math.round((end - start) / (24 * 60 * 60 * 1000));
}
function parseUtcDate(value) {
    const [year = "1970", month = "1", day = "1"] = value.split("-");
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
function formatMinuteRange(startMinute, endMinute) {
    return `${minuteToDateValue(startMinute)} ${minuteToTimeValue(startMinute)}-${minuteToDateValue(endMinute)} ${minuteToTimeValue(endMinute)}`;
}
function formatOptionalMinutePoint(minute) {
    return minute === undefined ? "-" : `${minuteToDateValue(minute)} ${minuteToTimeValue(minute)}`;
}
function formatTimelineHour(minute) {
    return `${minuteToDateValue(minute)} ${minuteToTimeValue(minute)}`;
}
function formatTimelineTick(minute, previousMinute) {
    const date = minuteToDateValue(minute);
    const previousDate = previousMinute === undefined ? "" : minuteToDateValue(previousMinute);
    return previousMinute === undefined || date !== previousDate
        ? `${date} ${minuteToTimeValue(minute)}`
        : minuteToTimeValue(minute);
}
function updateMinuteClockPart(currentMinute, fieldName, value) {
    const minuteInDay = ((currentMinute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
    const currentHour = Math.floor(minuteInDay / 60);
    const currentMinuteOfHour = minuteInDay % 60;
    const isHourField = fieldName === "startHour" || fieldName === "endHour";
    const isMinuteField = fieldName === "startMinuteOfHour" || fieldName === "endMinuteOfHour";
    const nextHour = isHourField ? Number(value) : currentHour;
    const nextMinute = isMinuteField ? Number(value) : currentMinuteOfHour;
    return combineDateTimeMinute(minuteToDateValue(currentMinute), `${String(nextHour).padStart(2, "0")}:${String(nextMinute).padStart(2, "0")}`);
}
function updatePlannedActivityEvent(eventId, fieldName, value) {
    const event = plannedSaEvents.find(item => item.id === eventId);
    if (!event)
        return;
    if (fieldName === "kind") {
        event.kind = value;
    }
    else if (fieldName === "startDate") {
        event.startMinute = combineDateTimeMinute(value, minuteToTimeValue(event.startMinute));
    }
    else if (fieldName === "startHour" || fieldName === "startMinuteOfHour") {
        event.startMinute = updateMinuteClockPart(event.startMinute, fieldName, value);
    }
    else if (fieldName === "endDate") {
        event.endMinute = combineDateTimeMinute(value, minuteToTimeValue(event.endMinute));
    }
    else if (fieldName === "endHour" || fieldName === "endMinuteOfHour") {
        event.endMinute = updateMinuteClockPart(event.endMinute, fieldName, value);
    }
    else if (fieldName === "label") {
        if (value) {
            event.label = value;
        }
        else {
            delete event.label;
        }
    }
    plannedSaEvents = [...plannedSaEvents].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute || a.id.localeCompare(b.id));
    plannedSaEventsAreDefault = false;
    if (fieldName === "startDate" || fieldName === "startHour" || fieldName === "startMinuteOfHour"
        || fieldName === "endDate" || fieldName === "endHour" || fieldName === "endMinuteOfHour") {
        alignPlannedBlockDraftAfterExistingEvents(plannedSaEvents, event.stationId, PLANNED_SA_HORIZON_MINUTES);
    }
    render(selectedProductId);
}
function deletePlannedActivityEvent(eventId, stationId) {
    plannedSaEvents = plannedSaEvents.filter(event => event.id !== eventId);
    plannedSaEventsAreDefault = false;
    resetPlannedBlockDraft(stationId, PLANNED_SA_HORIZON_MINUTES);
    render(selectedProductId);
}
function nextPlannedEventId(kind) {
    const prefix = `planned-${kind}`;
    const nextIndex = plannedSaEvents
        .filter(event => event.id.startsWith(prefix))
        .length + 1;
    return `${prefix}-${nextIndex}`;
}
function renderTimelineValidation(issues) {
    if (!issues.length)
        return emptyState(t("noTimelineIssue"));
    return list(issues.map(issue => `${formatIssueSeverity(issue.severity)}: ${issue.code} - ${formatKnownText(issue.message)}`));
}
function renderTimelineGaps(gaps) {
    if (!gaps.length)
        return emptyState(t("noGapInHorizon"));
    return `<ul class="message-list">${gaps.map(gap => `<li><span class="status warn">${t("warning")}</span> ${escapeHtml(gap.stationId)} ${t("gap")} ${escapeHtml(formatMinuteRange(gap.startMinute, gap.endMinute))}</li>`).join("")}</ul>`;
}
function renderRnrTracking(selectedOperation) {
    const operation = selectedOperation?.operation;
    const assignmentView = selectedOperation?.assignments.find(item => item.planningStatus === "available");
    const stationId = selectedWorkflowStationId || assignmentView?.assignment.stationId || "-";
    const productId = assignmentView?.assignment.productId ?? selectedProductId;
    if (stationId === "-") {
        rnrRoot.innerHTML = emptyState(t("stationRequired"));
        return;
    }
    if (!getPlannedSaEvents(stationId, productId).length) {
        rnrRoot.innerHTML = emptyState(t("baselineRequired"));
        return;
    }
    const operationLabel = operation ? `OP${operation.sequence} ${formatKnownText(operation.name)}` : "-";
    const parameter = operation
        ? selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operation.operationId, stationId)
        : undefined;
    const contextKey = `${productId}::${operation?.operationId ?? ""}::${stationId}`;
    if (contextKey !== rnrContextKey) {
        if (rnrContextKey)
            rnrDrafts.set(rnrContextKey, { segment: { ...rnrSegmentDraft }, cycle: { ...cycleCheckDraft } });
        const saved = rnrDrafts.get(contextKey);
        if (saved) {
            rnrSegmentDraft = { ...saved.segment };
            cycleCheckDraft = { ...saved.cycle };
        }
        else if (rnrContextKey) {
            const firstProduction = getPlannedSaEvents(stationId, productId).find(event => event.kind === "production");
            rnrSegmentDraft = {
                ...rnrSegmentDraft,
                startMinute: firstProduction?.startMinute ?? 0,
                endMinute: firstProduction?.endMinute ?? 60,
                okQty: 0, nokQty: 0,
                standardCycleSec: parameter?.standardCycleSec ?? 24,
                piecesPerCycle: parameter?.piecesPerCycle ?? 1,
                orderId: "", evidenceSource: "", isEstimated: false,
            };
            cycleCheckDraft = { samples: "", targetSamples: 20, standardCycleSec: parameter?.standardCycleSec ?? 24, acceptableSlowDeviationPercent: undefined };
        }
        else if (parameter) {
            rnrSegmentDraft.standardCycleSec = parameter.standardCycleSec;
            rnrSegmentDraft.piecesPerCycle = parameter.piecesPerCycle;
            cycleCheckDraft.standardCycleSec = parameter.standardCycleSec;
        }
        rnrContextKey = contextKey;
        rnrSelectedEventId = "";
        rnrActualKind = "production";
        rnrEventNote = "";
        rnrDraftError = "";
        if (!saved) {
            const firstProduction = getPlannedSaEvents(stationId, productId).find(event => event.kind === "production");
            rnrSegmentDraft.startMinute = firstProduction?.startMinute ?? 0;
            rnrSegmentDraft.endMinute = rnrSegmentDraft.startMinute + 60;
            rnrSegmentDraft.okQty = 0;
            rnrSegmentDraft.nokQty = 0;
            rnrSegmentDraft.isEstimated = false;
        }
    }
    const unplannedStops = locale === "zh"
        ? "设备故障 / 工装问题 / 物流等待 / 质量隔离 / 人员问题"
        : "equipmentFailure / toolingIssue / logisticsWaiting / qualityHold / laborIssue";
    rnrRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("rnrEyebrow")}</p>
        <h2>${t("rnrTitle")}</h2>
      </div>
      <div class="panel-actions">
        ${productId === "A-Housing" && operation?.operationId === "op-a-10" && stationId === "OP10" ? `<button class="button secondary" type="button" data-load-rnr-validation>${locale === "zh" ? "加载 R&R 验证样本" : "Load R&R validation sample"}</button>` : ""}
        <span class="pill ${validationFixtureContexts.has(rnrContextKey) ? "warn" : "good"}">${validationFixtureContexts.has(rnrContextKey) ? (locale === "zh" ? "验证样本 · 非现场记录" : "Validation sample · not field data") : (rnrActualEventsByContext.get(rnrContextKey)?.length ?? 0) > 0 ? (locale === "zh" ? "记录中" : "Recording") : t("notStarted")}</span>
      </div>
    </div>
    <p class="note">${t("rnrNote")}</p>
    ${renderRnrBaselineReference(stationId, productId)}
    <div class="field-grid">
      ${field(t("rnrTarget"), operationLabel)}
      ${field(t("station"), stationId)}
      ${field(t("unplannedStopScope"), unplannedStops)}
    </div>
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${t("rnrMode")}</h3>
        <span class="section-label">${rnrMode === "timeWindow" ? "SA" : "CT / P"}</span>
      </div>
      <div class="field-grid">
        ${rnrModeSelect()}
        ${field(t("timeWindowMonitoring"), t("modeTimeWindowHint"))}
        ${field(t("cycleCheck"), t("modeCycleCheckHint"))}
      </div>
    </section>
    ${rnrMode === "timeWindow"
        ? renderRnrActualEditor(stationId, productId, parameter)
        : renderCycleCheckRecord(parameter)}
    <div class="action-bar">
      <span>${t("capacityAnalysisSeparated")}</span>
    </div>
  `;
    bindRnrTracking();
}
function renderRnrBaselineReference(stationId, productId) {
    const events = getPlannedSaEvents(stationId, productId);
    const window = derivePlannedSaWindow(events);
    const summary = summarizePlannedSa(events, window.durationMinutes);
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${t("baselineReference")}</h3><span class="pill">${plannedSaEventsAreDefault ? t("sampleBaseline") : t("baselineReference")}</span></div>
      <div class="field-grid">
        ${field(t("station"), stationId)}
        ${field(t("baselineSaMetric"), percent(summary.bestCaseSaWithBreaks))}
      </div>
      ${renderRnrComparisonTimeline(stationId, events, window)}
      ${rnrMode === "timeWindow" ? `<p class="note">${locale === "zh" ? "实际轨道由现场记录构成；空白表示待补录，不自动计为停机。推断时间损失只在生产段内扣除，不与显式停机重复。" : "The actual track uses on-site records. Blank time is unrecorded, not downtime. Inferred loss is deducted only within production windows, never double-counted with explicit stops."}</p>` : ""}
      ${reconcileCurrentRnrSpeed().segments.some(segment => segment.issue === "faster_than_verified_standard") ? `<p class="form-error" role="alert">${locale === "zh" ? "存在快于已校验标准节拍的生产段：请复核 OK/NOK 数量、每循环件数和真实节拍后再出结果。" : "A production interval is faster than the verified standard: review OK/NOK quantity, pieces per cycle and observed cycle before finalizing."}</p>` : ""}
    </section>
  `;
}
function currentRnrActualEvents() {
    return rnrActualEventsByContext.get(rnrContextKey) ?? [];
}
function reconcileCurrentRnrSpeed() {
    const [, operationId = "", stationId = ""] = rnrContextKey.split("::");
    const [productId = ""] = rnrContextKey.split("::");
    const production = currentRnrActualEvents().filter(event => event.kind === "production");
    const samples = parseCycleSamples(cycleCheckDraft.samples);
    const verified = samples.length >= cycleCheckDraft.targetSamples && cycleCheckDraft.standardCycleSec > 0;
    return reconcileRnrSpeedLoss(production.map(event => ({
        id: event.id, productId, operationId, stationId,
        startMinute: event.startMinute, endMinute: event.endMinute,
        okQty: event.okQty ?? 0, nokQty: event.nokQty ?? 0,
        piecesPerCycle: event.piecesPerCycle ?? 0,
    })), verified ? {
        verifiedStandardCycleSec: cycleCheckDraft.standardCycleSec,
        ...(cycleCheckDraft.acceptableSlowDeviationPercent === undefined ? {} : {
            acceptableSlowDeviationPercent: cycleCheckDraft.acceptableSlowDeviationPercent,
        }),
    } : {});
}
function currentRnrPaceSummary() {
    const [, operationId = "", stationId = ""] = rnrContextKey.split("::");
    const [productId = ""] = rnrContextKey.split("::");
    const observations = currentRnrActualEvents()
        .filter(event => event.kind === "production")
        .map(event => ({
        id: event.id, productId, operationId, stationId,
        startMinute: event.startMinute, endMinute: event.endMinute,
        okQty: event.okQty ?? 0, nokQty: event.nokQty ?? 0,
        piecesPerCycle: event.piecesPerCycle ?? 0,
    }));
    return calculateRnrPaceSummary(observations);
}
function formatPaceVariance(deltaSec, deltaPercent) {
    if (deltaSec === undefined || deltaPercent === undefined)
        return "-";
    const sign = deltaSec > 0 ? "+" : "";
    return `${sign}${formatNumber(deltaSec, 1)}s (${sign}${formatNumber(deltaPercent * 100, 1)}%)`;
}
function renderRnrComparisonTimeline(stationId, planned, window) {
    const actual = currentRnrActualEvents();
    const start = window.startMinute ?? 0;
    const duration = Math.max(window.durationMinutes, 1);
    const ticks = timelineTicks(duration);
    const plannedMinutes = sumTimelineDuration(planned.filter(event => event.kind === "production"));
    const actualMinutes = sumTimelineDuration(actual.filter(event => event.kind === "production"));
    const coveredMinutes = sumTimelineDuration(actual);
    const speed = reconcileCurrentRnrSpeed();
    const pace = currentRnrPaceSummary();
    const complete = coveredMinutes === duration
        && actual.length > 0
        && actual.every(event => event.startMinute >= start && event.endMinute <= start + duration)
        && !validatePlannedSaEvents(actual, window).some(issue => issue.severity === "error")
        && speed.readyForCalibration;
    const fasterThanStandard = speed.segments.some(segment => segment.issue === "faster_than_verified_standard");
    const actualSa = complete
        ? percent(Math.max(actualMinutes - speed.inferredSaLossMinutes, 0) / duration)
        : fasterThanStandard
            ? (locale === "zh" ? "需复核节拍/数量" : "Review cycle / quantity")
            : (locale === "zh" ? "待补录" : "Incomplete");
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "计划 / 实际时间轴" : "Planned / actual timeline"}</h3><span class="section-label">${t("maxFortyEightHours")}</span></div>
      <div class="field-grid">
        ${field(locale === "zh" ? "计划时间开动率" : "Planned time availability", percent(plannedMinutes / duration))}
        ${field(locale === "zh" ? "实际时间开动率" : "Actual time availability", actualSa)}
        ${field(locale === "zh" ? "待补录分钟" : "Unrecorded minutes", formatNumber(Math.max(duration - coveredMinutes, 0)))}
        ${field(locale === "zh" ? "推断时间损失（分钟）" : "Inferred time loss (min)", round1(speed.inferredSaLossMinutes))}
        ${field(locale === "zh" ? "性能损失（分钟）" : "Performance loss (min)", round1(speed.performanceLossMinutes))}
        ${field(locale === "zh" ? "全程平均节拍" : "Full-run average cycle time", pace.averageCycleSec === undefined ? "-" : `${round1(pace.averageCycleSec)}s`)}
      </div>
      <div class="timeline-wrap rnr-comparison" style="--rnr-timeline-width:${Math.max(960, (ticks.length - 1) * 150)}px;">
        <div class="rnr-axis">
          <span class="timeline-station">${t("station")}</span>
          <div class="rnr-axis-track">${ticks.map((minute, index) => `<span class="${index === ticks.length - 1 ? "end" : ""}" style="left:${(minute / duration * 100).toFixed(2)}%">${formatTimelineTick(start + minute, index === 0 ? undefined : start + ticks[index - 1])}</span>`).join("")}</div>
        </div>
        <div class="timeline-row"><div class="timeline-station">${locale === "zh" ? "计划" : "Planned"}<small>${escapeHtml(stationId)}</small></div><div class="timeline-track">${planned.filter(event => event.stationId === stationId).map(event => renderTimelineSegment(event, start, duration)).join("")}</div></div>
        <div class="timeline-row"><div class="timeline-station">${locale === "zh" ? "实际" : "Actual"}<small>${escapeHtml(stationId)}</small></div><div class="timeline-track">${actual.map(event => renderTimelineSegment(event, start, duration)).join("")}</div></div>
      </div>
    </section>
  `;
}
function renderRnrActualEditor(stationId, productId, parameter) {
    const events = currentRnrActualEvents();
    const window = derivePlannedSaWindow(getPlannedSaEvents(stationId, productId));
    const issues = validatePlannedSaEvents(events, window);
    const pace = currentRnrPaceSummary();
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "实际时间段" : "Actual time intervals"}</h3><span class="section-label">${formatNumber(events.length)}</span></div>
      <p class="note">${locale === "zh" ? "每段记录真实起止时钟；生产段另填 OK / NOK。点击一行编辑，下一段默认紧接上一段终点。" : "Record actual start and end times. Production intervals also need OK / NOK. Select a row to edit; new intervals start at the previous end."}</p>
      <div class="field-grid">
        ${rnrInputField(t("startDate"), "segmentStartDate", minuteToDateValue(rnrSegmentDraft.startMinute), "date")}
        ${rnrTimeField(t("startTime"), "segmentStart", rnrSegmentDraft.startMinute)}
        ${rnrInputField(t("endDate"), "segmentEndDate", minuteToDateValue(rnrSegmentDraft.endMinute), "date")}
        ${rnrTimeField(t("endTime"), "segmentEnd", rnrSegmentDraft.endMinute)}
        <div class="field"><label for="rnr-kind">${t("kind")}</label><div class="kind-select-wrap"><span class="kind-dot ${escapeHtml(rnrActualKind)}" aria-hidden="true"></span><select id="rnr-kind" data-rnr-kind>${rnrActualKinds.map(kind => `<option value="${kind}" ${kind === rnrActualKind ? "selected" : ""}>${formatTimelineKind(kind)}</option>`).join("")}</select></div></div>
        ${rnrActualKind === "production" ? `
          ${rnrInputField(t("okQty"), "okQty", String(rnrSegmentDraft.okQty), "number")}
          ${rnrInputField(t("nokQty"), "nokQty", String(rnrSegmentDraft.nokQty), "number")}
          ${rnrInputField(t("piecesPerCycle"), "piecesPerCycle", String(rnrSegmentDraft.piecesPerCycle || parameter?.piecesPerCycle || 1), "number")}
        ` : ""}
        ${rnrInputField(t("evidenceSource"), "evidenceSource", rnrSegmentDraft.evidenceSource)}
        ${rnrAbnormalKinds.has(rnrActualKind) ? `<label class="field checkbox-field"><input type="checkbox" data-rnr-field="isEstimated" ${rnrSegmentDraft.isEstimated ? "checked" : ""} /><span>${locale === "zh" ? "估算记录" : "Estimated record"}</span></label>` : ""}
        <div class="field"><label for="rnr-note">${locale === "zh" ? "原因 / 说明" : "Reason / note"}</label><input id="rnr-note" data-rnr-note value="${escapeHtml(rnrEventNote)}" /></div>
      </div>
      ${rnrDraftError ? `<p class="form-error" role="alert">${escapeHtml(rnrDraftError)}</p>` : ""}
      ${issues.length ? `<p class="form-error" role="alert">${issues.map(issue => escapeHtml(formatKnownText(issue.message))).join("<br>")}</p>` : ""}
      <div class="action-bar"><span>${rnrSelectedEventId ? (locale === "zh" ? "正在编辑已记录时间段" : "Editing recorded interval") : (locale === "zh" ? "新增实际时间段" : "New actual interval")}</span>
        <div><button type="button" class="button secondary" data-rnr-new>${locale === "zh" ? "新建" : "New"}</button>
        <button type="button" class="button" data-rnr-save>${rnrSelectedEventId ? (locale === "zh" ? "保存修改" : "Save changes") : (locale === "zh" ? "添加时间段" : "Add interval")}</button></div>
      </div>
      <div class="table-wrap"><table><thead><tr>
        <th>${locale === "zh" ? "类型" : "Type"}</th><th>${t("startTime")}</th><th>${t("endTime")}</th><th>${t("elapsedMin")}</th><th>OK / NOK</th><th>${locale === "zh" ? "本段平均节拍" : "Segment average CT"}</th><th>${locale === "zh" ? "相对全程差异" : "Vs full-run"}</th><th>${locale === "zh" ? "原因 / 证据" : "Reason / evidence"}</th><th>${locale === "zh" ? "操作" : "Actions"}</th>
      </tr></thead><tbody>${events.length ? events.map(event => `<tr>
        <td><span class="actual-kind"><span class="kind-dot ${escapeHtml(event.kind)}" aria-hidden="true"></span>${formatTimelineKind(event.kind)}</span></td>
        <td>${escapeHtml(formatOptionalMinutePoint(event.startMinute))}</td><td>${escapeHtml(formatOptionalMinutePoint(event.endMinute))}</td>
        <td>${formatNumber(event.endMinute - event.startMinute)}</td><td>${event.kind === "production" ? `${formatNumber(event.okQty ?? 0)} / ${formatNumber(event.nokQty ?? 0)}` : "-"}</td>
        <td>${(() => { const segment = pace.segments.find(item => item.id === event.id); return segment?.averageCycleSec === undefined ? "-" : `${round1(segment.averageCycleSec)}s`; })()}</td>
        <td>${(() => { const segment = pace.segments.find(item => item.id === event.id); return escapeHtml(formatPaceVariance(segment?.deltaSec, segment?.deltaPercent)); })()}</td>
        <td>${escapeHtml([event.note, event.evidenceSource, event.isEstimated ? (locale === "zh" ? "估算" : "Estimated") : ""].filter(Boolean).join(" / ") || "-")}</td>
        <td><button type="button" class="button secondary" data-rnr-edit="${escapeHtml(event.id)}">${locale === "zh" ? "编辑" : "Edit"}</button>
        <button type="button" class="button secondary" data-rnr-delete="${escapeHtml(event.id)}">${t("deleteEvent")}</button></td>
      </tr>`).join("") : `<tr><td colspan="9">${locale === "zh" ? "尚无实际记录" : "No actual records yet"}</td></tr>`}</tbody></table></div>
    </section>
  `;
}
function resetRnrActualDraft() {
    const events = currentRnrActualEvents();
    const [, , stationId = ""] = rnrContextKey.split("::");
    const [productId = ""] = rnrContextKey.split("::");
    const planned = getPlannedSaEvents(stationId, productId);
    const start = events.length ? Math.max(...events.map(event => event.endMinute)) : (derivePlannedSaWindow(planned).startMinute ?? 0);
    rnrSelectedEventId = "";
    rnrActualKind = "production";
    rnrEventNote = "";
    rnrDraftError = "";
    rnrSegmentDraft.startMinute = start;
    rnrSegmentDraft.endMinute = start + 60;
    rnrSegmentDraft.okQty = 0;
    rnrSegmentDraft.nokQty = 0;
    rnrSegmentDraft.evidenceSource = "";
    rnrSegmentDraft.isEstimated = false;
}
function saveRnrActualEvent(stationId, productId) {
    const plannedWindow = derivePlannedSaWindow(getPlannedSaEvents(stationId, productId));
    const start = rnrSegmentDraft.startMinute;
    const end = rnrSegmentDraft.endMinute;
    if (end <= start || start < (plannedWindow.startMinute ?? 0) || end > (plannedWindow.endMinute ?? 0)) {
        rnrDraftError = locale === "zh" ? "实际时间段必须在标准观察窗口内，且结束晚于开始。" : "The interval must fit the observation window and end after it starts.";
        render(selectedProductId);
        return;
    }
    if (rnrActualKind === "production" && (rnrSegmentDraft.okQty + rnrSegmentDraft.nokQty <= 0 || rnrSegmentDraft.piecesPerCycle <= 0)) {
        rnrDraftError = locale === "zh" ? "生产段必须填写有效的 OK / NOK 产出和每循环件数。" : "Production needs valid OK / NOK output and pieces per cycle.";
        render(selectedProductId);
        return;
    }
    const id = rnrSelectedEventId || `rnr-actual-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const next = {
        id, stationId, productId, source: "runRate", kind: rnrActualKind,
        startMinute: start, endMinute: end, note: rnrEventNote,
        evidenceSource: rnrSegmentDraft.evidenceSource,
        ...(rnrAbnormalKinds.has(rnrActualKind) ? { isEstimated: rnrSegmentDraft.isEstimated } : {}),
        ...(rnrActualKind === "production" ? {
            okQty: rnrSegmentDraft.okQty, nokQty: rnrSegmentDraft.nokQty,
            piecesPerCycle: rnrSegmentDraft.piecesPerCycle,
        } : {}),
    };
    const events = [...currentRnrActualEvents().filter(event => event.id !== id), next]
        .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    if (validatePlannedSaEvents(events, plannedWindow).some(issue => issue.severity === "error")) {
        rnrDraftError = locale === "zh" ? "该时间段与同工站记录重叠，请调整起止时间。" : "This interval overlaps another station record.";
        render(selectedProductId);
        return;
    }
    rnrActualEventsByContext.set(rnrContextKey, events);
    resetRnrActualDraft();
    render(selectedProductId);
}
function selectRnrActualEvent(id) {
    const event = currentRnrActualEvents().find(item => item.id === id);
    if (!event)
        return;
    rnrSelectedEventId = id;
    rnrActualKind = event.kind;
    rnrEventNote = event.note ?? "";
    rnrDraftError = "";
    rnrSegmentDraft.startMinute = event.startMinute;
    rnrSegmentDraft.endMinute = event.endMinute;
    rnrSegmentDraft.okQty = event.okQty ?? 0;
    rnrSegmentDraft.nokQty = event.nokQty ?? 0;
    rnrSegmentDraft.piecesPerCycle = event.piecesPerCycle ?? 1;
    rnrSegmentDraft.evidenceSource = event.evidenceSource ?? "";
    rnrSegmentDraft.isEstimated = event.isEstimated ?? false;
    render(selectedProductId);
}
function rnrModeSelect() {
    return `
    <div class="field">
      <label for="rnr-mode">${t("rnrMode")}</label>
      <select id="rnr-mode" data-rnr-mode>
        <option value="timeWindow" ${rnrMode === "timeWindow" ? "selected" : ""}>${t("timeWindowMonitoring")}</option>
        <option value="cycleCheck" ${rnrMode === "cycleCheck" ? "selected" : ""}>${t("cycleCheck")}</option>
      </select>
    </div>
  `;
}
function renderProductionSegmentRecord(stationId, productId, parameter) {
    const record = {
        segmentId: "rnr-segment-1",
        stationId,
        productId,
        startMinute: rnrSegmentDraft.startMinute,
        endMinute: rnrSegmentDraft.endMinute,
        okQty: Math.max(0, rnrSegmentDraft.okQty),
        nokQty: Math.max(0, rnrSegmentDraft.nokQty),
        standardCycleSec: Math.max(0.0001, rnrSegmentDraft.standardCycleSec || parameter?.standardCycleSec || 1),
        piecesPerCycle: Math.max(0.0001, rnrSegmentDraft.piecesPerCycle || parameter?.piecesPerCycle || 1),
        orderId: rnrSegmentDraft.orderId,
        evidenceSource: rnrSegmentDraft.evidenceSource,
    };
    const calculation = calculateProductionSegment(record);
    const statusToneValue = calculation.performanceRate >= 0.94 ? "good" : "warn";
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${t("productionSegmentRecord")}</h3>
        <span class="status ${statusToneValue}">${calculation.performanceRate >= 0.94 ? t("segmentStable") : t("segmentNeedsReview")}</span>
      </div>
      <p class="note">${t("productionSegmentRequiresQty")}</p>
      <div class="field-grid">
        ${field(t("linkedProductionBlock"), `${formatOptionalMinutePoint(record.startMinute)} - ${formatOptionalMinutePoint(record.endMinute)}`)}
        ${rnrInputField(t("startDate"), "segmentStartDate", minuteToDateValue(record.startMinute), "date")}
        ${rnrTimeField(t("startTime"), "segmentStart", record.startMinute)}
        ${rnrInputField(t("endDate"), "segmentEndDate", minuteToDateValue(record.endMinute), "date")}
        ${rnrTimeField(t("endTime"), "segmentEnd", record.endMinute)}
        ${rnrInputField(t("okQty"), "okQty", String(record.okQty), "number")}
        ${rnrInputField(t("nokQty"), "nokQty", String(record.nokQty), "number")}
        ${rnrInputField(t("stdCt"), "standardCycleSec", String(record.standardCycleSec), "number")}
        ${rnrInputField(t("piecesPerCycle"), "piecesPerCycle", String(record.piecesPerCycle), "number")}
        ${rnrInputField(t("orderReference"), "orderId", record.orderId ?? "")}
        ${rnrInputField(t("evidenceSource"), "evidenceSource", record.evidenceSource ?? "")}
      </div>
      <section class="metrics" aria-label="${t("productionSegmentRecord")}" style="margin-top:14px;">
        ${metricCard(t("elapsedMin"), `${round1(calculation.elapsedMinutes)} ${t("minuteUnit")}`, t("calculatedTile"), "neutral")}
        ${metricCard(t("actualQty"), formatNumber(calculation.actualQty), "OK + NOK", "neutral")}
        ${metricCard(t("observedCtSec"), `${round1(calculation.observedCycleSec)}s`, t("calculatedTile"), statusToneValue)}
        ${metricCard(t("expectedQty"), formatNumber(calculation.expectedQtyAtStandard, 1), t("calculatedTile"), "neutral")}
        ${metricCard(t("missingQty"), formatNumber(calculation.missingQty, 1), t("calculatedTile"), calculation.missingQty > 0 ? "warn" : "good")}
        ${metricCard(t("hiddenLossMin"), `${round1(calculation.hiddenLossMinutes)} ${t("minuteUnit")}`, t("calculatedTile"), calculation.hiddenLossMinutes > 0 ? "warn" : "good")}
        ${metricCard(t("performanceRate"), percent(calculation.performanceRate), t("calculatedTile"), statusToneValue)}
      </section>
    </section>
  `;
}
function renderCycleCheckRecord(parameter) {
    const standardCycleSec = cycleCheckDraft.standardCycleSec || parameter?.standardCycleSec || 1;
    const samples = parseCycleSamples(cycleCheckDraft.samples);
    const average = samples.length ? samples.reduce((sum, item) => sum + item, 0) / samples.length : 0;
    const performance = average > 0 ? standardCycleSec / average : 0;
    const complete = samples.length >= cycleCheckDraft.targetSamples;
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${t("cycleCheckRecord")}</h3>
        <span class="status ${complete ? "good" : "warn"}">${formatNumber(samples.length)}/${formatNumber(cycleCheckDraft.targetSamples)}</span>
      </div>
      <p class="note">${t("cycleCheckNote")}</p>
      <div class="field-grid">
        ${rnrInputField(t("cycleSamplesSec"), "cycleSamples", cycleCheckDraft.samples)}
        ${rnrInputField(t("targetSampleCount"), "targetSamples", String(cycleCheckDraft.targetSamples), "number")}
        ${rnrInputField(t("stdCt"), "cycleStandardCycleSec", String(standardCycleSec), "number")}
        <div class="field"><label for="rnr-slow-tolerance">${locale === "zh" ? "可接受的慢速偏差（%，可留空，最多5%）" : "Acceptable slow-speed deviation (%, optional, max 5%)"}</label><input id="rnr-slow-tolerance" data-rnr-field="slowTolerancePercent" type="number" min="0" max="5" step="0.1" value="${cycleCheckDraft.acceptableSlowDeviationPercent ?? ""}" /></div>
      </div>
      ${rnrDraftError ? `<p class="form-error" role="alert">${escapeHtml(rnrDraftError)}</p>` : ""}
      <section class="metrics" aria-label="${t("cycleCheckResult")}" style="margin-top:14px;">
        ${metricCard(t("sampleCount"), formatNumber(samples.length), complete ? t("ready") : t("warning"), complete ? "good" : "warn")}
        ${metricCard(t("averageCt"), samples.length ? `${round1(average)}s` : "-", t("calculatedTile"), performance >= 0.94 ? "good" : "warn")}
        ${metricCard(t("performanceRate"), samples.length ? percent(performance) : "-", t("calculatedTile"), performance >= 0.94 ? "good" : "warn")}
      </section>
    </section>
  `;
}
function rnrInputField(label, fieldName, value, type = "text") {
    return `
    <div class="field">
      <label for="rnr-${escapeHtml(fieldName)}">${escapeHtml(label)}</label>
      <input id="rnr-${escapeHtml(fieldName)}" data-rnr-field="${escapeHtml(fieldName)}" type="${escapeHtml(type)}" value="${escapeHtml(value)}" />
    </div>
  `;
}
function rnrTimeField(label, fieldPrefix, minute) {
    const minuteInDay = ((minute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
    const hourValue = Math.floor(minuteInDay / 60);
    const minuteValue = minuteInDay % 60;
    return `
    <div class="field">
      <label>${escapeHtml(label)}</label>
      <div class="time-pair">
        <select aria-label="${escapeHtml(t("hour"))}" data-rnr-field="${fieldPrefix}Hour">
          ${numberOptions(0, 23, hourValue)}
        </select>
        <select aria-label="${escapeHtml(t("minute"))}" data-rnr-field="${fieldPrefix}MinuteOfHour">
          ${numberOptions(0, 59, minuteValue)}
        </select>
      </div>
    </div>
  `;
}
function bindRnrTracking() {
    rnrRoot.querySelector("[data-load-rnr-validation]")?.addEventListener("click", () => {
        const [productId = "", , stationId = ""] = rnrContextKey.split("::");
        if ((currentRnrActualEvents().length || !plannedSaEventsAreDefault) && !window.confirm(locale === "zh"
            ? "加载验证样本会替换当前工站的计划和实际记录。继续吗？"
            : "Loading the validation sample replaces this station's planned and actual records. Continue?"))
            return;
        const fixture = createRnrValidationFixture(productId, stationId);
        plannedSaEvents = fixture.planned;
        plannedSaEventsAreDefault = false;
        plannedSaContexts.set(`${productId}::${stationId}`, { events: fixture.planned, areDefault: false });
        rnrActualEventsByContext.set(rnrContextKey, fixture.actual);
        validationFixtureContexts.add(rnrContextKey);
        confirmedSuggestions.clear();
        calibrationActionError = "";
        cycleCheckDraft = {
            samples: fixture.cycleSamplesSec.join(", "), targetSamples: fixture.cycleSamplesSec.length,
            standardCycleSec: fixture.standardCycleSec, acceptableSlowDeviationPercent: undefined,
        };
        rnrSegmentDraft.standardCycleSec = fixture.standardCycleSec;
        rnrSegmentDraft.piecesPerCycle = fixture.piecesPerCycle;
        rnrMode = "timeWindow";
        resetRnrActualDraft();
        render(selectedProductId);
    });
    rnrRoot.querySelector("[data-rnr-kind]")?.addEventListener("change", event => {
        rnrActualKind = event.currentTarget.value;
        render(selectedProductId);
    });
    rnrRoot.querySelector("[data-rnr-note]")?.addEventListener("change", event => {
        rnrEventNote = event.currentTarget.value;
        render(selectedProductId);
    });
    rnrRoot.querySelector("[data-rnr-new]")?.addEventListener("click", () => {
        resetRnrActualDraft();
        render(selectedProductId);
    });
    rnrRoot.querySelector("[data-rnr-save]")?.addEventListener("click", () => {
        const [productId = "", , stationId = ""] = rnrContextKey.split("::");
        if (stationId)
            saveRnrActualEvent(stationId, productId);
    });
    rnrRoot.querySelectorAll("[data-rnr-edit]").forEach(button => button.addEventListener("click", () => selectRnrActualEvent(button.dataset.rnrEdit ?? "")));
    rnrRoot.querySelectorAll("[data-rnr-delete]").forEach(button => button.addEventListener("click", () => {
        rnrActualEventsByContext.set(rnrContextKey, currentRnrActualEvents().filter(event => event.id !== button.dataset.rnrDelete));
        resetRnrActualDraft();
        render(selectedProductId);
    }));
    rnrRoot.querySelector("[data-rnr-mode]")?.addEventListener("change", event => {
        rnrMode = event.currentTarget.value === "cycleCheck" ? "cycleCheck" : "timeWindow";
        render(selectedProductId);
    });
    rnrRoot.querySelectorAll("[data-rnr-field]").forEach(input => {
        input.addEventListener("change", () => {
            updateRnrDraft(input.dataset.rnrField ?? "", input.dataset.rnrField === "isEstimated" && input instanceof HTMLInputElement ? String(input.checked) : input.value);
        });
    });
}
function updateRnrDraft(fieldName, value) {
    if (fieldName === "segmentStartDate") {
        rnrSegmentDraft.startMinute = combineDateTimeMinute(value, minuteToTimeValue(rnrSegmentDraft.startMinute));
    }
    else if (fieldName === "segmentEndDate") {
        rnrSegmentDraft.endMinute = combineDateTimeMinute(value, minuteToTimeValue(rnrSegmentDraft.endMinute));
    }
    else if (fieldName === "segmentStartHour" || fieldName === "segmentStartMinuteOfHour") {
        rnrSegmentDraft.startMinute = updateMinuteClockPart(rnrSegmentDraft.startMinute, fieldName === "segmentStartHour" ? "startHour" : "startMinuteOfHour", value);
    }
    else if (fieldName === "segmentEndHour" || fieldName === "segmentEndMinuteOfHour") {
        rnrSegmentDraft.endMinute = updateMinuteClockPart(rnrSegmentDraft.endMinute, fieldName === "segmentEndHour" ? "endHour" : "endMinuteOfHour", value);
    }
    else if (fieldName === "okQty" || fieldName === "nokQty" || fieldName === "standardCycleSec" || fieldName === "piecesPerCycle") {
        rnrSegmentDraft[fieldName] = Math.max(0, Number(value) || 0);
    }
    else if (fieldName === "orderId" || fieldName === "evidenceSource") {
        rnrSegmentDraft[fieldName] = value;
    }
    else if (fieldName === "isEstimated") {
        rnrSegmentDraft.isEstimated = value === "true";
    }
    else if (fieldName === "cycleSamples") {
        cycleCheckDraft.samples = value;
    }
    else if (fieldName === "targetSamples") {
        cycleCheckDraft.targetSamples = Math.max(1, Number(value) || 1);
    }
    else if (fieldName === "cycleStandardCycleSec") {
        cycleCheckDraft.standardCycleSec = Math.max(0.0001, Number(value) || 0.0001);
    }
    else if (fieldName === "slowTolerancePercent") {
        const parsed = value.trim() === "" ? undefined : Number(value);
        if (parsed !== undefined && (!Number.isFinite(parsed) || parsed < 0 || parsed > 5)) {
            rnrDraftError = locale === "zh" ? "可接受的慢速偏差只能为0%至5%。" : "Acceptable slow-speed deviation must be between 0% and 5%.";
            render(selectedProductId);
            return;
        }
        cycleCheckDraft.acceptableSlowDeviationPercent = parsed;
        rnrDraftError = "";
    }
    render(selectedProductId);
}
function parseCycleSamples(value) {
    return value
        .split(/[，,\s/]+/)
        .map(item => Number(item.trim()))
        .filter(item => Number.isFinite(item) && item > 0);
}
function round1(value) {
    return formatNumber(value, 1);
}
function renderCalibration(selectedOperation, routingConfig) {
    const assignment = selectedOperation?.assignments.find(item => item.planningStatus === "available")?.assignment;
    const stationId = selectedWorkflowStationId || assignment?.stationId || "-";
    if (stationId === "-") {
        calibrationRoot.innerHTML = emptyState(t("stationRequired"));
        return;
    }
    const productId = assignment?.productId ?? selectedProductId;
    const events = getPlannedSaEvents(stationId, productId);
    if (!events.length) {
        calibrationRoot.innerHTML = emptyState(t("baselineRequired"));
        return;
    }
    const window = derivePlannedSaWindow(events);
    const baseline = summarizePlannedSa(events, window.durationMinutes);
    const actualEvents = rnrActualEventsByContext.get(`${productId}::${selectedOperation?.operation.operationId ?? ""}::${stationId}`) ?? [];
    const productionEvents = actualEvents.filter(event => event.kind === "production");
    const actualQty = productionEvents.reduce((sum, event) => sum + (event.okQty ?? 0) + (event.nokQty ?? 0), 0);
    const okQty = productionEvents.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
    const qualityRate = actualQty > 0 ? okQty / actualQty : undefined;
    const samples = parseCycleSamples(cycleCheckDraft.samples);
    const sampleAverage = samples.length ? samples.reduce((sum, value) => sum + value, 0) / samples.length : 0;
    const speed = reconcileCurrentRnrSpeed();
    let reconciliation;
    let reconciliationError = "";
    try {
        reconciliation = reconcileRnrTimeline({
            stationId,
            startMinute: window.startMinute ?? 0,
            endMinute: window.endMinute ?? 0,
            planned: events,
            actual: actualEvents,
        });
    }
    catch (error) {
        reconciliationError = error instanceof Error ? error.message : String(error);
    }
    const evidence = reconciliation ? buildRnrEvidence({
        productId, operationId: selectedOperation?.operation.operationId ?? "", stationId,
        startMinute: window.startMinute ?? 0, endMinute: window.endMinute ?? 0,
        planned: events, actual: actualEvents, speed,
    }) : undefined;
    const operationId = selectedOperation?.operation.operationId ?? "";
    const parameter = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operationId, stationId);
    const versions = (scenarioState.operationStationParameters ?? []).filter(item => item.operationId === operationId && item.stationId === stationId);
    let bestActualPreview;
    if (parameter && reconciliation && speed.readyForCalibration) {
        try {
            bestActualPreview = buildRnrBestActualPreview({
                stationId, planned: events, actual: actualEvents,
                standardCycleSec: parameter.standardCycleSec, piecesPerCycle: parameter.piecesPerCycle,
                plannedQualityRate: parameter.qualityRate,
                inferredSaLossMinutes: speed.inferredSaLossMinutes,
            });
        }
        catch {
            bestActualPreview = undefined;
        }
    }
    const suggestions = evidence ? buildParameterSuggestions({
        productId, operationId: selectedOperation?.operation.operationId ?? "", stationId,
        planned: events, actual: actualEvents, ...(parameter ? { parameter } : {}),
        cycleSamplesSec: samples, targetSampleCount: cycleCheckDraft.targetSamples, speed, evidence,
    }) : [];
    const evidencePackage = buildRnrEvidencePackageSnapshot({
        productId,
        operationId,
        stationId,
        window,
        planned: events,
        actual: actualEvents,
        cycleSamplesSec: samples,
        speed,
        evidence,
        suggestions,
        reconciliationComplete: reconciliation?.complete ?? false,
    });
    const ctSuggestion = suggestions.find(item => item.target === "standardCycleSec");
    const pSuggestion = suggestions.find(item => item.target === "performanceRate");
    if (ctSuggestion && pSuggestion && ctSuggestion.proposedValue !== parameter?.standardCycleSec) {
        const rechecked = reconcileRnrSpeedLoss(productionEvents.map(event => ({
            id: event.id, productId, operationId, stationId,
            startMinute: event.startMinute, endMinute: event.endMinute,
            okQty: event.okQty ?? 0, nokQty: event.nokQty ?? 0,
            piecesPerCycle: event.piecesPerCycle ?? 0,
        })), {
            verifiedStandardCycleSec: ctSuggestion.proposedValue,
            ...(cycleCheckDraft.acceptableSlowDeviationPercent === undefined ? {} : {
                acceptableSlowDeviationPercent: cycleCheckDraft.acceptableSlowDeviationPercent,
            }),
        });
        if (rechecked.readyForCalibration) {
            const minutes = productionEvents.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
            const effective = minutes - rechecked.inferredSaLossMinutes;
            if (effective > 0)
                pSuggestion.proposedValue = Math.max(0, Math.min(1, (effective - rechecked.performanceLossMinutes) / effective));
        }
        else {
            pSuggestion.eligibleForConfirmation = false;
            ctSuggestion.eligibleForConfirmation = false;
        }
    }
    const suggestionFingerprint = JSON.stringify({ events, actualEvents, samples, speed, evidence, parameter });
    const observationFingerprint = JSON.stringify({ events, actualEvents, samples, speed, evidence });
    const performance = speed.readyForCalibration && actualEvents.length > 0
        ? (productionEvents.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0) - speed.inferredSaLossMinutes - speed.performanceLossMinutes)
            / Math.max(productionEvents.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0) - speed.inferredSaLossMinutes, 0.0001)
        : (samples.length >= cycleCheckDraft.targetSamples && sampleAverage > 0 ? cycleCheckDraft.standardCycleSec / sampleAverage : undefined);
    calibrationRoot.innerHTML = `
    <div class="panel-head"><div><p class="eyebrow">${t("stageCalibration")}</p><h2>${t("calibrationTitle")}</h2></div><span class="pill">${t("observedDraft")}</span></div>
    <p class="note">${t("calibrationNote")}</p>
    <section class="metrics" style="margin-top:14px;">
      ${metricCard(t("baselineSaMetric"), percent(baseline.bestCaseSaWithBreaks), t("baselineReference"), "good")}
      ${metricCard(t("draftPerformanceMetric"), performance === undefined ? "-" : percent(performance), t("observedDraft"), "neutral")}
      ${metricCard(t("draftQualityMetric"), qualityRate === undefined ? "-" : percent(qualityRate), t("observedDraft"), "neutral")}
    </section>
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "计划 / 实际时间对账" : "Planned / actual time reconciliation"}</h3><span class="pill ${reconciliation?.complete ? "good" : "warn"}">${reconciliation?.complete ? (locale === "zh" ? "时间账完整" : "Timeline complete") : (locale === "zh" ? "待核对" : "Review needed")}</span></div>
      ${reconciliation ? `
        <div class="field-grid">
          ${field(locale === "zh" ? "计划生产分钟" : "Planned production minutes", formatNumber(reconciliation.plannedProductionMinutes))}
          ${field(locale === "zh" ? "实际生产分钟" : "Actual production minutes", formatNumber(reconciliation.actualProductionMinutes))}
          ${field(locale === "zh" ? "显式异常分钟" : "Recorded abnormal minutes", formatNumber(reconciliation.explicitAbnormalMinutes))}
          ${field(locale === "zh" ? "待补录分钟" : "Unrecorded minutes", formatNumber(reconciliation.unrecordedMinutes))}
        </div>
        <div class="table-wrap"><table><thead><tr>
          <th>${locale === "zh" ? "开始" : "Start"}</th><th>${locale === "zh" ? "结束" : "End"}</th>
          <th>${locale === "zh" ? "计划状态" : "Planned state"}</th><th>${locale === "zh" ? "实际状态" : "Actual state"}</th>
          <th>${locale === "zh" ? "差异" : "Difference"}</th>
        </tr></thead><tbody>${reconciliation.rows.map(row => `<tr>
          <td>${escapeHtml(formatOptionalMinutePoint(row.startMinute))}</td>
          <td>${escapeHtml(formatOptionalMinutePoint(row.endMinute))}</td>
          <td>${row.plannedKind === "unrecorded" ? (locale === "zh" ? "计划空档" : "Planned gap") : formatTimelineKind(row.plannedKind)}</td>
          <td>${row.actualKind === "unrecorded" ? (locale === "zh" ? "待补录" : "Unrecorded") : formatTimelineKind(row.actualKind)}</td>
          <td>${row.status === "matched" ? "-" : row.status === "unrecorded" ? (locale === "zh" ? "待补录" : "Unrecorded") : row.status === "plannedGap" ? (locale === "zh" ? "计划空档" : "Planned gap") : (locale === "zh" ? "状态不同" : "Changed state")}</td>
        </tr>`).join("")}</tbody></table></div>
      ` : `<p class="form-error" role="alert">${locale === "zh" ? "时间账存在重叠或越界，请先修正计划/实际记录。" : "Timeline records overlap or fall outside the observation window."} ${escapeHtml(reconciliationError)}</p>`}
    </section>
    ${renderRnrEvidencePanel(evidence)}
    ${renderRnrEvidencePackagePanel(evidencePackage)}
    ${renderRnrBestActualPreviewPanel(bestActualPreview, validationFixtureContexts.has(`${productId}::${selectedOperation?.operation.operationId ?? ""}::${stationId}`))}
    ${renderParameterSuggestionsPanel(suggestions, suggestionFingerprint, observationFingerprint, evidence, parameter, versions, events)}
    ${renderRouteWindowCapacityPanel(routingConfig, window)}
    <p class="note">${t("capacityPreviewOnly")}</p>
  `;
    calibrationRoot.querySelector("[data-window-demand]")?.addEventListener("change", event => {
        const input = event.currentTarget;
        if (!input.checkValidity()) {
            input.reportValidity();
            return;
        }
        windowDemandByRoute.set(`${routingConfig.productId}::${routingConfig.route?.routeId ?? ""}`, input.value);
        renderCalibration(selectedOperation, routingConfig);
    });
    calibrationRoot.querySelector("[data-one-to-one]")?.addEventListener("change", event => {
        const checked = event.currentTarget.checked;
        const key = `${routingConfig.productId}::${routingConfig.route?.routeId ?? ""}`;
        if (checked)
            oneToOneRoutes.add(key);
        else
            oneToOneRoutes.delete(key);
        renderCalibration(selectedOperation, routingConfig);
    });
    calibrationRoot.querySelectorAll("[data-confirm-suggestion]").forEach(button => {
        button.addEventListener("click", () => {
            const suggestion = suggestions[Number(button.dataset.confirmSuggestion)];
            if (!suggestion)
                return;
            const dateInput = calibrationRoot.querySelector(`[data-suggestion-date="${button.dataset.confirmSuggestion}"]`);
            const effectiveFrom = dateInput?.value ?? "";
            suggestionDates.set(suggestion.suggestionId, effectiveFrom);
            try {
                const confirmed = confirmParameterSuggestion(suggestion, effectiveFrom, todayDateValue(), "local-validation");
                confirmedSuggestions.set(suggestion.suggestionId, {
                    fingerprint: confirmationFingerprint(suggestion.target, suggestionFingerprint, observationFingerprint),
                    suggestion: confirmed,
                });
                calibrationActionError = "";
            }
            catch (error) {
                calibrationActionError = error instanceof Error ? error.message : String(error);
            }
            renderCalibration(selectedOperation, routingConfig);
        });
    });
    calibrationRoot.querySelectorAll("[data-cancel-suggestion]").forEach(button => {
        button.addEventListener("click", () => {
            const suggestion = suggestions[Number(button.dataset.cancelSuggestion)];
            if (!suggestion)
                return;
            confirmedSuggestions.delete(suggestion.suggestionId);
            if (suggestion.target === "standardCycleSec" && suggestion.proposedValue !== parameter?.standardCycleSec) {
                const pairedP = suggestions.find(item => item.target === "performanceRate");
                if (pairedP)
                    confirmedSuggestions.delete(pairedP.suggestionId);
            }
            calibrationActionError = "";
            renderCalibration(selectedOperation, routingConfig);
        });
    });
    calibrationRoot.querySelector("[data-publish-parameters]")?.addEventListener("click", () => {
        try {
            if (!parameter)
                throw new Error(locale === "zh" ? "当前工站缺少有效参数。" : "No active parameter for this station.");
            const confirmed = suggestions.filter(item => ["standardCycleSec", "performanceRate", "qualityRate"].includes(item.target))
                .map(item => confirmedSuggestions.get(item.suggestionId))
                .filter((saved) => saved !== undefined && saved.fingerprint === suggestionFingerprint)
                .map(saved => saved.suggestion);
            if (!confirmed.length)
                throw new Error(locale === "zh" ? "请先本地确认至少一项 CT/P/Q 建议。" : "Confirm at least one CT/P/Q suggestion locally first.");
            if (versions.some(item => item.effectiveFrom && item.effectiveFrom > todayDateValue())) {
                throw new Error(locale === "zh" ? "当前工站已有待生效版本，请等待生效或重置样例后再发布。" : "This station already has a pending version; wait for its effective date or reset the sample.");
            }
            const next = publishParameterVersion(parameter, confirmed, confirmed[0].effectiveFrom ?? "", `local-${Date.now()}`);
            if (versions.some(item => item.parameterId === next.parameterId))
                throw new Error("Duplicate version ID");
            const summary = confirmed.map(item => `${item.target === "standardCycleSec" ? "CT" : item.target === "performanceRate" ? "P" : "Q"}: ${item.unit === "rate" ? percent(item.proposedValue) : `${formatNumber(item.proposedValue, 1)}s`}`).join("\n");
            const confirmation = locale === "zh"
                ? `确认发布以下参数到计划计算？\n${summary}\n生效日期：${next.effectiveFrom}\n发布后将保留版本记录，不能取消确认或回滚；标准 SA 时间轴不变。当前发布仅在本地会话有效。`
                : `Publish these parameters to planned calculations?\n${summary}\nEffective date: ${next.effectiveFrom}\nThe version will remain in history and cannot be unconfirmed or rolled back. The planned SA timeline stays unchanged. Publication is session-only.`;
            if (!globalThis.confirm(confirmation))
                return;
            scenarioState.operationStationParameters ??= [];
            scenarioState.operationStationParameters.push(next);
            confirmed.forEach(item => publishedSuggestions.push({ suggestion: { ...item }, versionId: next.parameterId, observationFingerprint }));
            confirmed.forEach(item => confirmedSuggestions.delete(item.suggestionId));
            calibrationActionError = "";
            render(selectedProductId);
        }
        catch (error) {
            calibrationActionError = error instanceof Error ? error.message : String(error);
            renderCalibration(selectedOperation, routingConfig);
        }
    });
}
function buildRnrEvidencePackageSnapshot(input) {
    const packageId = [
        "rnr",
        input.productId,
        input.operationId,
        input.stationId,
        input.window.startMinute ?? "na",
        input.window.endMinute ?? "na",
    ].join("-");
    const status = input.reconciliationComplete && input.actual.length > 0 && input.speed.readyForCalibration
        ? "draft-complete"
        : "draft-incomplete";
    return {
        packageId,
        status,
        generatedAt: new Date().toISOString(),
        scope: {
            productId: input.productId,
            operationId: input.operationId,
            stationId: input.stationId,
            startMinute: input.window.startMinute,
            endMinute: input.window.endMinute,
            durationMinutes: input.window.durationMinutes,
        },
        plannedEvents: input.planned,
        actualEvents: input.actual,
        cycleSamplesSec: input.cycleSamplesSec,
        speedSummary: input.speed,
        evidence: input.evidence ?? null,
        parameterSuggestions: input.suggestions.map(suggestion => ({
            suggestionId: suggestion.suggestionId,
            target: suggestion.target,
            currentValue: suggestion.currentValue,
            proposedValue: suggestion.proposedValue,
            unit: suggestion.unit,
            evidenceRefs: suggestion.evidenceRefs,
            approvalStatus: suggestion.approvalStatus,
            eligibleForConfirmation: suggestion.eligibleForConfirmation,
        })),
        notes: [
            "Current browser-session draft. Not persisted to upstream master data.",
            "Use this snapshot as the basis for R3-5 save/reopen/export implementation.",
        ],
    };
}
function renderRnrEvidencePackagePanel(snapshot) {
    const zh = locale === "zh";
    const json = JSON.stringify(snapshot, null, 2);
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${zh ? "R&R 可恢复证据包" : "Recoverable R&R evidence package"}</h3>
        <span class="pill ${snapshot.status === "draft-complete" ? "good" : "warn"}">${snapshot.status}</span>
      </div>
      <p class="note">${zh ? "当前为会话草稿快照：包含计划事件、实际事件、节拍样本、速度归因、证据结构和参数建议。后续 R3-5 将基于该结构实现保存、重新打开与导出。" : "This is a session draft snapshot containing planned events, actual events, cycle samples, speed attribution, evidence structure and parameter suggestions. R3-5 save/reopen/export will build on this structure."}</p>
      <div class="field-grid">
        ${field(zh ? "证据包ID" : "Package ID", snapshot.packageId)}
        ${field(zh ? "状态" : "Status", snapshot.status)}
        ${field(zh ? "计划事件数" : "Planned events", formatNumber(snapshot.plannedEvents.length))}
        ${field(zh ? "实际事件数" : "Actual events", formatNumber(snapshot.actualEvents.length))}
      </div>
      <textarea class="table-input" readonly style="width:100%;height:220px;margin-top:14px;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;">${escapeHtml(json)}</textarea>
    </section>
  `;
}
function renderRnrBestActualPreviewPanel(preview, isValidationFixture) {
    const zh = locale === "zh";
    return `<section class="sub-card" style="margin-top:14px;">
    <div class="panel-head"><h3>${zh ? "Best case 与实跑对比" : "Best case versus actual"}</h3><span class="pill warn">${isValidationFixture ? (zh ? "验证样本 · 草稿预览" : "Validation sample · draft preview") : (zh ? "草稿预览" : "Draft preview")}</span></div>
    <p class="note">${zh ? "仅比较当前工站的完整观察窗口：Best case = 标准计划生产分钟 × 标准 CT 计算理论总产出，并按 Planned Q 拆分理论 OK/NOK；Actual = 实际生产分钟、现场 OK/NOK 与回算 Actual CT/Q。不含需求份额和多工站分配。" : "Station-level complete-window preview only: Best case uses planned production minutes and standard CT for ideal gross units, then splits ideal OK/NOK by planned Q. Actual uses recorded production minutes and OK/NOK to derive actual CT/Q. Demand share and multi-station allocation are excluded."}</p>
    ${preview?.complete ? `<div class="field-grid">
      ${field(zh ? "标准时间开动率（扣计划休息/停机）" : "Planned time availability (excl. planned breaks/stops)", percent(preview.plannedSa))}
      ${field(zh ? "Actual 时间开动率（扣实际休息/停机/推断）" : "Actual time availability (excl. actual breaks/stops/inference)", percent(preview.actualSa))}
      ${field(zh ? "Planned Q" : "Planned Q", percent(preview.plannedQualityRate))}
      ${field(zh ? "Actual Q" : "Actual Q", preview.actualQualityRate === undefined ? "-" : percent(preview.actualQualityRate))}
      ${field(zh ? "标准 CT（秒/循环）" : "Standard CT (sec/cycle)", formatNumber(preview.standardCycleSec, 1))}
      ${field(zh ? "Actual CT（秒/循环）" : "Actual CT (sec/cycle)", preview.actualCycleSec === undefined ? "-" : formatNumber(preview.actualCycleSec, 1))}
      ${field(zh ? "Best case 理论件数（件）" : "Best case ideal units", formatNumber(preview.bestCaseIdealUnits, 1))}
      ${field(zh ? "实跑总产出（件）" : "Actual gross units", formatNumber(preview.actualGrossUnits))}
      ${field(zh ? "Best case 理论 OK（件）" : "Best case ideal OK units", formatNumber(preview.bestCaseOkUnits, 1))}
      ${field(zh ? "实跑良品件数" : "Actual good units", formatNumber(preview.actualGoodUnits))}
      ${field(zh ? "Best case 理论 NOK（件）" : "Best case ideal NOK units", formatNumber(preview.bestCaseNokUnits, 1))}
      ${field(zh ? "实跑 NOK（件）" : "Actual NOK units", formatNumber(preview.qualityGapUnits))}
      ${field(zh ? "实录生产时间占比（扣实际休息/停机）" : "Recorded production share (excl. actual breaks/stops)", percent(preview.actualRecordedSa))}
      ${field(zh ? "良品差额（件）" : "Good-unit gap", formatNumber(preview.totalGapUnits, 1))}
      ${field(zh ? "时间损失折算（件，含推断）" : "Time gap in units incl. inference", formatNumber(preview.timeGapUnits, 1))}
      ${field(zh ? "其中待归因推断（件）" : "Of which inferred units", formatNumber(preview.inferredSaGapUnits, 1))}
      ${field(zh ? "性能率差额折算（件）" : "Performance gap in units", formatNumber(preview.paceGapUnits, 1))}
    </div>` : `<p class="note">${zh ? "需先补齐当前工站完整观察窗口的计划与实际记录，才显示可比结果。" : "Complete both planned and actual records for the whole observation window before comparing."}</p>`}
    ${preview && !preview.complete ? `<div class="field-grid">
      ${field(zh ? "观察窗口分钟" : "Observation window min", formatNumber(preview.windowMinutes))}
      ${field(zh ? "计划生产分钟" : "Planned production min", formatNumber(preview.plannedProductionMinutes))}
      ${field(zh ? "已录实际生产分钟" : "Recorded actual production min", formatNumber(preview.actualProductionMinutes))}
      ${field(zh ? "待补录分钟" : "Unrecorded min", formatNumber(preview.unrecordedMinutes))}
    </div>` : ""}
    ${preview?.complete && preview.paceGapUnits < 0 ? `<p class="form-error">${zh ? "实跑节拍快于当前标准 CT，请先复核数量和 CT。" : "Actual output is faster than standard CT; review quantities and CT."}</p>` : ""}
    <p class="note">${zh ? "按当前节拍容差规则，推断时间损失计入 Actual SA；原因待查不妨碍计算，也不重复扣减。" : "Inferred time loss enters Actual SA under the current cycle-tolerance rule. An unknown cause does not block calculation or create a second deduction."}</p>
  </section>`;
}
function renderRouteWindowCapacityPanel(routingConfig, window) {
    const zh = locale === "zh";
    if (window.startMinute === undefined || window.endMinute === undefined)
        return "";
    const routeKey = `${routingConfig.productId}::${routingConfig.route?.routeId ?? ""}`;
    const rawDemand = windowDemandByRoute.get(routeKey) ?? "";
    const demandQty = rawDemand === "" ? undefined : Number(rawDemand);
    const oneToOne = oneToOneRoutes.has(routeKey);
    const stations = routingConfig.operations.flatMap(operation => operation.assignments.filter(view => view.planningStatus === "available").map(view => {
        const stationId = view.assignment.stationId;
        const planKey = `${routingConfig.productId}::${stationId}`;
        const actualKey = `${routingConfig.productId}::${operation.operation.operationId}::${stationId}`;
        const cycle = actualKey === rnrContextKey ? cycleCheckDraft : rnrDrafts.get(actualKey)?.cycle;
        const samples = cycle ? parseCycleSamples(cycle.samples) : [];
        const speedOptions = cycle && cycle.targetSamples > 0 && samples.length >= cycle.targetSamples
            && cycle.standardCycleSec > 0 ? {
            verifiedStandardCycleSec: cycle.standardCycleSec,
            ...(cycle.acceptableSlowDeviationPercent === undefined ? {} : {
                acceptableSlowDeviationPercent: cycle.acceptableSlowDeviationPercent,
            }),
        } : undefined;
        return {
            productId: routingConfig.productId,
            operationId: operation.operation.operationId,
            stationId,
            shareCeiling: view.assignment.plannedShare ?? 1,
            ...(view.parameter ? { parameter: view.parameter } : {}),
            planned: planKey === plannedSaContextKey ? plannedSaEvents
                : plannedSaContexts.get(planKey)?.events ?? buildDefaultPlannedActivityEvents(stationId, routingConfig.productId),
            actual: rnrActualEventsByContext.get(actualKey) ?? [],
            ...(speedOptions ? { speedOptions } : {}),
        };
    }));
    let result;
    try {
        result = calculateRouteWindowCapacity({
            startMinute: window.startMinute, endMinute: window.endMinute,
            operationIds: routingConfig.operations.map(item => item.operation.operationId),
            stations,
            ...(oneToOne ? { operationUnitsPerProduct: Object.fromEntries(routingConfig.operations.map(item => [item.operation.operationId, 1])) } : {}),
            ...(demandQty === undefined ? {} : { demandQty }),
        });
    }
    catch (error) {
        return `<section class="sub-card" style="margin-top:14px;"><h3>${zh ? "同窗工序能力" : "Same-window route capacity"}</h3><p class="form-error">${escapeHtml(error instanceof Error ? error.message : String(error))}</p></section>`;
    }
    const blockers = {
        missing_or_invalid_parameter: ["工站参数缺失或无效", "Station parameter missing or invalid"],
        planned_window_missing: ["缺少计划时间窗", "Planned window missing"],
        timeline_invalid: ["时间轴重叠或越界", "Timeline overlaps or exceeds window"],
        planned_window_gap: ["计划时间窗有空档", "Planned window has a gap"],
        actual_window_incomplete: ["实跑时间未覆盖整个窗口", "Actual track does not cover the whole window"],
        actual_production_missing: ["缺少实跑生产段", "Actual production interval missing"],
        actual_cycle_or_quantity_invalid: ["节拍或产出数量待复核", "Cycle time or output quantity needs review"],
    };
    const value = (number) => number === undefined ? "-" : formatNumber(number, 1);
    return `<section class="sub-card" style="margin-top:14px;">
    <div class="panel-head"><h3>${zh ? "同窗工序能力" : "Same-window route capacity"}</h3><span class="pill warn">${zh ? "本地试算" : "Local simulation"}</span></div>
    <div class="field-grid">
      ${field(zh ? "观察窗口" : "Observation window", `${formatOptionalMinutePoint(window.startMinute)} - ${formatOptionalMinutePoint(window.endMinute)}`)}
      ${field(zh ? "路线计划等效成品能力" : "Planned product-equivalent capacity", value(result.bestGoodCapacity))}
      ${field(zh ? "路线实跑等效成品上限" : "Actual product-equivalent upper bound", value(result.actualGoodOutput))}
      ${field(zh ? "计划 / 实跑瓶颈工序" : "Planned / actual bottleneck", `${result.bestBottleneckOperationId ?? "-"} / ${result.actualBottleneckOperationId ?? "-"}`)}
      ${result.demandQty === undefined ? "" : field(zh ? "本窗口能力余量（计划 / 实跑）" : "Window capacity margin (planned / actual)", `${value(result.bestGap)} / ${value(result.actualGap)}`)}
    </div>
    <label class="field" style="display:block;max-width:280px;margin-top:14px;">${zh ? "本窗口需求件数" : "Demand units for this window"}
      <input type="number" min="0" step="1" data-window-demand value="${escapeHtml(rawDemand)}" />
    </label>
    <label style="display:flex;align-items:center;gap:8px;margin-top:12px;"><input type="checkbox" data-one-to-one ${oneToOne ? "checked" : ""} />${zh ? "确认各工序件数均可按 1:1 换算为成品件数" : "Confirm 1:1 product-unit conversion across all operations"}</label>
    <p class="note">${zh ? "工站份额是占用上限，不是自动分单比例。未经件数换算确认，不计算路线瓶颈及需求余量；未填本窗口需求时也不计算余量。" : "Station share is an occupancy ceiling, not an order split. Route bottleneck and demand margin require confirmed unit conversion; margin also requires explicit window demand."}</p>
    <div class="table-wrap"><table><thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "工站" : "Station"}</th><th>${zh ? "占用上限" : "Share ceiling"}</th><th>${zh ? "计划生产分钟" : "Planned production min"}</th><th>${zh ? "计划良品能力" : "Planned good units"}</th><th>${zh ? "实跑 OK" : "Actual OK"}</th><th>${zh ? "实跑时间开动率" : "Actual time availability"}</th><th>${zh ? "待补条件" : "Missing inputs"}</th></tr></thead><tbody>
      ${result.stations.map(item => `<tr><td>${escapeHtml(item.operationId)}</td><td>${escapeHtml(item.stationId)}</td><td>${percent(item.shareCeiling)}</td><td>${value(item.plannedProductionMinutes)}</td><td>${value(item.bestGoodCapacity)}</td><td>${value(item.actualGoodOutput)}</td><td>${item.actualSa === undefined ? "-" : percent(item.actualSa)}</td><td>${item.blockers.length ? item.blockers.map(code => escapeHtml((blockers[code] ?? [code, code])[zh ? 0 : 1])).join("；") : "-"}</td></tr>`).join("") || `<tr><td colspan="8">${zh ? "没有可排产的工站" : "No planning-allowed stations"}</td></tr>`}
    </tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "工站数" : "Stations"}</th><th>${zh ? "计划良品能力" : "Planned good units"}</th><th>${zh ? "实跑 OK" : "Actual OK"}</th></tr></thead><tbody>
      ${result.operations.map(item => `<tr><td>${escapeHtml(item.operationId)}</td><td>${formatNumber(item.stationCount)}</td><td>${value(item.bestGoodCapacity)}</td><td>${value(item.actualGoodOutput)}</td></tr>`).join("")}
    </tbody></table></div>
  </section>`;
}
function renderParameterSuggestionsPanel(suggestions, fingerprint, observationFingerprint, evidence, parameter, versions, planned) {
    const names = {
        setupMinutes: ["换型总分钟", "Total setup minutes"],
        breakMinutes: ["休息总分钟", "Total break minutes"],
        maintenanceMinutes: ["维保总分钟", "Total maintenance minutes"],
        plannedStopMinutes: ["计划停机总分钟", "Total planned-stop minutes"],
        standardCycleSec: ["标准节拍 CT", "Standard cycle time"],
        performanceRate: ["性能率／速度达成率", "Performance rate"],
        qualityRate: ["良率", "Quality rate"],
    };
    const zh = locale === "zh";
    const plannedProductionMinutes = planned.filter(item => item.kind === "production")
        .reduce((sum, item) => sum + item.endMinute - item.startMinute, 0);
    const plannedGoodUnits = parameter && parameter.standardCycleSec > 0
        ? plannedProductionMinutes * 60 / parameter.standardCycleSec * parameter.piecesPerCycle
            * parameter.performanceRate * parameter.qualityRate : undefined;
    const published = versions.some(item => item.supersedesParameterId);
    const contextPublished = publishedSuggestions.filter(entry => versions.some(item => item.parameterId === entry.versionId));
    const publishableTargets = ["standardCycleSec", "performanceRate", "qualityRate"];
    const activityTargets = ["setupMinutes", "breakMinutes", "maintenanceMinutes", "plannedStopMinutes"];
    const activityRows = suggestions
        .map((suggestion, index) => ({ suggestion, index }))
        .filter(entry => activityTargets.includes(entry.suggestion.target));
    const rows = [
        ...suggestions.map((suggestion, index) => ({ suggestion, index, versionId: "" })).filter(entry => publishableTargets.includes(entry.suggestion.target)
            &&
                !contextPublished.some(saved => saved.observationFingerprint === observationFingerprint
                    && saved.suggestion.target === entry.suggestion.target)),
        ...contextPublished
            .filter(entry => publishableTargets.includes(entry.suggestion.target))
            .map(entry => ({ suggestion: entry.suggestion, index: -1, versionId: entry.versionId })),
    ];
    const targetOrder = Object.keys(names);
    rows.sort((a, b) => targetOrder.indexOf(a.suggestion.target) - targetOrder.indexOf(b.suggestion.target)
        || a.index - b.index);
    const format = (item, value) => item.unit === "rate" ? percent(value) : `${formatNumber(value, 1)}${item.unit === "seconds" ? (zh ? " 秒" : " s") : (zh ? " 分钟" : " min")}`;
    return `<section class="sub-card" style="margin-top:14px;">
    <div class="panel-head"><h3>${zh ? "参数更新建议" : "Parameter suggestions"}</h3><span class="pill warn">${zh ? "当前会话草稿" : "Session draft"}</span></div>
    <p class="note">${zh ? "先本地确认，再明确发布 CT/P/Q 到计划参数。确认不改计划；本地发布只影响生效日之后的当前会话计划计算，刷新后消失。休息超时、维保、计划停机及换型差异只进入 Actual SA 和待纠偏，不作为标准时间参数发布。" : "Confirm locally, then explicitly publish CT/P/Q to planned parameters. Confirmation changes no plan; session-only publication affects calculations from its effective date and is lost on refresh. Break overruns, maintenance, planned stops and setup deltas enter Actual SA and corrective follow-up only; they are not published as standard-time parameters."}</p>
    <div class="field-grid">
      ${field(zh ? "当前生效参数版本" : "Active parameter version", parameter?.parameterId ?? "-")}
      ${field(zh ? "当前 CT / P / Q" : "Current CT / P / Q", parameter ? `${formatNumber(parameter.standardCycleSec, 1)}s / ${percent(parameter.performanceRate)} / ${percent(parameter.qualityRate)}` : "-")}
      ${field(zh ? "当前窗口计划良品能力（件）" : "Planned good-unit potential (window)", plannedGoodUnits === undefined ? "-" : formatNumber(plannedGoodUnits, 1))}
    </div>
    ${activityRows.length ? `<div class="table-wrap"><table><caption>${zh ? "Actual SA 待纠偏 / 诊断" : "Actual SA corrective follow-up / diagnostics"}</caption><thead><tr>
      <th>${zh ? "动作" : "Activity"}</th><th>${zh ? "标准窗口分钟" : "Baseline min"}</th><th>${zh ? "实际分钟" : "Actual min"}</th>
      <th>${zh ? "差异" : "Delta"}</th><th>${zh ? "证据引用" : "Evidence refs"}</th><th>${zh ? "处置边界" : "Disposition"}</th>
    </tr></thead><tbody>${activityRows.map(({ suggestion: item }) => {
        const delta = item.proposedValue - item.currentValue;
        const disposition = item.target === "setupMinutes"
            ? (zh ? "仅诊断换型总分钟；未来规则按单次切换方向定义" : "Diagnostic only; future rule is per single changeover direction")
            : (zh ? "进入 Actual SA 和待纠偏，不发布为标准时间参数" : "Actual SA and corrective follow-up only; not a standard-time parameter");
        return `<tr><td>${names[item.target][zh ? 0 : 1]}</td><td>${format(item, item.currentValue)}</td><td>${format(item, item.proposedValue)}</td><td>${format(item, delta)}</td><td>${item.evidenceRefs.map(ref => escapeHtml(ref)).join("<br>")}</td><td>${disposition}</td></tr>`;
    }).join("")}</tbody></table></div>` : ""}
    ${rows.length ? `<div class="table-wrap"><table><thead><tr>
      <th>${zh ? "参数" : "Parameter"}</th><th>${zh ? "当前值" : "Current"}</th><th>${zh ? "建议值" : "Suggested"}</th>
      <th>${zh ? "证据引用" : "Evidence refs"}</th><th>${zh ? "状态" : "Status"}</th>
      <th>${zh ? "生效日期" : "Effective date"}</th><th>${zh ? "操作" : "Action"}</th>
    </tr></thead><tbody>${rows.map(({ suggestion: item, index, versionId }) => {
        const saved = confirmedSuggestions.get(item.suggestionId);
        const currentFingerprint = confirmationFingerprint(item.target, fingerprint, observationFingerprint);
        if (!versionId && saved && (saved.fingerprint !== currentFingerprint || !item.eligibleForConfirmation)) {
            confirmedSuggestions.delete(item.suggestionId);
        }
        const confirmed = !versionId && saved?.fingerprint === currentFingerprint && item.eligibleForConfirmation ? saved.suggestion : undefined;
        const publishedVersion = versionId ? versions.find(version => version.parameterId === versionId) : undefined;
        const status = publishedVersion
            ? `${publishedVersion.effectiveFrom && publishedVersion.effectiveFrom > todayDateValue() ? (zh ? "已发布 · 待生效" : "Published · pending") : publishedVersion.parameterId === parameter?.parameterId ? (zh ? "已发布 · 已生效" : "Published · effective") : (zh ? "已发布 · 历史版本" : "Published · historical")}<br><small>${escapeHtml(versionId)}</small>`
            : confirmed ? (zh ? "已确认 · 未发布" : "Confirmed · unpublished")
                : (zh ? "草稿" : "Draft");
        return `<tr><td>${names[item.target][zh ? 0 : 1]}</td><td>${format(item, item.currentValue)}</td><td>${format(item, item.proposedValue)}</td>
        <td>${item.evidenceRefs.map(ref => escapeHtml(ref)).join("<br>")}</td><td>${status}</td>
        <td>${publishedVersion ? escapeHtml(publishedVersion.effectiveFrom ?? "-") : `<input type="date" data-suggestion-date="${index}" value="${escapeHtml(suggestionDates.get(item.suggestionId) ?? confirmed?.effectiveFrom ?? todayDateValue())}" aria-label="${zh ? "生效日期" : "Effective date"}" ${confirmed ? "disabled" : ""} />`}</td>
        <td>${publishedVersion ? "-" : confirmed ? `<button type="button" class="button secondary" data-cancel-suggestion="${index}">${zh ? "取消确认" : "Undo confirmation"}</button>` : `<button type="button" class="button secondary" data-confirm-suggestion="${index}" ${item.eligibleForConfirmation ? "" : "disabled"}>${zh ? "本地确认" : "Confirm locally"}</button>`}</td></tr>`;
    }).join("")}</tbody></table></div>` : `<p class="note">${zh ? "暂无可发布的 CT/P/Q 建议；需先录入可比较的产出或节拍校验。" : "No publishable CT/P/Q suggestions yet. Record comparable output or cycle checks."}</p>`}
    <div class="action-bar"><span>${zh ? "CT 变更时必须同时确认按新 CT 复核的 P；计划 SA 时间轴不随 CT/P/Q 改变。" : "Changing CT requires P rechecked against the new CT. The planned SA timeline does not change."}</span>
      <button type="button" class="button" data-publish-parameters>${zh ? "发布 CT/P/Q 到计划参数" : "Publish CT/P/Q to planned parameters"}</button></div>
    ${published ? `<div class="table-wrap"><table><thead><tr><th>${zh ? "版本" : "Version"}</th><th>${zh ? "取代版本" : "Supersedes"}</th><th>CT / P / Q</th><th>${zh ? "生效日期" : "Effective date"}</th><th>${zh ? "证据引用" : "Evidence refs"}</th><th>${zh ? "状态" : "Status"}</th></tr></thead><tbody>${versions.map(item => `<tr><td>${escapeHtml(item.parameterId)}</td><td>${escapeHtml(item.supersedesParameterId ?? "-")}</td><td>${formatNumber(item.standardCycleSec, 1)}s / ${percent(item.performanceRate)} / ${percent(item.qualityRate)}</td><td>${escapeHtml(item.effectiveFrom ?? "-")}</td><td>${(item.calibrationRefs ?? []).map(escapeHtml).join("<br>")}</td><td>${item.effectiveFrom && item.effectiveFrom > todayDateValue() ? (zh ? "待生效" : "Pending") : item.parameterId === parameter?.parameterId ? (zh ? "当前生效" : "Active") : (zh ? "历史版本" : "Historical")}</td></tr>`).join("")}</tbody></table></div>` : ""}
    ${suggestions.length && evidence && !evidence.readyForCalculation ? `<p class="note">${zh ? "计算输入尚未完整，需先处理待补录时间或节拍/数量错误；原因待查不阻止计算。" : "Calculation inputs are incomplete. Resolve unrecorded time or cycle/quantity errors; an unknown cause does not block calculation."}</p>` : ""}
    ${calibrationActionError ? `<p class="form-error" role="alert">${escapeHtml(calibrationActionError)}</p>` : ""}
  </section>`;
}
function renderRnrEvidencePanel(evidence) {
    if (!evidence)
        return "";
    const blockerLabels = {
        unrecorded_time: ["仍有待补录时间", "Time remains unrecorded"],
        planned_gap: ["标准计划存在空档", "The planned baseline has a gap"],
        no_production: ["尚无生产段", "No production interval recorded"],
        invalid_observation: ["生产段产出或时长无效", "Production interval has invalid output or duration"],
        faster_than_verified_standard: ["生产段快于已校验节拍，需复核数量和节拍", "Production is faster than verified cycle time; review output and pace"],
    };
    const noticeLabels = {
        missing_evidence_source: ["异常记录未填写来源（不影响 SA 计算）", "Abnormal source not entered (SA can still be calculated)"],
        unexplained_inferred_loss: ["推断损失原因待查（不影响 SA 计算）", "Inferred loss cause unknown (SA can still be calculated)"],
    };
    const rows = [
        ...evidence.explicit.map(item => `<tr><td>${locale === "zh" ? "已记录异常" : "Recorded abnormal"}</td><td>${escapeHtml(formatTimelineKind(item.category))}</td><td>${escapeHtml(formatOptionalMinutePoint(item.startMinute))} - ${escapeHtml(formatOptionalMinutePoint(item.endMinute))}</td><td>${formatNumber(item.minutes, 1)}</td><td>${escapeHtml(item.evidenceSource || "-")}</td><td>${item.isEstimated ? (locale === "zh" ? "是" : "Yes") : (locale === "zh" ? "否" : "No")}</td><td>${escapeHtml(item.sourceEventId)}</td></tr>`),
        ...evidence.inferred.map(item => `<tr><td>${locale === "zh" ? "推断损失" : "Inferred loss"}</td><td>${locale === "zh" ? "待归因" : "Unclassified"}</td><td>${escapeHtml(formatOptionalMinutePoint(item.startMinute))} - ${escapeHtml(formatOptionalMinutePoint(item.endMinute))}</td><td>${formatNumber(item.estimatedMinutes, 1)}</td><td>${locale === "zh" ? "产出反推" : "Output inference"}</td><td>${locale === "zh" ? "是" : "Yes"}</td><td>${escapeHtml(item.sourceProductionEventId)}</td></tr>`),
    ].join("");
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "异常证据与推断损失" : "Abnormal evidence and inferred loss"}</h3><span class="pill ${evidence.readyForCalculation ? "good" : "warn"}">${evidence.readyForCalculation ? (locale === "zh" ? "计算数据完整" : "Calculation inputs complete") : (locale === "zh" ? "计算数据待补齐" : "Calculation inputs incomplete")}</span></div>
      <div class="field-grid">
        ${field(locale === "zh" ? "已记录异常分钟" : "Recorded abnormal minutes", formatNumber(evidence.explicitMinutes, 1))}
        ${field(locale === "zh" ? "待确认推断分钟" : "Inferred minutes to confirm", formatNumber(evidence.inferredMinutes, 1))}
      </div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>${locale === "zh" ? "来源类型" : "Evidence type"}</th><th>${locale === "zh" ? "类别" : "Category"}</th><th>${locale === "zh" ? "起止时钟" : "Time window"}</th><th>${locale === "zh" ? "分钟" : "Minutes"}</th><th>${locale === "zh" ? "证据来源" : "Source"}</th><th>${locale === "zh" ? "估算" : "Estimated"}</th><th>${locale === "zh" ? "原始事件ID" : "Source event ID"}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="note">${locale === "zh" ? "暂无异常证据或推断损失。" : "No abnormal evidence or inferred loss yet."}</p>`}
      ${evidence.blockers.length ? `<ul class="message-list">${evidence.blockers.map(blocker => `<li>${escapeHtml(blockerLabels[blocker.code][locale === "zh" ? 0 : 1])}${blocker.sourceEventId ? ` · ${escapeHtml(blocker.sourceEventId)}` : ""}</li>`).join("")}</ul>` : ""}
      ${evidence.notices.length ? `<ul class="message-list">${evidence.notices.map(notice => `<li>${escapeHtml(noticeLabels[notice.code][locale === "zh" ? 0 : 1])}${notice.sourceEventId ? ` · ${escapeHtml(notice.sourceEventId)}` : ""}</li>`).join("")}</ul>` : ""}
      <p class="note">${locale === "zh" ? "推断损失按节拍容差规则计入 Actual SA；来源及根因可线下继续调查，不改写标准 SA。" : "Inferred loss enters Actual SA under the cycle-tolerance rule. Its cause may be investigated offline; the planned baseline is unchanged."}</p>
    </section>
  `;
}
function renderPreflight(preflight) {
    const readinessRows = preflight.readiness.issues.map(issue => `
    <tr>
      <td><span class="status ${issue.severity === "error" ? "bad" : "warn"}">${formatIssueSeverity(issue.severity)}</span></td>
      <td>${escapeHtml(issue.code)}</td>
      <td>${escapeHtml(issue.operationId ?? "-")}</td>
      <td>${escapeHtml(issue.stationId ?? "-")}</td>
      <td>${escapeHtml(formatKnownText(issue.message))}</td>
    </tr>
  `).join("");
    const shareRows = preflight.shareEvaluations.map(item => `
    <tr>
      <td>${escapeHtml(item.operationId)}</td>
      <td>${escapeHtml(item.stationId)}</td>
      <td>${formatShare(item.requestedCapacityShare)}</td>
      <td>${formatShare(item.requiredCapacityShare)}</td>
      <td>${formatShare(item.actualCapacityShare)}</td>
      <td><span class="status ${riskTone(item.status)}">${formatRiskStatus(item.status)}</span></td>
      <td>${item.risks.length ? escapeHtml(formatKnownText(item.risks.map(risk => risk.message).join(" / "))) : "-"}</td>
    </tr>
  `).join("");
    const batchRows = preflight.batchChecks.map(item => `
    <tr>
      <td>${escapeHtml(item.operationId)}</td>
      <td>${formatNumber(item.quantity)}</td>
      <td>${formatNumber(item.minimumProcessHU)}</td>
      <td>${formatNumber(item.batchMultiple)}</td>
      <td><span class="status ${batchTone(item.status)}">${formatBatchStatus(item.status)}</span></td>
      <td>${formatNumber(item.suggestedQuantity)}</td>
      <td>${escapeHtml(formatKnownText(item.message))}</td>
    </tr>
  `).join("");
    const canEnterAnalysis = preflight.ready && preflight.blockers.length === 0;
    preflightRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("parameterPreflight")}</p>
        <h2>${canEnterAnalysis ? t("readyForCapacity") : t("blockedBeforeCapacity")}</h2>
      </div>
      <span class="pill ${canEnterAnalysis ? "good" : "bad"}">${canEnterAnalysis ? t("ready") : t("blocked")}</span>
    </div>
    <div class="field-grid">
      ${field(t("readinessIssues"), preflight.readiness.ready ? t("ready") : t("blocked"))}
      ${field(t("operationsChecked"), formatNumber(preflight.readiness.operationsChecked))}
      ${field(t("planningAllowedAssignments"), formatNumber(preflight.readiness.planningAllowedAssignments.length))}
      ${field(t("blockedBackupAssignments"), formatNumber(preflight.readiness.blockedBackupAssignments.length))}
    </div>
    <div class="split">
      <section>
        <h3>${t("blockers")}</h3>
        ${preflight.blockers.length ? list(preflight.blockers) : emptyState(t("noHardBlocker"))}
      </section>
      <section>
        <h3>${t("warnings")}</h3>
        ${preflight.warnings.length ? list(preflight.warnings) : emptyState(t("noWarning"))}
      </section>
    </div>
    <div class="action-bar">
      <span>${canEnterAnalysis ? t("preflightPassedAction") : t("preflightBlockedAction")}</span>
      <span class="section-label">${t("capacityPreviewOnly")}</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("severity")}</th><th>${t("code")}</th><th>${t("operation")}</th><th>${t("station")}</th><th>${t("message")}</th></tr></thead>
        <tbody>${readinessRows || `<tr><td colspan="5">${t("noReadinessIssue")}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("operation")}</th><th>${t("station")}</th><th>${t("requested")}</th><th>${t("required")}</th><th>${t("actual")}</th><th>${t("riskStatus")}</th><th>${t("riskMessages")}</th></tr></thead>
        <tbody>${shareRows || `<tr><td colspan="7">${t("noShareEvaluation")}</td></tr>`}</tbody>
      </table>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>${t("operation")}</th><th>${t("plannedQty")}</th><th>${t("minimumHu")}</th><th>${t("batchMultiple")}</th><th>${t("status")}</th><th>${t("suggestedQty")}</th><th>${t("message")}</th></tr></thead>
        <tbody>${batchRows || `<tr><td colspan="7">${t("noBatchHuCheck")}</td></tr>`}</tbody>
      </table>
    </div>
  `;
}
function formatShare(value) {
    return value === undefined ? "-" : percent(value);
}
function riskTone(status) {
    if (status === "ok")
        return "good";
    if (status === "warning")
        return "warn";
    return "bad";
}
function batchTone(status) {
    if (status === "ok")
        return "good";
    if (status === "needsApproval")
        return "warn";
    return "bad";
}
function syncRouteSelector(productId) {
    const routes = scenarioState.routes.filter(route => route.productId === productId && route.status === "released");
    routeSelect.innerHTML = routes
        .map(route => `<option value="${escapeHtml(route.routeId ?? route.productId)}">${escapeHtml(route.routeId ?? `${route.productId} ${locale === "zh" ? "路线" : "route"}`)}</option>`)
        .join("");
    routeSelect.disabled = routes.length <= 1;
    const productRouteId = scenarioState.products?.find(product => product.productId === productId)?.routeId;
    routeSelect.value = productRouteId && routes.some(route => route.routeId === productRouteId)
        ? productRouteId
        : routes[0]?.routeId ?? "";
}
function selectedRouteId() {
    return routeSelect.value || undefined;
}
function buildPlannedQuantityByOperation(routingConfig) {
    const planned = {};
    for (const operationView of routingConfig.operations) {
        const policy = scenarioState.batchHUPolicies?.find(item => item.productId === routingConfig.productId && item.operationId === operationView.operation.operationId);
        if (!policy)
            continue;
        planned[operationView.operation.operationId] = policy.preferredBatchMultiple ?? policy.batchMultiple ?? policy.minimumProcessHU;
    }
    return planned;
}
function selectOperation(operationId) {
    selectedOperationId = operationId;
    render(selectedProductId);
    if (window.matchMedia("(max-width: 760px)").matches) {
        operationDetailRoot.scrollIntoView({ block: "start", behavior: "smooth" });
    }
}
function resolveSelectedOperation(operations) {
    const selected = operations.find(operation => operation.operation.operationId === selectedOperationId);
    if (selected)
        return selected;
    selectedOperationId = operations[0]?.operation.operationId ?? "";
    return operations[0];
}
function getRouteStatus(routingConfig) {
    if (!routingConfig.product)
        return { label: "product missing", tone: "bad" };
    if (!routingConfig.route)
        return { label: "route missing", tone: "bad" };
    if (!routingConfig.masterDataValidation.formalReady) {
        const firstIssue = routingConfig.masterDataValidation.issues[0];
        return { label: firstIssue?.code === "route_not_released" ? "route not released" : "route master data invalid", tone: "bad" };
    }
    if (!routingConfig.operations.length)
        return { label: "no operation", tone: "bad" };
    const missingAssignment = routingConfig.operations.some(operation => operation.assignments.length === 0);
    const missingParameter = routingConfig.operations.some(operation => operation.assignments.some(assignment => assignment.assignment.planningAllowed && !assignment.parameter));
    const blockedAssignments = routingConfig.operations
        .flatMap(operation => operation.assignments)
        .filter(assignment => assignment.planningStatus === "blocked");
    if (missingAssignment || missingParameter)
        return { label: "incomplete", tone: "bad" };
    if (blockedAssignments.length)
        return { label: "ready with backup gate", tone: "warn" };
    return { label: "ready", tone: "good" };
}
function getOperationCompleteness(operationView) {
    const assignments = operationView.assignments;
    const availableAssignments = assignments.filter(item => item.planningStatus === "available");
    const blockedAssignments = assignments.filter(item => item.planningStatus === "blocked");
    const parameterScope = assignments.filter(item => item.assignment.planningAllowed);
    const completeParameters = parameterScope.filter(item => item.parameter);
    return {
        assignmentLabel: assignments.length
            ? `${formatNumber(availableAssignments.length)}/${formatNumber(assignments.length)} ${t("availableWord")}${blockedAssignments.length ? `, ${formatNumber(blockedAssignments.length)} ${t("blockedWord")}` : ""}`
            : t("missing"),
        assignmentTone: assignments.length && availableAssignments.length ? (blockedAssignments.length ? "warn" : "good") : "bad",
        parameterLabel: parameterScope.length
            ? `${formatNumber(completeParameters.length)}/${formatNumber(parameterScope.length)}${t("planningStations")}`
            : t("noPlanningStation"),
        parameterTone: parameterScope.length && completeParameters.length === parameterScope.length ? "good" : "bad",
    };
}
function formatKnownText(value) {
    if (locale !== "zh")
        return value;
    const exact = {
        "Product A Housing": "产品A壳体",
        "Product B Housing": "产品B壳体",
        Housing: "壳体",
        "Machining 01": "机加工01",
        "Machining 02": "机加工02",
        "Future Machining 03": "未来机加工03",
        "Assembly 01": "装配01",
        "Machining capable stations": "机加工可承接工站组",
        "Assembly capable stations": "装配可承接工站组",
        Machining: "机加工",
        Assembly: "装配",
        machining: "机加工",
        assembly: "装配",
        "Customer approval pending": "客户批准待完成",
        "Use only after customer process approval and capacity shortage confirmation.": "仅在客户工艺批准且确认产能不足后启用。",
        "unscheduled / not planned": "未排产 / 不开机",
        "single day": "单日窗口",
    };
    let result = exact[value] ?? value;
    const fragments = {
        "Customer approval pending": "客户批准待完成",
        "Use only after customer process approval and capacity shortage confirmation.": "仅在客户工艺批准且确认产能不足后启用。",
        "does not exist in products": "在产品主数据中不存在",
        "does not have a matching route": "没有匹配的工艺路线",
        "is not released": "未发布",
        "is not effective on": "在该日期不生效：",
        "has no ProcessMaster reference": "没有引用工艺主数据",
        "references missing ProcessMaster": "引用的工艺主数据不存在：",
        "references ProcessMaster": "引用工艺主数据",
        "which is not released": "，但尚未发布",
        "references missing Stage BOM": "引用的阶段BOM不存在：",
        "references missing WIP state": "引用的WIP状态不存在：",
        "does not belong to the expected": "不属于预期的产品/路线/工序：",
        "does not belong to Stage BOM": "不属于对应的阶段BOM：",
        "operation sequence": "工序顺序",
        "route has no operations": "路线没有配置工序",
        "needs customer approval before series planning": "量产排产前需要客户批准",
        "has no station assignment": "没有工站分配",
        "has no planning-allowed station assignment": "没有允许排产的工站分配",
        "has no planning-allowed station": "没有允许排产的工站",
        "has no approved parameter": "没有已批准参数",
        "has no operation-station parameter": "没有工序-工站参数",
        "missing parameter": "缺少参数",
        "is backup but not planning allowed": "是备用工站，但当前不允许排产",
        "standardCycleSec must be greater than 0": "标准CT必须大于0",
        "piecesPerCycle must be greater than 0": "每循环件数必须大于0",
        "has no batch HU policy": "没有批量/HU规则",
        "capacity analysis can continue but planning batch rules are incomplete": "产能分析可以继续，但排产批量规则不完整",
        "quantity": "数量",
        "is below minimum process HU": "低于最小工序HU",
        "is not a full HU multiple": "不是完整HU倍数",
        "exception approval required": "需要例外审批",
        "should be rounded up to": "建议向上取整为",
        "must be planned as full HU only": "必须按完整HU排产",
        "matches batch multiple": "符合批量倍数",
        "required share": "需求占用",
        "actual share": "实际占用",
        "exceeds capacity ceiling": "超过产能占用上限",
        "exceeds required share": "超过需求占用",
        "endMinute must be greater than startMinute": "结束时间必须大于开始时间",
        "is outside the configured timeline horizon": "超出已配置的时间窗口",
        "overlaps": "与",
        "one station can only have one state at a time": "同一工站同一时间只能有一种状态",
        " on ": " 在 ",
    };
    for (const [from, to] of Object.entries(fragments)) {
        result = result.replaceAll(from, to);
    }
    return result;
}
function formatDemandScenario(value) {
    const labels = {
        launch: "项目启动",
        rampUp: "爬坡",
        massProduction: "批量生产",
        peak: "峰值需求",
        custom: "自定义",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatRole(value) {
    const labels = {
        primary: "主工站",
        parallel: "并行工站",
        backup: "备用工站",
        series: "量产工站",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatPlanningStatus(value) {
    const labels = {
        available: "可排产",
        blocked: "被阻止",
        warning: "需关注",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatApprovalStatus(value) {
    const labels = {
        draft: "草稿",
        pending: "待批准",
        approved: "已批准",
        effective: "已生效",
        rejected: "已拒绝",
        notRequired: "已放行（无需客户批准）",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatAllocationMode(value) {
    const labels = {
        fixedShare: "固定份额",
        forecastCalculated: "按需求/预测计算占用",
        defaultCapacityCeiling: "100%（未设固定上限）",
        manual: "手工设定",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatTimelineKind(value) {
    const labels = {
        production: "生产",
        setup: "换型",
        break: "休息",
        maintenance: "维护保养",
        plannedStop: "计划停机",
        unscheduled: "未排产",
        equipmentFailure: "设备故障",
        toolingIssue: "工装问题",
        logisticsWaiting: "物流等待",
        qualityHold: "质量隔离",
        laborIssue: "人员问题",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatPlannedCategory(value) {
    const labels = {
        production: "生产",
        plannedActivity: "计划动作 / 计划损失",
        notPlanned: "未排产 / 不开机",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatCapacityStatus(value) {
    const labels = {
        ok: "正常",
        short: "不足",
        warning: "需关注",
        critical: "严重",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatEffectivePeriod(from, to) {
    if (!from && !to)
        return "-";
    return (from ?? "-") + " → " + (to ?? "-");
}
function formatRouteStatusLabel(value) {
    const labels = {
        "product missing": "产品缺失",
        "route missing": "路线缺失",
        "no operation": "没有工序",
        incomplete: "未完整",
        "route not released": "路线未发布",
        "route master data invalid": "路线主数据无效",
        "ready with backup gate": "就绪但存在备用门禁",
        ready: "就绪",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatIssueSeverity(value) {
    const labels = {
        error: "错误",
        warning: "警告",
        info: "信息",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatRiskStatus(value) {
    const labels = {
        ok: "正常",
        warning: "需关注",
        critical: "严重",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function formatBatchStatus(value) {
    const labels = {
        ok: "正常",
        needsApproval: "需要审批",
        invalid: "无效",
    };
    return locale === "zh" ? labels[value] ?? value : value;
}
function metricCard(label, value, detail, tone) {
    return `<article class="metric ${tone}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(value)}</strong><span>${escapeHtml(detail)}</span></article>`;
}
function statusTone(tone) {
    return tone === "neutral" ? "" : tone;
}
function field(label, value) {
    return `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
function list(items) {
    return `<ul class="message-list">${items.map(item => `<li>${escapeHtml(formatKnownText(item))}</li>`).join("")}</ul>`;
}
function emptyState(message) {
    return `<p class="empty">${escapeHtml(message)}</p>`;
}
function percent(value) {
    return `${formatNumber(value * 100, 1)}%`;
}
function escapeHtml(value) {
    return value.replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char));
}
init();
