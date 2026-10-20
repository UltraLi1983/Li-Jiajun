import { sampleScenario } from "../domain/sample-data.js";
import { bootstrapLocalState, listRouteHistory, readRouteHistory, removeLocalState, saveLocalState, setLocalStateErrorHandler } from "./local-state-client.js";
import { calculateProductionSegment } from "../engine/run-rate-segment.js";
import { buildParameterSuggestions, confirmParameterSuggestion } from "../engine/parameter-calibration.js";
import { buildRouteWindowCapacityView, collectRouteWindowCandidates, listRouteOperations, nextStationId, resolveRouteObservationWindow, routeWindowKey, stationActualKey, stationPlanKey, } from "./route-navigation.js";
import { addCycleSample, diagnosePlannedCycle, emptyCycleSampleDraft, formatStopwatch, migrateLegacyCycleDraft, removeCycleSample, replaceCycleSample, setCycleSampleMark, setCycleSampleReason, stopwatchCode, summarizeCycleSamples, } from "../engine/cycle-samples.js";
import { correctPlannedCycleFromCheck, createLocalBaselineParameter, establishInitialLocalPreset, performanceAgainstCycle, publishParameterVersion, selectEffectiveParameter } from "../engine/parameter-versioning.js";
import { resolveOperationOutputRequirement } from "../engine/operation-output-requirement.js";
import { createRnrValidationFixture, placeFixtureActualsOnWindow, RNR_VALIDATION_WINDOW_MINUTES } from "../engine/rnr-validation-fixture.js";
import { buildRnrBestActualPreview } from "../engine/rnr-best-actual-preview.js";
import { freezeStandardWindow, isFrozenStandardWindowCurrent } from "../engine/standard-window.js";
import { copyStandardWindowToWeek } from "../engine/standard-window-projection.js";
import { ledgerShiftCount, mostLikelyMonthProduction, observeShiftAllowance, summarizeMostLikely } from "../engine/most-likely-allowance.js";
import { buildPeriodCapacity } from "../engine/week-month-capacity.js";
import { buildRouteWeekPlan } from "../engine/route-week-plan.js";
import { describeCurrentRouteBottleneck, listRouteReportGaps, presentCurrentRouteBottleneck, routeReportGapBadge, selectCompleteRouteWeek } from "../engine/current-route-bottleneck.js";
import { applyLocalValidation, assessLocalTrial, assignLocalStation, clearLocalValidation, createLocalProcess, createLocalProcessType, createLocalRouteCopy, createLocalStation, extractLocalValidation, groupProductRoutes, insertLocalOperationAt, renameLocalOperation, reorderLocalOperations, setLocalStationFlowPolicy, isLocalDraftProcess, isLocalDraftProcessType, isLocalDraftRoute, listProcessRouteReferences, parseLocalValidationStore, processTypeFamilyOf, stationCompatibleWithOperation, } from "../engine/local-validation-route.js";
import { renderRouteWeekSheets } from "./route-week-report.js";
import { buildWeekMinuteLedger, maxShiftsForLength, repeatWeekForMonth, validateManualMinutes } from "../engine/week-minute-ledger.js";
import { buildStandardSaSampleSlots, findStandardSaDayGaps, intervalCoveredByShifts, reconcileAutoFilledGaps, standardSaOffShiftIntervals, standardSaShiftIntervals, summarizeStandardSaDay, validateStandardSaDay } from "../engine/standard-sa-day.js";
import { formatNumber, formatOutputUnits } from "./number-format.js";
import { calculateRnrPaceSummary, reconcileRnrSpeedLoss } from "../engine/rnr-reconciliation.js";
import { buildProductRoutingConfiguration, buildRnrEvidence, reconcileRnrTimeline, runCapacityAnalysisPreflight, validateTimelineEvents, } from "../index.js";
const languageSelect = requireElement("#languageSelect");
const languageLabelRoot = requireElement("label[for=\"languageSelect\"]");
const productSelect = requireElement("#productSelect");
const routeSelect = requireElement("#routeSelect");
const operationSelect = requireElement("#operationSelect");
const stationSelect = requireElement("#stationSelect");
const scopeStrip = requireElement("#scopeStrip");
const summaryRoot = requireElement("#summaryCards");
const productRoot = requireElement("#productPanel");
const routingRoot = requireElement("#routingPanel");
const visualRouteRoot = requireElement("#visualRoutePanel");
const routeStatusRoot = requireElement("#routeStatus");
const operationDetailRoot = requireElement("#operationDetailPanel");
const stationAssignmentRoot = requireElement("#stationAssignmentPanel");
const plannedSaRoot = requireElement("#plannedSaPanel");
const rnrRoot = requireElement("#rnrPanel");
const preflightRoot = requireElement("#preflightPanel");
const calibrationRoot = requireElement("#calibrationPanel");
const processLibraryRoot = requireElement("#processLibraryPanel");
const loadWarningRoot = document.querySelector("#appLoadWarning");
const workflowStages = ["library", "routing", "baseline", "reality", "calibration"];
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
        stageLibrary: "工艺库",
        stageRoutingHint: "定义产品工序及对应工站，确认工站分配与参数。",
        stageBaselineHint: "在最多 48 小时的标准窗口内记录生产、休息、换型和计划停机。",
        stageLibraryHint: "维护可复用的本地工艺。不改当前产品路线，也不登记物理设备。",
        stageRealityHint: "以当前工站的标准 SA 为参照，记录现场产出与节拍。",
        stageCalibrationHint: "复核观察草稿与标准基准，并检查进入产能分析的条件。",
        nextBaseline: "继续：标准 SA 设定", nextReality: "继续：现场 R&R 跟踪", nextCalibration: "查看参数校准与产能预检",
        stationSelectLabel: "当前工站",
        operationSelectLabel: "当前工序",
        operationRequired: "当前路线没有工序",
        currentStationScope: "当前工站",
        wholeRouteScope: "整条路线",
        scopeProduct: "产品",
        scopeOperation: "工序",
        scopeStation: "工站",
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
        capacityPreviewOnly: "同窗跨工站能力仍是本地试算。路线周报告读取已生成周账，是内部草稿，不是已发布的正式排产。",
        readyForCapacity: "工艺参数预检通过", blockedBeforeCapacity: "工艺参数预检被阻止",
        canEnterCapacityAnalysis: "工艺参数预检通过",
    },
    en: {
        stageRouting: "Routing and stations", stageBaseline: "Standard SA setup", stageReality: "On-site R&R tracking", stageCalibration: "Calibration and capacity",
        stageLibrary: "Process Library",
        stageRoutingHint: "Define product operations, assign stations and check their parameters.",
        stageBaselineHint: "Record production, breaks, changeovers and planned stops in a standard window of up to 48 hours.",
        stageLibraryHint: "Maintain reusable local processes. This does not change the current route or register physical equipment.",
        stageRealityHint: "Use the selected station standard SA as the reference for actual output and cycle observations.",
        stageCalibrationHint: "Review draft observations against the standard baseline and check capacity readiness.",
        nextBaseline: "Continue: Standard SA setup", nextReality: "Continue: On-site R&R", nextCalibration: "Review calibration and capacity preflight",
        stationSelectLabel: "Current station",
        operationSelectLabel: "Current operation",
        operationRequired: "This route has no operation",
        currentStationScope: "Current station",
        wholeRouteScope: "Whole route",
        scopeProduct: "Product",
        scopeOperation: "Operation",
        scopeStation: "Station",
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
        capacityPreviewOnly: "Same-window route capacity remains a local simulation. The route week report reads generated ledgers and is an internal draft, not a published plan.",
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
        routeOperationEyebrow: "工序主数据",
        routeOperationTitle: "工序字段核对",
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
        cycleCheckNote: "纸上勾过的循环序号，在同一行标 N.OK 或 Stopping。Stopping 不进平均，算作去除；N.OK 仍进平均。慢于这次平均的拍会标出，异常原因可以后补。已有计划 CT 时不提出新的标准 CT。手机截屏识别尚未接入。",
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
        modeTimeWindowHint: "记录一段真实生产时间、产出数量和异常损失，用于矫正 SA，同时矫正 P 和 Q。",
        modeCycleCheckHint: "逐次录入循环样本，原则上只核对并矫正 CT。",
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
        routeOperationEyebrow: "Operation master data",
        routeOperationTitle: "Operation fields",
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
        cycleCheckNote: "Mark the same cycle index N.OK or Stopping from the paper sheet. A stop stays out of the average and counts as excluded. N.OK stays in the average. Laps slower than that average are flagged. A reason can be added later. An existing planned CT is not replaced. Phone-screenshot reading is not available yet.",
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
        modeTimeWindowHint: "Record a real production interval, output quantity and abnormal losses. This corrects SA, and also P and Q.",
        modeCycleCheckHint: "Enter one cycle at a time. In principle this only checks and corrects CT.",
        capacityAnalysisSeparated: "Review observations and capacity readiness in stage four.",
    },
};
let scenarioState = cloneScenario();
let locale = "zh";
let activeWorkflowStage = "routing";
let selectedProductId = "";
let selectedOperationId = "";
let selectedWorkflowStationId = "";
let visualInspectorMode = "station";
let visualStationId = "";
let visualEditingStationKey = "";
let isRouteEditorOpen = true;
let routeCameFromLibrary = false;
let visualRouteError = "";
let visualInsertIndex = 0;
let isMockEditing = false;
let localValidationNotice = "";
let localStoreError = "";
let libraryReturnStage = "routing";
let libraryQuery = "";
let libraryTypeQuery = "";
let libraryShowNewType = false;
let librarySelectedProcessId = "";
let libraryError = "";
let libraryNotice = "";
let libraryForm = { name: "", processTypeId: "", description: "", businessCode: "", newTypeName: "", newTypeFamily: "manufacturing" };
const localValidationStorageKey = "capa-local-validation-v1";
let routeHistory = [];
let routeHistoryOpen = false;
let localBaselineVersionCounter = 0;
const localBaselineErrors = new Map();
const localBaselineStoragePrefix = "capa-local-baseline-v1:";
const localOperationQuantityStoragePrefix = "capa-operation-quantity-v1:";
const localOperationQuantityErrors = new Map();
let plannedSaEvents = [];
let plannedSaContextKey = "";
const plannedSaContexts = new Map();
const standardSaDayConfigs = new Map();
const frozenStandardWindows = new Map();
const copyProjectionDrafts = new Map();
const stationWeekSnapshots = new Map();
let plannedSaEventsAreDefault = false;
let standardWindowFreezeError = "";
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
    recoverableMinutes: 0,
};
let cycleCheckDraft = emptyCycleSampleDraft();
let editingCycleSampleId = "";
let rnrContextKey = "";
const rnrActualEventsByContext = new Map();
const validationFixtureContexts = new Set();
let rnrSelectedEventId = "";
let rnrActualKind = "production";
let rnrEventNote = "";
let rnrDraftError = "";
let pendingCycleCorrection;
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
const routeWindowMemory = new Map();
let calibrationActionError = "";
let evidenceDraftMessage = "";
const autoRestoredEvidenceContexts = new Set();
const autoSavedEvidenceSignatures = new Map();
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
    restoreLocalValidation();
    restoreLocalBaselines();
    restoreLocalOperationQuantities();
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
        selectedWorkflowStationId = "";
        visualStationId = "";
        visualInspectorMode = "station";
        syncRouteSelector(selectedProductId);
        render(selectedProductId);
    });
    routeSelect.addEventListener("change", () => {
        selectedOperationId = "";
        selectedWorkflowStationId = "";
        visualStationId = "";
        visualInspectorMode = "station";
        render(selectedProductId);
    });
    operationSelect.addEventListener("change", () => {
        if (operationSelect.value === selectedOperationId)
            return;
        selectedOperationId = operationSelect.value;
        selectedWorkflowStationId = "";
        visualStationId = "";
        visualInspectorMode = "operation";
        armIgnoreValidationLoadClick();
        render(selectedProductId);
    });
    stationSelect.addEventListener("change", () => {
        if (stationSelect.value === selectedWorkflowStationId)
            return;
        selectedWorkflowStationId = stationSelect.value;
        visualStationId = stationSelect.value;
        visualInspectorMode = "station";
        armIgnoreValidationLoadClick();
        render(selectedProductId);
    });
    selectedProductId = productSelect.value || scenarioState.products?.[0]?.productId || "";
    productSelect.value = selectedProductId;
    syncRouteSelector(selectedProductId);
    applyShellTranslations();
    render(selectedProductId);
    loadWarningRoot?.setAttribute("hidden", "");
    void refreshRouteHistory();
}
async function refreshRouteHistory() {
    try {
        routeHistory = await listRouteHistory();
        render(selectedProductId);
    }
    catch {
        localStoreError = locale === "zh" ? "无法读取本机路线历史。" : "Could not read local route history.";
        render(selectedProductId);
    }
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
    if (value === "library" && activeWorkflowStage !== "library")
        libraryReturnStage = activeWorkflowStage;
    if (value === "routing" && activeWorkflowStage !== "routing")
        routeCameFromLibrary = activeWorkflowStage === "library";
    activeWorkflowStage = value;
    document.querySelectorAll(".workflow-stage").forEach(section => {
        section.hidden = section.dataset.stage !== activeWorkflowStage;
    });
    document.querySelectorAll("[data-stage-nav]").forEach(button => {
        const active = button.dataset.stageNav === activeWorkflowStage;
        button.classList.toggle("active", active);
        if (active)
            button.setAttribute("aria-current", "page");
        else
            button.removeAttribute("aria-current");
    });
    const stageKeys = {
        library: ["stageLibrary", "stageLibraryHint"],
        routing: ["stageRouting", "stageRoutingHint"], baseline: ["stageBaseline", "stageBaselineHint"],
        reality: ["stageReality", "stageRealityHint"], calibration: ["stageCalibration", "stageCalibrationHint"],
    };
    document.querySelector(".page-head h2").textContent = t(stageKeys[activeWorkflowStage][0]);
    document.querySelector(".page-head p").textContent = t(stageKeys[activeWorkflowStage][1]);
    scopeStrip.hidden = activeWorkflowStage === "routing" || activeWorkflowStage === "library";
    const libraryButton = visualRouteRoot.querySelector("#visualOpenLibrary");
    if (libraryButton)
        libraryButton.textContent = routeLibraryButtonText();
}
function routeLibraryButtonText() {
    if (locale === "zh")
        return routeCameFromLibrary ? "返回工艺库" : "进入工艺库";
    return routeCameFromLibrary ? "Back to process library" : "Open process library";
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
        ...(routingConfig.route?.routeId ? { routeId: routingConfig.route.routeId } : {}),
        availableMinutesByStation: { OP10: 2880, OP10B: 2880, OP20: 2880 },
        plannedQuantityByOperation: buildPlannedQuantityByOperation(routingConfig),
    });
    const selectedOperation = resolveSelectedOperation(routingConfig.operations);
    syncOperationSelector(routingConfig.operations);
    syncStationSelector(selectedOperation);
    updateScopeStrip(routingConfig, selectedOperation);
    updateLocalValidationBanner(routingConfig);
    for (const operation of routingConfig.operations) {
        for (const assignment of workflowStationViews(operation)) {
            restoreAutoSavedRnrEvidence({
                productId: assignment.assignment.productId,
                operationId: operation.operation.operationId,
                stationId: assignment.assignment.stationId,
                ...(localRouteId() ? { routeId: localRouteId() } : {}),
            });
        }
    }
    renderSummary(routingConfig, preflight);
    renderProcessLibrary();
    renderProduct(routingConfig);
    renderRouteStatus(routingConfig);
    renderRouting(routingConfig.operations);
    renderVisualRoute(routingConfig, selectedOperation);
    renderOperationDetail(selectedOperation, routingConfig);
    renderStationAssignmentPage(routingConfig.operations);
    renderPlannedSaInput(routingConfig, selectedOperation);
    renderRnrTracking(selectedOperation);
    renderCalibration(selectedOperation, routingConfig);
    renderPreflight(preflight);
    paintRouteReportGaps(currentRouteReportGaps(routingConfig));
    setWorkflowStage(activeWorkflowStage);
}
function syncOperationSelector(operations) {
    const options = listRouteOperations(operations.map(item => ({
        operationId: item.operation.operationId,
        sequence: item.operation.sequence,
        name: formatKnownText(item.operation.name),
    })));
    operationSelect.innerHTML = options.length
        ? options.map(item => `<option value="${escapeHtml(item.operationId)}">${escapeHtml(item.label)}</option>`).join("")
        : `<option value="">${escapeHtml(t("operationRequired"))}</option>`;
    operationSelect.disabled = options.length <= 1;
    operationSelect.value = selectedOperationId;
}
function syncStationSelector(selectedOperation) {
    const assignments = workflowStationViews(selectedOperation);
    selectedWorkflowStationId = nextStationId(selectedWorkflowStationId, assignments.map(item => item.assignment.stationId));
    stationSelect.innerHTML = assignments.length
        ? assignments.map(item => {
            const gap = item.planningStatus === "missingParameter" ? (locale === "zh" ? " · 无计划 CT" : " · no planned CT") : "";
            return `<option value="${escapeHtml(item.assignment.stationId)}">${escapeHtml(formatKnownText(item.station?.name ?? item.assignment.stationId))} / ${escapeHtml(item.assignment.stationId)}${gap}</option>`;
        }).join("")
        : `<option value="">${escapeHtml(t("stationRequired"))}</option>`;
    stationSelect.disabled = assignments.length <= 1;
    stationSelect.value = selectedWorkflowStationId;
}
function updateScopeStrip(routingConfig, selectedOperation) {
    const product = routingConfig.product;
    const operation = selectedOperation?.operation;
    const assignment = selectedOperation?.assignments.find(item => item.assignment.stationId === selectedWorkflowStationId);
    const productText = product ? `${formatKnownText(product.name)} / ${product.productId}` : "-";
    const operationText = operation ? `OP${operation.sequence} ${formatKnownText(operation.name)}` : t("operationRequired");
    const stationText = selectedWorkflowStationId
        ? `${formatKnownText(assignment?.station?.name ?? selectedWorkflowStationId)} / ${selectedWorkflowStationId}`
        : "-";
    scopeStrip.innerHTML = `
    <span><small>${escapeHtml(t("scopeProduct"))}</small>${escapeHtml(productText)}</span>
    <span><small>${escapeHtml(t("scopeOperation"))}</small>${escapeHtml(operationText)}</span>
    <span><small>${escapeHtml(t("scopeStation"))}</small>${escapeHtml(stationText)}</span>
  `;
}
function renderSummary(routingConfig, preflight) {
    const operations = routingConfig.operations.length;
    const assignments = routingConfig.operations.reduce((sum, operation) => sum + operation.assignments.length, 0);
    const blocked = routingConfig.operations.flatMap(operation => operation.assignments).filter(item => item.planningStatus !== "available").length;
    const bottleneck = currentRouteBottleneckCard(routingConfig);
    summaryRoot.innerHTML = [
        metricCard(t("readiness"), preflight.ready ? t("ready") : t("blocked"), preflight.ready ? t("canEnterCapacityAnalysis") : `${formatNumber(preflight.blockers.length)}${t("blockerCount")}`, preflight.ready ? "good" : "bad"),
        metricCard(t("routingMetric"), `${formatNumber(operations)}${t("operationUnit")} / ${formatNumber(assignments)}${t("stationUnit")}`, `${formatNumber(blocked)}${t("unavailableStationAssignment")}`, blocked ? "warn" : "good"),
        metricCard(t("demandMetric"), `${formatNumber(routingConfig.product?.weeklyDemand ?? 0)} / ${t("perWeek")}`, routingConfig.product?.demandScenario ? formatDemandScenario(routingConfig.product.demandScenario) : t("noScenario"), "neutral"),
        bottleneckCard(t("bottleneck"), bottleneck),
    ].join("");
}
function currentRouteBottleneckCard(routingConfig) {
    const available = routingConfig.operations.flatMap(operation => operation.assignments.filter(view => view.planningStatus === "available").map(view => ({
        operationId: operation.operation.operationId,
        operationName: formatKnownText(operation.operation.name),
        stationId: view.assignment.stationId,
        stationName: formatKnownText(view.station?.name ?? view.assignment.stationId),
    })));
    const operations = [...new Map(available.map(item => [item.operationId, item.operationName])).entries()].map(([operationId, name]) => ({
        operationId,
        name,
        stations: available.filter(item => item.operationId === operationId).map(item => ({ stationId: item.stationId, name: item.stationName })),
    }));
    const weeksByStation = Object.fromEntries(available.map(item => [item.stationId, weeksForCurrentRouteStation(routingConfig.productId, item.stationId)]));
    const selection = selectCompleteRouteWeek(available.map(item => item.stationId), weeksByStation);
    const weeklyDemand = routingConfig.product?.weeklyDemand;
    const demandQty = typeof weeklyDemand === "number" && Number.isSafeInteger(weeklyDemand) && weeklyDemand >= 0 ? weeklyDemand : undefined;
    const plan = selection.ok ? routeWeekPlanFor(routingConfig, selection.weekStartDate, "outlook", demandQty) : undefined;
    const view = describeCurrentRouteBottleneck({
        routeId: routingConfig.route?.routeId ?? routingConfig.productId,
        ...(routingConfig.route?.version ? { routeVersion: routingConfig.route.version } : {}),
        selection,
        ...(plan ? { plan } : {}),
        operations,
    });
    return presentCurrentRouteBottleneck(view, locale === "zh" ? "zh" : "en");
}
function currentRouteReportGaps(routingConfig) {
    const localeCode = locale === "zh" ? "zh" : "en";
    const positions = routingConfig.operations.flatMap(operation => {
        const available = operation.assignments.filter(view => view.planningStatus === "available");
        const operationName = formatKnownText(operation.operation.name);
        if (!available.length) {
            return [{
                    operationId: operation.operation.operationId,
                    operationName,
                    stationId: "",
                    stationName: "",
                    weeks: [],
                    draftWeekStart: "",
                    generated: false,
                }];
        }
        return available.map(view => {
            const stationId = view.assignment.stationId;
            const draft = getCopyProjectionDraft(routingConfig.productId, stationId);
            return {
                operationId: operation.operation.operationId,
                operationName,
                stationId,
                stationName: formatKnownText(view.station?.name ?? stationId),
                weeks: weeksForCurrentRouteStation(routingConfig.productId, stationId),
                draftWeekStart: draft.weekStartDate,
                generated: draft.generated,
            };
        });
    });
    const planning = positions.filter(position => position.stationId);
    const selection = selectCompleteRouteWeek(planning.map(position => position.stationId), Object.fromEntries(planning.map(position => [position.stationId, position.weeks])));
    const weeklyDemand = routingConfig.product?.weeklyDemand;
    const demandQty = typeof weeklyDemand === "number" && Number.isSafeInteger(weeklyDemand) && weeklyDemand >= 0 ? weeklyDemand : undefined;
    const plan = selection.ok ? routeWeekPlanFor(routingConfig, selection.weekStartDate, "outlook", demandQty) : undefined;
    return listRouteReportGaps(positions, localeCode, plan);
}
function paintRouteReportGaps(gaps) {
    const localeCode = locale === "zh" ? "zh" : "en";
    const badge = (gap) => `<span class="pill bad report-gap-pill">${escapeHtml(routeReportGapBadge(gap.code, localeCode))}</span>`;
    document.querySelectorAll("[data-report-gap-station]").forEach(node => {
        const matched = gaps.filter(gap => gap.stationId && gap.stationId === node.dataset.reportGapStation);
        node.hidden = matched.length === 0;
        node.innerHTML = matched.map(gap => node.hasAttribute("data-report-gap-detail")
            ? `${badge(gap)} ${escapeHtml(gap.detail)}`
            : badge(gap)).join("");
    });
    document.querySelectorAll("[data-report-gap-operation]").forEach(node => {
        const matched = gaps.filter(gap => !gap.stationId && gap.operationId === node.dataset.reportGapOperation);
        node.hidden = matched.length === 0;
        node.innerHTML = matched.map(gap => badge(gap)).join("");
    });
    document.querySelectorAll("[data-report-gap-host]").forEach(node => {
        node.innerHTML = gaps.length
            ? `<h4>${escapeHtml(locale === "zh" ? "还不能输出路线报告的位置" : "Positions that cannot feed the route report")}</h4><ul class="route-report-gaps">${gaps.map(gap => `<li data-report-gap="${escapeHtml(gap.stationId || gap.operationId)}">${badge(gap)}<span>${escapeHtml(gap.detail)}</span></li>`).join("")}</ul>`
            : `<p class="pill good">${escapeHtml(locale === "zh" ? "当前路线可以输出这一周的路线件数" : "This route can output this week's route pieces")}</p>`;
    });
}
function weeksForCurrentRouteStation(productId, stationId) {
    const prefix = `${planScopeKey(productId, stationId)}::`;
    return [...stationWeekSnapshots.keys()]
        .filter(key => key.startsWith(prefix))
        .map(key => key.slice(prefix.length))
        .filter(week => /^\d{4}-\d{2}-\d{2}$/.test(week));
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
        ${routingConfig.route && isLocalDraftRoute(routingConfig.route) ? `<div class="panel-actions" style="margin-top:14px;"><button id="clearLocalValidation" class="button secondary" type="button">${locale === "zh" ? "清除本地验证路线" : "Clear local validation routes"}</button></div>` : ""}
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
        clearLocalBaselines();
        clearLocalOperationQuantities();
        scenarioState = cloneScenario();
        restoreLocalValidation();
        isMockEditing = false;
        localBaselineVersionCounter = 0;
        localBaselineErrors.clear();
        localOperationQuantityErrors.clear();
        localValidationNotice = "";
        libraryError = "";
        libraryNotice = "";
        libraryForm = { name: "", processTypeId: "", description: "", businessCode: "", newTypeName: "", newTypeFamily: "manufacturing" };
        selectedProductId = scenarioState.products?.[0]?.productId ?? "";
        selectedOperationId = "";
        selectedWorkflowStationId = "";
        plannedSaContexts.clear();
        standardSaDayConfigs.clear();
        frozenStandardWindows.clear();
        copyProjectionDrafts.clear();
        standardWindowFreezeError = "";
        plannedSaContextKey = "";
        plannedSaEvents = [];
        rnrDrafts.clear();
        rnrActualEventsByContext.clear();
        clearAllAutoSavedRnrEvidence();
        validationFixtureContexts.clear();
        confirmedSuggestions.clear();
        publishedSuggestions.length = 0;
        suggestionDates.clear();
        windowDemandByRoute.clear();
        routeWindowMemory.clear();
        calibrationActionError = "";
        cycleCheckDraft = emptyCycleSampleDraft();
        editingCycleSampleId = "";
        rnrMode = "timeWindow";
        rnrSelectedEventId = "";
        rnrContextKey = "";
        renderProductSelector();
        productSelect.value = selectedProductId;
        syncRouteSelector(selectedProductId);
        render(selectedProductId);
    });
    productRoot.querySelector("#clearLocalValidation")?.addEventListener("click", () => {
        const confirmed = window.confirm(locale === "zh"
            ? "只清除本机的本地验证路线、工序和工站分配。工艺库里的工艺定义会保留。样例路线和已有 R&R 会保留。继续吗？"
            : "Clear only local validation routes, operations and station assignments. The process library, sample routes and existing R&R stay. Continue?");
        if (!confirmed)
            return;
        clearLocalOperationQuantities(scenarioState.routes.filter(isLocalDraftRoute).map(route => route.routeId ?? ""));
        clearLocalValidation(scenarioState);
        dropLocalRuntimeState();
        persistLocalValidation();
        localValidationNotice = "";
        visualRouteError = "";
        isRouteEditorOpen = false;
        visualStationId = "";
        visualEditingStationKey = "";
        selectedOperationId = "";
        selectedWorkflowStationId = "";
        syncRouteSelector(selectedProductId, scenarioState.products?.find(product => product.productId === selectedProductId)?.routeId);
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
function applyVisualRouteChange(result, options = {}) {
    if ("issues" in result) {
        visualRouteError = result.issues.map(localIssueText).join("；");
    }
    else {
        visualRouteError = "";
        scenarioState = result.scenario;
        persistLocalValidation();
        if (options.routeId)
            syncRouteSelector(selectedProductId, options.routeId);
        if (options.operationId)
            selectedOperationId = options.operationId;
        if (options.stationId) {
            visualStationId = options.stationId;
            selectedWorkflowStationId = options.stationId;
            visualInspectorMode = "station";
        }
    }
    render(selectedProductId);
}
function moveVisualOperation(routeId, operationId, targetIndex) {
    const route = scenarioState.routes.find(item => item.routeId === routeId);
    if (!route || !isLocalDraftRoute(route))
        return;
    const ids = [...route.operations].sort((a, b) => a.sequence - b.sequence).map(item => item.operationId);
    const from = ids.indexOf(operationId);
    if (from < 0 || targetIndex < 0 || targetIndex >= ids.length || from === targetIndex)
        return;
    ids.splice(from, 1);
    ids.splice(targetIndex, 0, operationId);
    applyVisualRouteChange(reorderLocalOperations(scenarioState, routeId, ids), { operationId });
}
function bindVisualRouteToolbar(routingConfig, selectedOperation) {
    const route = routingConfig.route;
    visualRouteRoot.querySelector("#visualStartArrange")?.addEventListener("click", () => {
        if (!route)
            return;
        if (!isLocalDraftRoute(route)) {
            const approved = window.confirm(locale === "zh"
                ? "当前路线已发布、不可直接修改。继续编排将建立本地草稿副本；原路线和历史记录不变。继续吗？"
                : "This route is released and read-only. Continue by creating a local draft copy? The original route and history remain unchanged.");
            if (!approved)
                return;
            isRouteEditorOpen = true;
            const result = createLocalRouteCopy(scenarioState, route.routeId ?? "");
            applyVisualRouteChange(result, "route" in result && result.route.routeId ? { routeId: result.route.routeId } : {});
        }
        else if (!isRouteEditorOpen) {
            isRouteEditorOpen = true;
            renderVisualRoute(routingConfig, selectedOperation);
        }
        visualRouteRoot.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    visualRouteRoot.querySelector("#visualExitEditor")?.addEventListener("click", () => {
        isRouteEditorOpen = false;
        renderVisualRoute(routingConfig, selectedOperation);
        productRoot.scrollIntoView({ block: "start", behavior: "smooth" });
    });
    visualRouteRoot.querySelector("#visualOpenLibrary")?.addEventListener("click", () => setWorkflowStage("library"));
}
function renderVisualRoute(routingConfig, selectedOperation) {
    const zh = locale === "zh";
    const route = routingConfig.route;
    const local = !!route && isLocalDraftRoute(route);
    const ordered = [...routingConfig.operations].sort((a, b) => a.operation.sequence - b.operation.sequence);
    const invalidFlowPolicies = (route?.stationFlowPolicies ?? []).filter(policy => {
        const index = ordered.findIndex(item => item.operation.operationId === policy.fromOperationId);
        return index < 0 || ordered[index + 1]?.operation.operationId !== policy.toOperationId;
    });
    const invalidFlowNotice = invalidFlowPolicies.map(policy => `<div class="route-flow-warning" role="alert">
    <span>${zh ? "工站连线已不对应相邻工序" : "Station links no longer join adjacent operations"}：${escapeHtml(policy.fromOperationId)} → ${escapeHtml(policy.toOperationId)}</span>
    ${local ? `<button class="button secondary" type="button" data-remove-stale-flow="${escapeHtml(policy.fromOperationId)}" data-to-operation="${escapeHtml(policy.toOperationId)}">${zh ? "移除失效连线" : "Remove stale links"}</button>` : ""}
  </div>`).join("");
    const flowLabel = (operationId) => {
        const policy = route?.stationFlowPolicies?.find(item => item.toOperationId === operationId);
        if (!policy)
            return "";
        const stationName = (stationId) => formatKnownText(scenarioState.stations?.find(item => item.stationId === stationId)?.name ?? stationId);
        return policy.allowedPairs.map(pair => `${stationName(pair.fromStationId)} → ${stationName(pair.toStationId)}`).join(" · ");
    };
    const toolbarActions = `<div class="panel-actions">
    <button class="button" type="button" id="visualStartArrange" ${route ? "" : "disabled"}>${zh ? "编排工艺路线" : "Arrange process route"}</button>
    <button class="button secondary" type="button" id="visualExitEditor" ${isRouteEditorOpen ? "" : "disabled"}>${zh ? "退出编排" : "Exit editor"}</button>
    <button class="button secondary" type="button" id="visualOpenLibrary">${routeLibraryButtonText()}</button>
  </div>`;
    if (!isRouteEditorOpen) {
        const summary = ordered.map(view => {
            const operation = view.operation;
            const stationNames = view.assignments.map(assignment => formatKnownText(assignment.station?.name ?? assignment.assignment.stationId));
            const stationMarks = view.assignments.map(assignment => `<span data-report-gap-station="${escapeHtml(assignment.assignment.stationId)}"></span>`).join("");
            return `<li class="route-summary-item"><span class="route-summary-sequence">OP${operation.sequence}</span><strong>${escapeHtml(formatKnownText(operation.name))}</strong><small>${escapeHtml(stationNames.join("、") || (zh ? "待分配工站" : "No station assigned"))}</small>${flowLabel(operation.operationId) ? `<small class="route-flow-tag">${escapeHtml(flowLabel(operation.operationId))}</small>` : ""}${stationMarks}<span data-report-gap-operation="${escapeHtml(operation.operationId)}"></span></li>`;
        }).join("");
        visualRouteRoot.innerHTML = `<div class="route-editor-toolbar"><div><h2>${zh ? "工艺路线编排" : "Route editor"}</h2><p class="note">${escapeHtml(route?.routeId ?? "-")}</p></div>
      ${toolbarActions}</div>
      ${localStoreError ? `<p class="form-error" role="alert">${escapeHtml(localStoreError)}</p>` : ""}
      ${localValidationNotice ? `<p class="form-ok" role="status">${escapeHtml(localValidationNotice)}</p>` : ""}
      ${invalidFlowNotice}
      ${summary ? `<div class="route-summary-scroll"><ol class="route-summary" aria-label="${zh ? "当前工艺路线" : "Current process route"}">${summary}</ol></div>` : ""}`;
        bindVisualRouteToolbar(routingConfig, selectedOperation);
        bindInvalidFlowRemoval(route);
        paintRouteReportGaps(currentRouteReportGaps(routingConfig));
        return;
    }
    const stationView = selectedOperation?.assignments.find(view => view.assignment.stationId === visualStationId)
        ?? selectedOperation?.assignments.find(view => view.assignment.stationId === selectedWorkflowStationId);
    const operation = selectedOperation?.operation;
    const previousView = operation ? ordered[ordered.findIndex(item => item.operation.operationId === operation.operationId) - 1] : undefined;
    const flowPolicy = previousView && operation ? route?.stationFlowPolicies?.find(item => item.fromOperationId === previousView.operation.operationId && item.toOperationId === operation.operationId) : undefined;
    const fromStations = previousView?.assignments.filter(item => item.assignment.planningAllowed) ?? [];
    const toStations = selectedOperation?.assignments.filter(item => item.assignment.planningAllowed) ?? [];
    const flowPairs = fromStations.flatMap((from, fromIndex) => toStations.map((to, toIndex) => {
        const checked = flowPolicy?.allowedPairs.some(pair => pair.fromStationId === from.assignment.stationId
            && pair.toStationId === to.assignment.stationId) ?? false;
        return `<label class="route-flow-pair"><input type="checkbox" name="pair" value="${fromIndex}:${toIndex}" ${checked ? "checked" : ""}>
      <span>${escapeHtml(formatKnownText(from.station?.name ?? from.assignment.stationId))}</span><span aria-hidden="true">→</span><span>${escapeHtml(formatKnownText(to.station?.name ?? to.assignment.stationId))}</span></label>`;
    })).join("");
    const flowEditor = local && previousView && operation ? `<form id="visualFlowForm" class="route-flow-editor" data-from-operation="${escapeHtml(previousView.operation.operationId)}" data-to-operation="${escapeHtml(operation.operationId)}">
    <h4>${zh ? "来自上一工序的工站流转" : "Station flow from previous operation"}</h4>
    <p class="note">OP${previousView.operation.sequence} → OP${operation.sequence} · ${flowPolicy ? (zh ? "仅按已连线组合流转" : "Linked pairs only") : (zh ? "默认全部可互通" : "All stations may connect by default")}</p>
    ${flowPairs ? `<div class="route-flow-pairs">${flowPairs}</div><div class="panel-actions"><button class="button secondary" type="submit">${zh ? "确认定向连线" : "Confirm station links"}</button>
      ${flowPolicy ? `<button class="button secondary" type="button" id="visualClearFlow">${zh ? "恢复全部互通" : "Restore all-to-all"}</button>` : ""}</div>` : `<p class="note">${zh ? "相邻工序尚无可排产工站，先完成工站分配。" : "Assign plannable stations to both operations first."}</p>`}
  </form>` : "";
    const stationKey = stationView ? `${stationView.assignment.operationId}::${stationView.assignment.stationId}` : "";
    const stationOptions = selectedOperation ? (scenarioState.stations ?? [])
        .filter(station => !selectedOperation.assignments.some(view => view.assignment.stationId === station.stationId))
        .filter(station => stationCompatibleWithOperation(scenarioState, selectedOperation.operation, station))
        .map(station => `<option value="${escapeHtml(station.stationId)}">${escapeHtml(formatKnownText(station.name))} / ${escapeHtml(station.stationId)}</option>`).join("") : "";
    let inspector = `<p class="route-editor-empty">${zh ? "选择工序查看配置。" : "Select an operation."}</p>`;
    if (operation && visualInspectorMode === "station" && stationView) {
        const assignment = stationView.assignment;
        inspector = `<h3>${escapeHtml(formatKnownText(stationView.station?.name ?? assignment.stationId))} / ${escapeHtml(assignment.stationId)}</h3>
      <div class="panel-actions"><button class="button secondary" type="button" id="visualBackToOperation">${zh ? "返回工序 / 添加工站" : "Back / add station"}</button>
      ${local && assignment.planningAllowed ? `<button class="button secondary" type="button" id="visualEditParameter">${visualEditingStationKey === stationKey ? (zh ? "收起参数" : "Close parameter") : (zh ? "编辑参数" : "Edit parameter")}</button>` : ""}</div>
      ${renderAssignment(stationView, local && assignment.planningAllowed && visualEditingStationKey === stationKey, local)}`;
    }
    else if (operation) {
        inspector = `<div class="panel-head"><h3>OP${operation.sequence} ${escapeHtml(formatKnownText(operation.name))}</h3>
      ${local ? `<div class="panel-actions"><button class="button secondary" type="button" data-visual-move="-1" ${ordered[0]?.operation.operationId === operation.operationId ? "disabled" : ""} title="${zh ? "前移" : "Move earlier"}">←</button><button class="button secondary" type="button" data-visual-move="1" ${ordered.at(-1)?.operation.operationId === operation.operationId ? "disabled" : ""} title="${zh ? "后移" : "Move later"}">→</button></div>` : ""}</div>
      <div class="mini-grid">${field(zh ? "工艺编号" : "Process ID", operation.processId ?? "-")}${field(zh ? "工序编号" : "Operation ID", operation.operationId)}</div>
      ${local ? `<form id="visualOperationNameForm" class="form-section"><label class="field">${zh ? "本产品工序名称" : "Operation name for this product"}<input name="name" type="text" maxlength="80" required value="${escapeHtml(operation.name)}" placeholder="${zh ? "例如：外尺寸粗车削" : "e.g. Rough turning"}"></label><div class="panel-actions"><button class="button secondary" type="submit">${zh ? "确认名称" : "Confirm name"}</button></div></form>` : ""}
      ${local ? `<form id="visualAssignForm" class="form-section"><h3>${zh ? "添加工站" : "Add station"}</h3><div class="mini-grid"><label class="field">${zh ? "已入库兼容工站" : "Registered compatible station"}<select name="stationId" required>${stationOptions || `<option value="">${zh ? "暂无兼容工站；请先到工艺库登记资源" : "No compatible station; register a resource in the library"}</option>`}</select></label><label class="field">${zh ? "角色" : "Role"}<select name="role"><option value="primary">${zh ? "主用" : "Primary"}</option><option value="parallel">${zh ? "并行" : "Parallel"}</option><option value="backup">${zh ? "备用" : "Backup"}</option></select></label></div><div class="panel-actions"><button class="button secondary" type="submit" ${stationOptions ? "" : "disabled"}>${zh ? "添加工站" : "Add station"}</button></div></form>` : ""}`;
        inspector += flowEditor;
    }
    const nodes = ordered.map((view, index) => {
        const op = view.operation;
        const process = (scenarioState.processMasters ?? []).find(item => item.processId === op.processId);
        const stations = view.assignments.map(assignment => {
            const id = assignment.assignment.stationId;
            const active = selectedOperationId === op.operationId && visualInspectorMode === "station" && (visualStationId || selectedWorkflowStationId) === id;
            const share = assignment.assignment.plannedShare;
            return `<button class="route-editor-station ${active ? "selected" : ""}" type="button" data-visual-station="${escapeHtml(id)}" data-visual-operation="${escapeHtml(op.operationId)}"><span>${escapeHtml(formatKnownText(assignment.station?.name ?? id))}</span><em>${assignment.assignment.role === "backup" ? (zh ? "备用" : "backup") : share === undefined ? "-" : `${formatNumber(Math.round(share * 100))}%`}</em><span data-report-gap-station="${escapeHtml(id)}"></span></button>`;
        }).join("");
        return `<span class="route-editor-join"><button type="button" data-visual-insert="${index}" ${local ? "" : "disabled"} title="${zh ? "在此插入工序" : "Insert operation"}" aria-label="${zh ? "在此插入工序" : "Insert operation"}">+</button></span>
      <article class="route-editor-node ${selectedOperationId === op.operationId ? "active" : ""}" data-visual-node="${escapeHtml(op.operationId)}" role="button" tabindex="0" draggable="${local}" aria-label="${zh ? "选择工序" : "Select operation"} ${escapeHtml(formatKnownText(op.name))}">
        <div class="route-editor-node-head"><span>OP${op.sequence}</span><span>${escapeHtml(processTypeLabel(process?.processType ?? op.processType))}</span></div>
        <strong>${escapeHtml(formatKnownText(op.name))}</strong><small>${escapeHtml(op.operationId)}</small>
        ${stations || `<p class="note">${zh ? "待分配工站" : "No station assigned"}</p>`}
        ${flowLabel(op.operationId) ? `<small class="route-flow-tag">${escapeHtml(flowLabel(op.operationId))}</small>` : ""}
        <span data-report-gap-operation="${escapeHtml(op.operationId)}"></span>
        ${local ? `<button class="route-editor-add-station" type="button" data-visual-add-station="${escapeHtml(op.operationId)}">+ ${zh ? "添加工站" : "Add station"}</button>` : ""}
      </article>`;
    }).join("");
    const processOptions = (scenarioState.processMasters ?? []).map(process => `<option value="${escapeHtml(process.processId)}">${escapeHtml(formatKnownText(process.name))} / ${escapeHtml(process.processId)}</option>`).join("");
    const historyOptions = routeHistory.map(entry => `<option value="${entry.id}">${escapeHtml(entry.savedAt.replace("T", " ").slice(0, 19))} · ${entry.routeIds.length} ${zh ? "条路线" : "routes"} · ${escapeHtml(entry.routeIds.at(-1) ?? "-")}</option>`).join("");
    visualRouteRoot.innerHTML = `<div class="route-editor-toolbar"><div><h2>${zh ? "工艺路线编排" : "Route editor"}</h2><p class="note">${escapeHtml(route?.routeId ?? "-")} · ${local ? (zh ? "本地验证草稿" : "Local validation draft") : (zh ? "已发布路线 · 只读" : "Released route · read only")}</p></div>
    ${toolbarActions}</div>
    ${localStoreError ? `<p class="form-error" role="alert">${escapeHtml(localStoreError)}</p>` : ""}
    ${localValidationNotice ? `<p class="form-ok" role="status">${escapeHtml(localValidationNotice)}</p>` : ""}
    ${visualRouteError ? `<p class="form-error" role="alert">${escapeHtml(visualRouteError)}</p>` : ""}
    <details class="form-section route-history" ${routeHistoryOpen ? "open" : ""}><summary>${zh ? "本机路线历史" : "Local route history"}</summary><div class="panel-actions"><select id="routeHistorySelect" aria-label="${zh ? "选择历史路线" : "Select route history"}">${historyOptions || `<option value="">${zh ? "暂无历史记录" : "No history yet"}</option>`}</select><button class="button secondary" type="button" id="refreshRouteHistory">${zh ? "刷新" : "Refresh"}</button><button class="button secondary" type="button" id="restoreRouteHistory" ${historyOptions ? "" : "disabled"}>${zh ? "恢复所选记录" : "Restore selected record"}</button></div></details>
    ${invalidFlowNotice}
    <div class="route-editor-layout"><div class="route-editor-flow"><div class="route-editor-track">${nodes}<span class="route-editor-join"><button type="button" data-visual-insert="${ordered.length}" ${local ? "" : "disabled"} title="${zh ? "在末尾添加工序" : "Append operation"}" aria-label="${zh ? "在末尾添加工序" : "Append operation"}">+</button></span></div></div><div class="route-editor-inspector">${inspector}</div></div>
    <dialog class="route-editor-dialog" id="visualProcessDialog"><h3>${zh ? "选择工艺加入路线" : "Choose a process"}</h3><label>${zh ? "工艺" : "Process"}<select id="visualProcessId">${processOptions}</select></label><div class="panel-actions"><button class="button secondary" type="button" id="visualCancelInsert">${zh ? "取消" : "Cancel"}</button><button class="button" type="button" id="visualConfirmInsert" ${processOptions ? "" : "disabled"}>${zh ? "加入路线" : "Add to route"}</button></div></dialog>`;
    bindVisualRouteToolbar(routingConfig, selectedOperation);
    visualRouteRoot.querySelector(".route-history")?.addEventListener("toggle", event => {
        routeHistoryOpen = event.currentTarget.open;
    });
    visualRouteRoot.querySelector("#refreshRouteHistory")?.addEventListener("click", () => { void refreshRouteHistory(); });
    visualRouteRoot.querySelector("#restoreRouteHistory")?.addEventListener("click", async () => {
        const id = Number(visualRouteRoot.querySelector("#routeHistorySelect")?.value);
        if (!Number.isSafeInteger(id) || id <= 0)
            return;
        if (!window.confirm(zh
            ? "恢复这份历史记录会替换当前本地工艺与路线。当前版本仍保留在历史中。继续吗？"
            : "Restore this snapshot and replace the current local process and route data? The current version remains in history."))
            return;
        try {
            const parsed = parseLocalValidationStore(JSON.parse(await readRouteHistory(id)));
            if (!parsed.ok)
                throw new Error("Invalid route history snapshot");
            scenarioState = applyLocalValidation(cloneScenario(), parsed.store);
            persistLocalValidation();
            localStoreError = "";
            selectedOperationId = "";
            selectedWorkflowStationId = "";
            syncRouteSelector(selectedProductId, parsed.store.routes[0]?.routeId);
            render(selectedProductId);
            void refreshRouteHistory();
        }
        catch (error) {
            localStoreError = zh ? "历史记录恢复失败，当前数据未更改。" : "Could not restore route history; current data was not changed.";
            render(selectedProductId);
        }
    });
    bindInvalidFlowRemoval(route);
    visualRouteRoot.querySelectorAll("[data-visual-insert]").forEach(button => button.addEventListener("click", () => {
        if (!local)
            return;
        visualInsertIndex = Number(button.dataset.visualInsert);
        visualRouteRoot.querySelector("#visualProcessDialog")?.showModal();
    }));
    visualRouteRoot.querySelector("#visualCancelInsert")?.addEventListener("click", () => visualRouteRoot.querySelector("#visualProcessDialog")?.close());
    visualRouteRoot.querySelector("#visualConfirmInsert")?.addEventListener("click", () => {
        const processId = visualRouteRoot.querySelector("#visualProcessId")?.value ?? "";
        const result = insertLocalOperationAt(scenarioState, { routeId: route?.routeId ?? "", processId, index: visualInsertIndex });
        visualRouteRoot.querySelector("#visualProcessDialog")?.close();
        if ("operation" in result)
            visualInspectorMode = "operation";
        applyVisualRouteChange(result, "operation" in result ? { operationId: result.operation.operationId } : {});
    });
    visualRouteRoot.querySelectorAll("[data-visual-station]").forEach(button => button.addEventListener("click", event => {
        event.stopPropagation();
        selectedOperationId = button.dataset.visualOperation ?? "";
        visualStationId = button.dataset.visualStation ?? "";
        visualInspectorMode = "station";
        selectedWorkflowStationId = visualStationId;
        render(selectedProductId);
    }));
    visualRouteRoot.querySelectorAll("[data-visual-add-station]").forEach(button => button.addEventListener("click", event => {
        event.stopPropagation();
        selectedOperationId = button.dataset.visualAddStation ?? "";
        visualInspectorMode = "operation";
        render(selectedProductId);
        visualRouteRoot.querySelector("#visualAssignForm select[name=stationId]")?.focus();
    }));
    visualRouteRoot.querySelectorAll("[data-visual-node]").forEach(node => {
        const select = () => {
            selectedOperationId = node.dataset.visualNode ?? "";
            visualInspectorMode = "operation";
            render(selectedProductId);
        };
        node.addEventListener("click", event => { if (!event.target.closest("[data-visual-station]"))
            select(); });
        node.addEventListener("keydown", event => { if (event.target === node && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            select();
        } });
        if (!local)
            return;
        node.addEventListener("dragstart", event => { event.dataTransfer?.setData("text/plain", node.dataset.visualNode ?? ""); node.classList.add("dragging"); });
        node.addEventListener("dragend", () => node.classList.remove("dragging"));
        node.addEventListener("dragover", event => { event.preventDefault(); node.classList.add("drop-target"); });
        node.addEventListener("dragleave", () => node.classList.remove("drop-target"));
        node.addEventListener("drop", event => {
            event.preventDefault();
            node.classList.remove("drop-target");
            const sourceId = event.dataTransfer?.getData("text/plain") ?? "";
            moveVisualOperation(route?.routeId ?? "", sourceId, ordered.findIndex(item => item.operation.operationId === node.dataset.visualNode));
        });
    });
    visualRouteRoot.querySelector("#visualBackToOperation")?.addEventListener("click", () => { visualInspectorMode = "operation"; render(selectedProductId); });
    visualRouteRoot.querySelector("#visualEditParameter")?.addEventListener("click", () => { visualEditingStationKey = visualEditingStationKey === stationKey ? "" : stationKey; render(selectedProductId); });
    visualRouteRoot.querySelector("#visualOperationNameForm")?.addEventListener("submit", event => {
        event.preventDefault();
        if (!route || !operation)
            return;
        const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
        const sameName = route.operations.some(item => item.operationId !== operation.operationId && item.name.trim() === name);
        if (sameName && !window.confirm(zh ? "当前路线已有同名工序，仍要使用这个名称吗？" : "Another operation on this route has the same name. Keep it?"))
            return;
        applyVisualRouteChange(renameLocalOperation(scenarioState, { routeId: route.routeId ?? "", operationId: operation.operationId, name }), { operationId: operation.operationId });
    });
    visualRouteRoot.querySelector("[data-local-baseline-form]")?.addEventListener("submit", event => { event.preventDefault(); applyLocalBaseline(event.currentTarget); });
    visualRouteRoot.querySelector("#visualShareForm")?.addEventListener("submit", event => {
        event.preventDefault();
        if (!local || !stationView || stationView.assignment.role === "backup")
            return;
        const input = event.currentTarget.elements.namedItem("share");
        const value = input.value.trim();
        const share = Number(value);
        if (value !== "" && (!Number.isFinite(share) || share <= 0 || share > 100)) {
            visualRouteError = zh ? "固定占用份额必须大于 0%，且不超过 100%。" : "Fixed share must be above 0% and at most 100%.";
            render(selectedProductId);
            return;
        }
        if (value === "") {
            stationView.assignment.allocationMode = "forecastCalculated";
            delete stationView.assignment.plannedShare;
        }
        else {
            stationView.assignment.allocationMode = "fixedShare";
            stationView.assignment.plannedShare = share / 100;
        }
        persistLocalValidation();
        visualRouteError = "";
        render(selectedProductId);
    });
    visualRouteRoot.querySelector("#visualFlowForm")?.addEventListener("submit", event => {
        event.preventDefault();
        if (!route || !previousView || !operation)
            return;
        const values = new FormData(event.currentTarget);
        const allowedPairs = values.getAll("pair").map(value => {
            const [fromIndex, toIndex] = String(value).split(":").map(Number);
            return { fromStationId: fromStations[fromIndex]?.assignment.stationId ?? "",
                toStationId: toStations[toIndex]?.assignment.stationId ?? "" };
        });
        applyVisualRouteChange(setLocalStationFlowPolicy(scenarioState, {
            routeId: route.routeId ?? "", fromOperationId: previousView.operation.operationId,
            toOperationId: operation.operationId, allowedPairs,
        }));
    });
    visualRouteRoot.querySelector("#visualClearFlow")?.addEventListener("click", () => {
        if (!route || !previousView || !operation)
            return;
        applyVisualRouteChange(setLocalStationFlowPolicy(scenarioState, {
            routeId: route.routeId ?? "", fromOperationId: previousView.operation.operationId,
            toOperationId: operation.operationId,
        }));
    });
    visualRouteRoot.querySelector("#visualAssignForm")?.addEventListener("submit", event => {
        event.preventDefault();
        const values = new FormData(event.currentTarget);
        const result = assignLocalStation(scenarioState, {
            routeId: route?.routeId ?? "", operationId: operation?.operationId ?? "",
            stationId: String(values.get("stationId") ?? ""), role: String(values.get("role") ?? "primary"),
        });
        applyVisualRouteChange(result, "assignment" in result ? { stationId: result.assignment.stationId } : {});
    });
    visualRouteRoot.querySelectorAll("[data-visual-move]").forEach(button => button.addEventListener("click", () => {
        if (!route || !operation)
            return;
        const index = ordered.findIndex(item => item.operation.operationId === operation.operationId);
        moveVisualOperation(route.routeId ?? "", operation.operationId, index + Number(button.dataset.visualMove));
    }));
    paintRouteReportGaps(currentRouteReportGaps(routingConfig));
}
function bindInvalidFlowRemoval(route) {
    if (!route || !isLocalDraftRoute(route))
        return;
    visualRouteRoot.querySelectorAll("[data-remove-stale-flow]").forEach(button => button.addEventListener("click", () => {
        applyVisualRouteChange(setLocalStationFlowPolicy(scenarioState, {
            routeId: route.routeId ?? "", fromOperationId: button.dataset.removeStaleFlow ?? "",
            toOperationId: button.dataset.toOperation ?? "",
        }));
    }));
}
function renderRouting(operations) {
    routingRoot.innerHTML = operations.length
        ? renderOperationTable(operations)
        : emptyState(t("noRoutingOperations"));
}
function renderOperationTable(operations) {
    const rows = operations.map(operationView => {
        const operation = operationView.operation;
        return `
      <tr>
        <td>${formatNumber(operation.sequence)}</td>
        <td>${escapeHtml(operation.operationId)}</td>
        <td>${escapeHtml(formatKnownText(operation.name))}</td>
        <td>${escapeHtml(formatKnownText(operation.processType))}</td>
        <td>${escapeHtml(operation.digitalTwinNodeId ?? "-")}</td>
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
function renderOperationDetail(operationView, routingConfig) {
    if (!operationView) {
        operationDetailRoot.innerHTML = emptyState(t("selectOperationEmpty"));
        return;
    }
    const operation = operationView.operation;
    const route = routingConfig.route;
    const requirement = route ? resolveOperationOutputRequirement(scenarioState, route, operation, todayDateValue()) : undefined;
    const quantityKey = `${route?.routeId ?? ""}::${operation.operationId}`;
    const quantityLabel = locale === "zh" ? "每件成品所需本工序产出" : "Operation output units per finished product";
    const sourceLabel = requirement?.source === "stageBom"
        ? `${locale === "zh" ? "阶段 BOM" : "Stage BOM"} · ${requirement.sourceRef ?? "-"}${requirement.version ? ` · ${requirement.version}` : ""}`
        : requirement?.source === "localValidation"
            ? `${locale === "zh" ? "本地验证输入" : "Local validation"}${requirement.version ? ` · ${requirement.version}` : ""}` : "-";
    const stageBom = scenarioState.stageBoms?.find(item => item.stageBomId === operation.outputStageBomId);
    const editableStageBom = !!route && !!stageBom && stageBom.productId === route.productId
        && stageBom.routeId === route.routeId && stageBom.operationId === operation.operationId
        && stageBom.requiredOutputUnitsPerFinishedProduct === undefined;
    const quantityEditable = isMockEditing && !!route && ((isLocalDraftRoute(route) && (!stageBom || editableStageBom))
        || editableStageBom);
    const focusedAssignment = operationView.assignments.find(view => view.assignment.stationId === visualStationId)
        ?? operationView.assignments.find(view => view.assignment.stationId === selectedWorkflowStationId);
    const visibleAssignments = visualInspectorMode === "station" && focusedAssignment
        ? [focusedAssignment] : operationView.assignments;
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
      ${field(quantityLabel, requirement?.unitsPerFinishedProduct === undefined ? "-" : `${formatNumber(requirement.unitsPerFinishedProduct)} ${locale === "zh" ? "件" : "units"}`)}
      ${field(locale === "zh" ? "用量来源" : "Quantity source", sourceLabel)}
    </div>
    ${quantityEditable ? `<form data-operation-quantity-form data-route-id="${escapeHtml(route.routeId ?? "")}" data-operation-id="${escapeHtml(operation.operationId)}" class="action-bar" style="margin-top:14px;">
      <label class="field" style="max-width:260px;">${quantityLabel}<input name="units" type="number" min="1" step="1" required value="${requirement?.unitsPerFinishedProduct ?? ""}" /></label>
      <button class="button secondary" type="submit">${locale === "zh" ? "确认本地用量" : "Confirm local quantity"}</button>
    </form>` : ""}
    ${localOperationQuantityErrors.has(quantityKey) ? `<p class="form-error" role="alert">${escapeHtml(localOperationQuantityErrors.get(quantityKey) ?? "")}</p>` : ""}
    ${isRouteEditorOpen ? "" : `<div class="assignment-grid">${visibleAssignments.map(view => renderAssignment(view)).join("")}</div>`}
    ${operationView.messages.length ? `<ul class="message-list">${operationView.messages.map(message => `<li>${escapeHtml(formatKnownText(message))}</li>`).join("")}</ul>` : ""}
  `;
    operationDetailRoot.querySelectorAll("[data-local-baseline-form]").forEach(form => {
        form.addEventListener("submit", event => {
            event.preventDefault();
            applyLocalBaseline(form);
        });
    });
    operationDetailRoot.querySelector("[data-operation-quantity-form]")?.addEventListener("submit", event => {
        event.preventDefault();
        applyLocalOperationQuantity(event.currentTarget);
    });
}
function operationQuantityStorageKey(routeId, operationId) {
    return `${localOperationQuantityStoragePrefix}${encodeURIComponent(routeId)}:${encodeURIComponent(operationId)}`;
}
function applyLocalOperationQuantity(form) {
    const routeId = form.dataset.routeId ?? "";
    const operationId = form.dataset.operationId ?? "";
    const key = `${routeId}::${operationId}`;
    const route = scenarioState.routes.find(item => item.routeId === routeId);
    const operation = route?.operations.find(item => item.operationId === operationId);
    const stageBom = scenarioState.stageBoms?.find(item => item.stageBomId === operation?.outputStageBomId);
    const units = Number(new FormData(form).get("units"));
    if (!isMockEditing || !route || !operation
        || (stageBom && (stageBom.productId !== route.productId || stageBom.routeId !== route.routeId
            || stageBom.operationId !== operationId || stageBom.requiredOutputUnitsPerFinishedProduct !== undefined))
        || (!stageBom && !isLocalDraftRoute(route))
        || !Number.isSafeInteger(units) || units <= 0) {
        localOperationQuantityErrors.set(key, locale === "zh" ? "工序用量必须是正整数，且不能覆盖上游阶段 BOM。" : "Quantity must be a positive integer and cannot override Stage BOM.");
        render(selectedProductId);
        return;
    }
    try {
        const version = `local-${Date.now()}`;
        saveLocalState(operationQuantityStorageKey(routeId, operationId), JSON.stringify({ routeId, operationId, units, version }));
        operation.requiredOutputUnitsPerFinishedProduct = units;
        operation.quantitySourceVersion = version;
        localOperationQuantityErrors.delete(key);
    }
    catch {
        localOperationQuantityErrors.set(key, locale === "zh" ? "无法保存本地用量，请检查浏览器站点存储。" : "Cannot save local quantity; check browser storage.");
    }
    render(selectedProductId);
}
function restoreLocalOperationQuantities() {
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(localOperationQuantityStoragePrefix))
                continue;
            try {
                const saved = JSON.parse(localStorage.getItem(key) ?? "null");
                const route = scenarioState.routes.find(item => item.routeId === saved.routeId);
                const operation = route?.operations.find(item => item.operationId === saved.operationId);
                const stageBom = scenarioState.stageBoms?.find(item => item.stageBomId === operation?.outputStageBomId);
                if (!operation || stageBom?.requiredOutputUnitsPerFinishedProduct !== undefined
                    || typeof saved.units !== "number" || !Number.isSafeInteger(saved.units) || saved.units <= 0 || !saved.version?.startsWith("local-"))
                    continue;
                operation.requiredOutputUnitsPerFinishedProduct = saved.units;
                operation.quantitySourceVersion = saved.version;
            }
            catch { /* Ignore a damaged local entry. */ }
        }
    }
    catch { /* Browser storage may be disabled. */ }
}
function clearLocalOperationQuantities(routeIds) {
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(localOperationQuantityStoragePrefix)
                && (!routeIds || routeIds.some(routeId => key.startsWith(`${localOperationQuantityStoragePrefix}${encodeURIComponent(routeId)}:`))))
                keys.push(key);
        }
        keys.forEach(removeLocalState);
    }
    catch { /* Browser storage may be disabled. */ }
}
function applyLocalBaseline(form) {
    const operationId = form.dataset.operationId ?? "";
    const stationId = form.dataset.stationId ?? "";
    const productId = form.dataset.productId ?? "";
    const key = `${operationId}::${stationId}`;
    const contextKey = `${productId}::${key}`;
    const versions = scenarioState.operationStationParameters ?? [];
    const base = selectEffectiveParameter(versions, operationId, stationId);
    const hasObservations = hasRnrObservations(productId, operationId, stationId);
    const hasPublishedVersion = versions.some(item => item.operationId === operationId && item.stationId === stationId && item.parameterSource === "runRate");
    const visualScopedEdit = !!localRouteId() && visualEditingStationKey === key
        && scenarioState.operationStationAssignments?.some(item => item.productId === productId
            && item.operationId === operationId && item.stationId === stationId && item.planningAllowed);
    if ((!isMockEditing && !visualScopedEdit) || !scenarioState.operationStationAssignments?.some(item => item.productId === productId && item.operationId === operationId && item.stationId === stationId)) {
        localBaselineErrors.set(key, locale === "zh" ? "工序与工站绑定无效。" : "Invalid operation-station assignment.");
        render(selectedProductId);
        return;
    }
    const fields = new FormData(form);
    const standardCycleSec = Number(fields.get("standardCycleSec"));
    const piecesPerCycle = Number(fields.get("piecesPerCycle"));
    const performanceRate = Number(fields.get("performanceRatePercent")) / 100;
    const qualityRate = Number(fields.get("qualityRatePercent")) / 100;
    try {
        const next = createLocalBaselineParameter({
            ...(base ? { base } : {}), operationId, stationId,
            standardCycleSec, piecesPerCycle, performanceRate, qualityRate,
            parameterId: `local-baseline-${Date.now()}-${++localBaselineVersionCounter}`,
            effectiveFrom: todayDateValue(),
        });
        const ctChanged = !base || base.standardCycleSec !== next.standardCycleSec;
        if ((ctChanged || hasObservations || hasPublishedVersion) && !globalThis.confirm(locale === "zh"
            ? `将新建本地预设版本：CT ${formatNumber(next.standardCycleSec)} 秒、P ${percent(next.performanceRate)}、Q ${percent(next.qualityRate)}。请确认 P 已按新 CT 复核；已有 R&R 记录和已发布版本不改写，当前对比与建议将按新基线重算。继续吗？`
            : `Create a local planned version: CT ${formatNumber(next.standardCycleSec)}s, P ${percent(next.performanceRate)}, Q ${percent(next.qualityRate)}? Confirm P was reviewed against the new CT. Existing records stay unchanged; current comparisons will recalculate.`))
            return;
        saveLocalState(localBaselineStorageKey(productId, operationId, stationId), JSON.stringify(next));
        scenarioState.operationStationParameters ??= [];
        scenarioState.operationStationParameters.push(next);
        if (!hasObservations && contextKey === rnrContextKey) {
            rnrSegmentDraft.standardCycleSec = next.standardCycleSec;
            rnrSegmentDraft.piecesPerCycle = next.piecesPerCycle;
        }
        localBaselineErrors.delete(key);
    }
    catch (error) {
        localBaselineErrors.set(key, error instanceof Error ? error.message : String(error));
    }
    render(selectedProductId);
}
function localBaselineStorageKey(productId, operationId, stationId) {
    return `${localBaselineStoragePrefix}${encodeURIComponent(productId)}:${encodeURIComponent(operationId)}:${encodeURIComponent(stationId)}`;
}
function restoreLocalBaselines() {
    try {
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(localBaselineStoragePrefix))
                continue;
            try {
                const [productId, operationId, stationId] = key.slice(localBaselineStoragePrefix.length)
                    .split(":").map(decodeURIComponent);
                if (!productId || !operationId || !stationId
                    || !scenarioState.operationStationAssignments?.some(item => item.productId === productId && item.operationId === operationId && item.stationId === stationId))
                    continue;
                const saved = JSON.parse(localStorage.getItem(key) ?? "null");
                if (!saved?.parameterId?.startsWith("local-baseline-") || saved.parameterSource !== "manual")
                    continue;
                const base = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operationId, stationId);
                const restored = createLocalBaselineParameter({
                    ...(base ? { base } : {}), operationId, stationId,
                    parameterId: saved.parameterId, standardCycleSec: saved.standardCycleSec,
                    piecesPerCycle: saved.piecesPerCycle, performanceRate: saved.performanceRate,
                    qualityRate: saved.qualityRate, effectiveFrom: saved.effectiveFrom ?? "",
                });
                scenarioState.operationStationParameters ??= [];
                scenarioState.operationStationParameters.push(restored);
            }
            catch { /* Ignore a damaged local baseline without replacing sample parameters. */ }
        }
    }
    catch { /* Browser storage may be disabled. */ }
}
function clearLocalBaselines() {
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(localBaselineStoragePrefix))
                keys.push(key);
        }
        keys.forEach(removeLocalState);
    }
    catch { /* Browser storage may be disabled. */ }
}
function cycleDraftHasSamples(cycle) {
    if (!cycle || !Array.isArray(cycle.samples))
        return false;
    return cycle.samples.length > 0;
}
function workflowStationViews(operation) {
    return operation?.assignments.filter(item => item.planningStatus === "available" || item.planningStatus === "missingParameter") ?? [];
}
function hasRnrObservations(productId, operationId, stationId) {
    const contextKey = `${actualScopeKey(productId, operationId, stationId)}`;
    const cycleDraft = contextKey === rnrContextKey ? cycleCheckDraft : rnrDrafts.get(contextKey)?.cycle;
    if ((rnrActualEventsByContext.get(contextKey)?.length ?? 0) > 0 || cycleDraftHasSamples(cycleDraft))
        return true;
    try {
        const raw = localStorage.getItem(evidenceStorageKeyForScope({ productId, operationId, stationId }));
        if (!raw)
            return false;
        const saved = JSON.parse(raw);
        return (saved.snapshot?.actualEvents?.length ?? 0) > 0 || cycleDraftHasSamples(migrateLegacyCycleDraft(saved.cycleDraft).draft);
    }
    catch {
        return true;
    }
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
function renderAssignment(view, edit = isMockEditing, editShare = false) {
    const assignment = view.assignment;
    const parameter = view.parameter;
    const baselineKey = `${assignment.operationId}::${assignment.stationId}`;
    const hasPublishedVersion = (scenarioState.operationStationParameters ?? []).some(item => item.operationId === assignment.operationId && item.stationId === assignment.stationId && item.parameterSource === "runRate")
        || hasRnrObservations(assignment.productId, assignment.operationId, assignment.stationId);
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
        ${field(locale === "zh" ? "参数来源" : "Parameter source", parameter?.parameterId.startsWith("local-baseline-") ? (locale === "zh" ? "本地验证输入" : "Local validation input") : parameter?.parameterSource ?? t("missing"))}
        ${field(t("blockerReason"), assignment.planningBlockerReason ? formatKnownText(assignment.planningBlockerReason) : "-")}
      </div>
      ${edit ? `<form data-local-baseline-form data-product-id="${escapeHtml(assignment.productId)}" data-operation-id="${escapeHtml(assignment.operationId)}" data-station-id="${escapeHtml(assignment.stationId)}">
            <p class="note">${hasPublishedVersion
        ? (locale === "zh" ? "将新建预设版本；已发布参数及现场记录保留，提交前会再次确认。" : "Creates a new planned version; published parameters and field records remain. Confirmation is required.")
        : (locale === "zh" ? "本地验证基线；新建时 P/Q 默认为 100%。仅保存在本机，不写入上游主数据。" : "Local validation baseline; new P/Q values default to 100%. Stored in this browser, not upstream master data.")}</p>
            <div class="field-grid local-baseline-grid">
              <div class="field"><label>${t("stdCt")} (s)</label><input name="standardCycleSec" type="number" min="0.0001" step="any" required value="${parameter?.standardCycleSec ?? ""}" /></div>
              <div class="field"><label>${t("piecesPerCycle")}</label><input name="piecesPerCycle" type="number" min="1" step="1" required value="${parameter?.piecesPerCycle ?? 1}" /></div>
              <div class="field"><label>P (%)</label><input name="performanceRatePercent" type="number" min="0.1" max="100" step="any" required value="${(parameter?.performanceRate ?? 1) * 100}" /></div>
              <div class="field"><label>Q (%)</label><input name="qualityRatePercent" type="number" min="0.1" max="100" step="any" required value="${(parameter?.qualityRate ?? 1) * 100}" /></div>
            </div>
            ${localBaselineErrors.has(baselineKey) ? `<p class="form-error" role="alert">${escapeHtml(localBaselineErrors.get(baselineKey) ?? "")}</p>` : ""}
            <button class="button secondary" type="submit">${locale === "zh" ? "确认本地基线" : "Confirm local baseline"}</button>
          </form>
          ${editShare && assignment.role !== "backup" ? `<form id="visualShareForm" class="local-share-form">
            <label class="field">${locale === "zh" ? "固定占用份额 (%)" : "Fixed share (%)"}<input name="share" type="number" min="0.1" max="100" step="0.1" value="${assignment.plannedShare === undefined ? "" : escapeHtml(String(Math.round(assignment.plannedShare * 1000) / 10))}" placeholder="-" title="${locale === "zh" ? "留空表示不设固定份额，按本工站周账计算" : "Leave blank to use the station's full weekly ledger without a fixed share"}"></label>
            <button class="button secondary" type="submit">${locale === "zh" ? "确认份额" : "Confirm share"}</button>
          </form>` : ""}` : ""}
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
        document.querySelector('[data-stage-next="reality"]').disabled = true;
        plannedSaRoot.innerHTML = `${currentStationHead(t("plannedSaEyebrow"), t("plannedSaTitle"))}${emptyState(t("stationRequired"))}`;
        return;
    }
    const productId = routingConfig.product?.productId ?? selectedProductId;
    const events = getPlannedSaEvents(stationId, productId);
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const frozenWindow = frozenStandardWindows.get(`${planScopeKey(productId, stationId)}`);
    const frozenCurrent = frozenWindow ? isFrozenStandardWindowCurrent(frozenWindow, events, dayConfig) : false;
    document.querySelector('[data-stage-next="reality"]').disabled = events.length === 0;
    alignPlannedBlockDraftAfterExistingEvents(events, stationId, horizonMinutes);
    const plannedWindow = derivePlannedSaWindow(events);
    const summary = summarizeStandardSaDay(events, dayConfig);
    const validationIssues = validatePlannedSaEvents(events, plannedWindow);
    const dayIssues = validateStandardSaDay(events, dayConfig);
    const gaps = findStandardSaDayGaps(events, dayConfig).map(gap => ({ ...gap, stationId }));
    const dayEndMinute = dayConfig.startMinute + dayConfig.dayCount * MINUTE_PER_DAY;
    plannedSaRoot.innerHTML = `
    ${currentStationHead(t("plannedSaEyebrow"), t("plannedSaTitle"), `<span class="section-label">${t("bestCaseSaInput")}</span><button class="button secondary" type="button" id="generatePlannedSample">${locale === "zh" ? "重置为测试样例" : "Reset to test sample"}</button><button class="button" type="button" id="fillPlannedGaps">${t("fillGaps")}</button>`)}
    <div class="field-grid shift-config-grid">
      <div class="field"><label for="standardDayStartDate">${locale === "zh" ? "生产日日期" : "Production-day date"}</label><input id="standardDayStartDate" type="date" value="${escapeHtml(minuteToDateValue(dayConfig.startMinute))}" /></div>
      <div class="field"><label>${locale === "zh" ? "白班开班时间" : "First-shift start"}</label><div class="time-pair"><select id="standardDayStartHour" aria-label="${locale === "zh" ? "白班开班时" : "First-shift hour"}">${numberOptions(0, 23, Math.floor(minuteOfDay(dayConfig.startMinute) / 60))}</select><select id="standardDayStartMinute" aria-label="${locale === "zh" ? "白班开班分" : "First-shift minute"}">${numberOptions(0, 59, minuteOfDay(dayConfig.startMinute) % 60)}</select></div></div>
      <div class="field"><label for="standardShiftMinutes">${locale === "zh" ? "班次时长" : "Shift length"}</label><select id="standardShiftMinutes"><option value="720" ${dayConfig.shiftMinutes === 720 ? "selected" : ""}>12H / 720 min</option><option value="480" ${dayConfig.shiftMinutes === 480 ? "selected" : ""}>8H / 480 min</option></select></div>
      <div class="field"><label for="standardShiftsPerDay">${locale === "zh" ? "每日班数" : "Shifts per day"}</label><select id="standardShiftsPerDay">${Array.from({ length: MINUTE_PER_DAY / dayConfig.shiftMinutes }, (_, i) => `<option value="${i + 1}" ${dayConfig.shiftsPerDay === i + 1 ? "selected" : ""}>${i + 1}</option>`).join("")}</select></div>
      <div class="field"><label for="standardDayCount">${locale === "zh" ? "生产日数" : "Production days"}</label><select id="standardDayCount"><option value="1" ${dayConfig.dayCount === 1 ? "selected" : ""}>1</option><option value="2" ${dayConfig.dayCount === 2 ? "selected" : ""}>2</option></select></div>
    </div>
    <div class="field-grid">
      ${field(t("windowType"), `${t("maxFortyEightHours")} / ${t("minOneHourGrain")}`)}
      ${field(t("station"), stationId)}
      ${field(t("horizonMinutes"), formatNumber(summary.horizonMinutes))}
      ${field(t("scheduledMinutes"), formatNumber(summary.scheduledMinutes))}
      ${field(locale === "zh" ? "非排班分钟" : "Off-shift minutes", formatNumber(summary.nonScheduledMinutes))}
      ${field(t("windowStart"), formatOptionalMinutePoint(dayConfig.startMinute))}
      ${field(t("windowEnd"), formatOptionalMinutePoint(dayEndMinute))}
    </div>
    ${dayIssues.length ? `<p class="form-error">${locale === "zh" ? "标准日尚未完整：" : "Standard day incomplete: "}${escapeHtml(formatStandardSaDayIssues(dayIssues))}</p>` : ""}
    ${renderPlannedBlockForm()}
    ${renderPlannedTimeline(stationId, events, { startMinute: dayConfig.startMinute, endMinute: dayEndMinute, durationMinutes: summary.horizonMinutes }, dayConfig)}
    <section class="metrics" aria-label="${t("plannedSaTitle")}" style="margin-top:14px;">
      ${metricCard(t("scheduledMin"), formatNumber(summary.scheduledMinutes), locale === "zh" ? "仅已开班时段" : "Scheduled shifts only", "neutral")}
      ${metricCard(t("plannedOperationMin"), formatNumber(summary.productionMinutes), t("productionNotSaLoss"), "good")}
      ${metricCard(t("setupChangeoverMin"), formatNumber(summary.setupMinutes), t("plannedLossKinds"), summary.setupMinutes ? "warn" : "good")}
      ${metricCard(t("breakMin"), formatNumber(summary.breakMinutes), t("plannedLossKinds"), summary.breakMinutes ? "warn" : "good")}
      ${metricCard(t("plannedStopMin"), formatNumber(summary.plannedStopMinutes), t("plannedLossKinds"), summary.plannedStopMinutes ? "warn" : "good")}
      ${metricCard(t("unscheduledMin"), formatNumber(summary.unscheduledMinutes), t("notPlannedNotOpenCapacity"), summary.unscheduledMinutes ? "warn" : "good")}
      ${metricCard(t("bestCaseAvailableMin"), formatNumber(summary.bestCaseAvailableMinutes), t("productionMinutesDetail"), "good")}
      ${metricCard(t("bestCaseSaWithBreaks"), dayIssues.length ? "-" : percent(summary.bestCaseSaWithBreaks), locale === "zh" ? "生产分钟 / 生产日分钟（含非排班）" : "Production / full production day", "good")}
      ${metricCard(t("bestCaseSaWithoutBreaks"), dayIssues.length ? "-" : percent(summary.bestCaseSaWithoutBreaks), locale === "zh" ? "生产分钟 /（排班分钟－计划休息）" : "Production / (scheduled minus planned breaks)", "good")}
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
    <div class="action-bar" style="margin-top:14px;">
      <span>${frozenWindow
        ? frozenCurrent
            ? (locale === "zh" ? `本地源窗口 v${frozenWindow.version} · 已冻结` : `Local source window v${frozenWindow.version} · frozen`)
            : (locale === "zh" ? `本地源窗口 v${frozenWindow.version} · 已过期，请重新冻结` : `Local source window v${frozenWindow.version} · stale; freeze again`)
        : (locale === "zh" ? "尚未冻结投影源窗口" : "No frozen projection source window")}</span>
      <button class="button secondary" type="button" id="freezeStandardWindow">${locale === "zh" ? "冻结源窗口" : "Freeze source window"}</button>
    </div>
    ${standardWindowFreezeError ? `<p class="form-error">${escapeHtml(standardWindowFreezeError)}</p>` : ""}
    ${renderCopyProjectionPanel(productId, stationId, selectedOperation?.operation.operationId ?? "", frozenWindow, frozenCurrent)}
  `;
    bindPlannedSaEditing(stationId, productId, horizonMinutes);
}
function getPlannedSaEvents(stationId, productId) {
    const contextKey = `${planScopeKey(productId, stationId)}`;
    if (plannedSaContextKey !== contextKey) {
        if (plannedSaContextKey)
            plannedSaContexts.set(plannedSaContextKey, { events: plannedSaEvents, areDefault: plannedSaEventsAreDefault });
        const saved = plannedSaContexts.get(contextKey);
        plannedSaContextKey = contextKey;
        plannedSaEvents = saved?.events ?? buildDefaultPlannedActivityEvents(stationId, productId, getStandardSaDayConfig(productId, stationId));
        plannedSaEventsAreDefault = saved?.areDefault ?? true;
        standardWindowFreezeError = "";
        resetPlannedBlockDraft(stationId, PLANNED_SA_HORIZON_MINUTES);
    }
    return plannedSaEvents;
}
function getStandardSaDayConfig(productId, stationId) {
    const key = `${planScopeKey(productId, stationId)}`;
    let config = standardSaDayConfigs.get(key);
    if (!config) {
        config = { startMinute: 510, dayCount: 1, shiftMinutes: 720, shiftsPerDay: 1 };
        standardSaDayConfigs.set(key, config);
    }
    return config;
}
function formatStandardSaDayIssues(issues) {
    const labels = locale === "zh"
        ? { invalid_config: "班制设置无效", invalid_boundary: "时间段起止无效", overlap: "时间段重叠", outside_shift: "事件超出已开班时段", gap: "已开班时段存在未标记空档" }
        : { invalid_config: "Invalid shift setup", invalid_boundary: "Invalid interval", overlap: "Overlapping intervals", outside_shift: "Event outside scheduled shifts", gap: "Unmarked gap in scheduled shift" };
    return issues.map(issue => labels[issue]).join(locale === "zh" ? "、" : ", ");
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
let pendingStandardSaDayConfig;
function standardSaDayConfigFromControls(root, fallback) {
    const date = root.querySelector("#standardDayStartDate")?.value ?? "";
    const hour = root.querySelector("#standardDayStartHour")?.value;
    const minute = root.querySelector("#standardDayStartMinute")?.value;
    const shiftRaw = Number(root.querySelector("#standardShiftMinutes")?.value);
    const shiftsRaw = Number(root.querySelector("#standardShiftsPerDay")?.value);
    const dayRaw = Number(root.querySelector("#standardDayCount")?.value);
    const shiftMinutes = shiftRaw === 480 || shiftRaw === 720 ? shiftRaw : fallback.shiftMinutes;
    const maxShifts = MINUTE_PER_DAY / shiftMinutes;
    const shiftsPerDay = Number.isInteger(shiftsRaw) && shiftsRaw >= 1 && shiftsRaw <= maxShifts
        ? shiftsRaw
        : Math.min(fallback.shiftsPerDay, maxShifts);
    const dayCount = dayRaw === 1 || dayRaw === 2 ? dayRaw : fallback.dayCount;
    const fallbackClock = minuteOfDay(fallback.startMinute);
    const clock = `${String(Number(hour ?? Math.floor(fallbackClock / 60))).padStart(2, "0")}:${String(Number(minute ?? (fallbackClock % 60))).padStart(2, "0")}`;
    const startMinute = /^\d{4}-\d{2}-\d{2}$/.test(date) ? combineDateTimeMinute(date, clock) : fallback.startMinute;
    return { startMinute, shiftMinutes, shiftsPerDay, dayCount };
}
function bindPlannedSaEditing(stationId, productId, horizonMinutes) {
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const updateDayConfig = (next) => {
        const delta = next.startMinute - dayConfig.startMinute;
        if (plannedSaEventsAreDefault) {
            plannedSaEvents = buildDefaultPlannedActivityEvents(stationId, productId, next);
            resetPlannedBlockDraft(stationId, horizonMinutes);
        }
        else {
            if (delta) {
                plannedSaEvents = plannedSaEvents.map(event => ({
                    ...event, startMinute: event.startMinute + delta, endMinute: event.endMinute + delta,
                }));
                plannedBlockDraft.startMinute += delta;
                plannedBlockDraft.endMinute += delta;
            }
            plannedSaEvents = reconcileAutoFilledGaps(plannedSaEvents, next);
        }
        standardSaDayConfigs.set(`${planScopeKey(productId, stationId)}`, next);
        frozenStandardWindows.delete(`${planScopeKey(productId, stationId)}`);
        getCopyProjectionDraft(productId, stationId).generated = false;
        render(selectedProductId);
    };
    const resetButton = plannedSaRoot.querySelector("#generatePlannedSample");
    resetButton?.addEventListener("mousedown", () => {
        pendingStandardSaDayConfig = standardSaDayConfigFromControls(plannedSaRoot, getStandardSaDayConfig(productId, stationId));
    });
    resetButton?.addEventListener("click", () => {
        if (!plannedSaEventsAreDefault && !window.confirm(locale === "zh"
            ? "重置为测试样例会替换当前手工计划。继续吗？"
            : "Resetting to the test sample replaces the current manual plan. Continue?"))
            return;
        const next = pendingStandardSaDayConfig ?? standardSaDayConfigFromControls(plannedSaRoot, getStandardSaDayConfig(productId, stationId));
        pendingStandardSaDayConfig = undefined;
        standardSaDayConfigs.set(`${planScopeKey(productId, stationId)}`, next);
        plannedSaEvents = buildDefaultPlannedActivityEvents(stationId, productId, next);
        plannedSaEventsAreDefault = true;
        frozenStandardWindows.delete(`${planScopeKey(productId, stationId)}`);
        getCopyProjectionDraft(productId, stationId).generated = false;
        standardWindowFreezeError = "";
        plannedSaDraftError = "";
        setPlannedBlockDraftStart(next.startMinute, horizonMinutes);
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#standardDayStartDate")?.addEventListener("change", () => {
        updateDayConfig(standardSaDayConfigFromControls(plannedSaRoot, dayConfig));
    });
    plannedSaRoot.querySelector("#standardDayStartHour")?.addEventListener("change", event => {
        updateDayConfig({ ...dayConfig, startMinute: updateMinuteClockPart(dayConfig.startMinute, "startHour", event.currentTarget.value) });
    });
    plannedSaRoot.querySelector("#standardDayStartMinute")?.addEventListener("change", event => {
        updateDayConfig({ ...dayConfig, startMinute: updateMinuteClockPart(dayConfig.startMinute, "startMinuteOfHour", event.currentTarget.value) });
    });
    plannedSaRoot.querySelector("#standardShiftMinutes")?.addEventListener("change", event => {
        const shiftMinutes = Number(event.currentTarget.value);
        updateDayConfig({ ...dayConfig, shiftMinutes, shiftsPerDay: Math.min(dayConfig.shiftsPerDay, MINUTE_PER_DAY / shiftMinutes) });
    });
    plannedSaRoot.querySelector("#standardShiftsPerDay")?.addEventListener("change", event => {
        updateDayConfig({ ...dayConfig, shiftsPerDay: Number(event.currentTarget.value) });
    });
    plannedSaRoot.querySelector("#standardDayCount")?.addEventListener("change", event => {
        updateDayConfig({ ...dayConfig, dayCount: Number(event.currentTarget.value) });
    });
    plannedSaRoot.querySelector("#freezeStandardWindow")?.addEventListener("click", () => {
        const issues = validateStandardSaDay(plannedSaEvents, dayConfig);
        if (issues.length) {
            standardWindowFreezeError = formatStandardSaDayIssues(issues);
            render(selectedProductId);
            return;
        }
        const contextKey = `${planScopeKey(productId, stationId)}`;
        const previous = frozenStandardWindows.get(contextKey);
        const result = freezeStandardWindow({
            sourceId: contextKey,
            version: (previous?.version ?? 0) + 1,
            stationId,
            baseDate: minuteToDateValue(dayConfig.startMinute),
            events: plannedSaEvents,
            dayConfig,
        });
        if (result.snapshot) {
            frozenStandardWindows.set(contextKey, result.snapshot);
            standardWindowFreezeError = "";
        }
        else {
            standardWindowFreezeError = formatStandardWindowIssues(result.issues);
        }
        render(selectedProductId);
    });
    const projectionDraft = getCopyProjectionDraft(productId, stationId);
    plannedSaRoot.querySelector("#copyWeekStartDate")?.addEventListener("change", event => {
        projectionDraft.weekStartDate = event.currentTarget.value;
        projectionDraft.generated = false;
        projectionDraft.monthGenerated = false;
        render(selectedProductId);
    });
    plannedSaRoot.querySelectorAll("[data-week-day-mode]").forEach(input => {
        input.addEventListener("change", () => {
            const dayIndex = Number(input.dataset.weekDayMode);
            projectionDraft.dayModes[dayIndex] = input.value === "copy" || input.value === "manual" ? input.value : "off";
            projectionDraft.generated = false;
            projectionDraft.monthGenerated = false;
            render(selectedProductId);
        });
    });
    plannedSaRoot.querySelectorAll("[data-manual-field]").forEach(input => {
        input.addEventListener("change", () => {
            const field = input.dataset.manualField;
            const value = Number(input.value);
            if (field === "shiftMinutes") {
                const maxShifts = maxShiftsForLength(value);
                projectionDraft.form = { ...projectionDraft.form, shiftMinutes: value, shiftsPerDay: Math.min(projectionDraft.form.shiftsPerDay, maxShifts) };
                render(selectedProductId);
                return;
            }
            projectionDraft.form = { ...projectionDraft.form, [field]: Number.isFinite(value) ? value : 0 };
            if (field === "shiftsPerDay")
                render(selectedProductId);
            else
                plannedSaRoot.querySelector("#stableDayFillNote")?.replaceChildren(document.createTextNode(stableDayFillNote(projectionDraft.form, locale === "zh")));
        });
        if (input instanceof HTMLInputElement)
            input.addEventListener("input", () => {
                const field = input.dataset.manualField;
                const value = Number(input.value);
                projectionDraft.form = { ...projectionDraft.form, [field]: Number.isFinite(value) ? value : 0 };
                plannedSaRoot.querySelector("#stableDayFillNote")?.replaceChildren(document.createTextNode(stableDayFillNote(projectionDraft.form, locale === "zh")));
            });
    });
    plannedSaRoot.querySelector("#clearManualDay")?.addEventListener("click", () => {
        delete projectionDraft.stableSaved;
        projectionDraft.form = emptyManualMinutes();
        projectionDraft.formError = "";
        projectionDraft.generated = false;
        projectionDraft.monthGenerated = false;
        projectionDraft.monthError = "";
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#monthlySetupOccurrences")?.addEventListener("change", event => {
        projectionDraft.monthlySetupOccurrences = Number(event.currentTarget.value);
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#monthlySetupMinutes")?.addEventListener("change", event => {
        projectionDraft.monthlySetupMinutes = Number(event.currentTarget.value);
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#generateCopyProjection")?.addEventListener("click", () => {
        if (projectionDraft.dayModes.some(mode => mode === "manual")) {
            const issues = validateManualMinutes(projectionDraft.form, projectionDraft.weekStartDate);
            if (issues.length) {
                projectionDraft.formError = issues.map(issue => issue.message).join("；");
                projectionDraft.generated = false;
                projectionDraft.monthGenerated = false;
                render(selectedProductId);
                return;
            }
            projectionDraft.stableSaved = { ...projectionDraft.form };
        }
        const frozen = frozenStandardWindows.get(`${planScopeKey(productId, stationId)}`);
        const repeatDates = projectionDraft.weekStartDate
            ? projectionDraft.dayModes.flatMap((mode, day) => mode === "copy" ? [addDays(projectionDraft.weekStartDate, day)] : []) : [];
        if (repeatDates.length && !frozen) {
            projectionDraft.formError = locale === "zh" ? "有复制日时，请先冻结源窗口。" : "Freeze the source window before copying days.";
            projectionDraft.generated = false;
            projectionDraft.monthGenerated = false;
            render(selectedProductId);
            return;
        }
        projectionDraft.formError = "";
        projectionDraft.monthGenerated = false;
        projectionDraft.monthError = "";
        projectionDraft.copyDates = repeatDates;
        projectionDraft.generated = true;
        if (frozen)
            projectionDraft.builtVersion = frozen.version;
        else
            delete projectionDraft.builtVersion;
        projectionDraft.builtDayStart = minuteOfDay(dayConfig.startMinute);
        if (repeatDates.length && frozen) {
            projectionDraft.copyResult = copyStandardWindowToWeek({
                source: frozen, currentSourceEvents: plannedSaEvents, currentDayConfig: dayConfig,
                weekStartDate: projectionDraft.weekStartDate, repeatDates,
            });
        }
        else {
            delete projectionDraft.copyResult;
        }
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#generateMonthLedger")?.addEventListener("click", () => {
        if (!projectionDraft.generated) {
            projectionDraft.monthGenerated = false;
            projectionDraft.monthError = locale === "zh" ? "请先生成周账。" : "Generate the week ledger first.";
            render(selectedProductId);
            return;
        }
        projectionDraft.monthError = "";
        projectionDraft.monthGenerated = true;
        render(selectedProductId);
    });
    plannedSaRoot.querySelector("#addPlannedTimeBlock")?.addEventListener("click", () => {
        addPlannedTimeBlock(stationId, productId, horizonMinutes);
    });
    plannedSaRoot.querySelector("#fillPlannedGaps")?.addEventListener("click", () => {
        plannedSaEvents = [...plannedSaEvents, ...findStandardSaDayGaps(plannedSaEvents, dayConfig).map((gap, index) => ({ ...buildTimelineEvent(`planned-unscheduled-${Date.now()}-${index}`, stationId, productId, "unscheduled", gap.startMinute, gap.endMinute, "未排产"), autoFilled: true }))]
            .sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
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
function getCopyProjectionDraft(productId, stationId) {
    const key = `${planScopeKey(productId, stationId)}`;
    let draft = copyProjectionDrafts.get(key);
    if (!draft) {
        const today = parseUtcDate(todayDateValue());
        const daysUntilMonday = (8 - today.getUTCDay()) % 7;
        draft = {
            weekStartDate: addDays(todayDateValue(), daysUntilMonday),
            dayModes: Array.from({ length: 7 }, () => "off"),
            form: emptyManualMinutes(), formError: "",
            monthlySetupOccurrences: 0, monthlySetupMinutes: 0,
            generated: false, monthGenerated: false, monthError: "", copyDates: [],
        };
        copyProjectionDrafts.set(key, draft);
    }
    return draft;
}
function emptyManualMinutes() {
    return { shiftMinutes: 480, shiftsPerDay: 2, productionMinutes: 0, breakMinutes: 0, setupMinutes: 0, maintenanceMinutes: 0, plannedStopMinutes: 0, unscheduledMinutes: 0 };
}
const stableActionLabels = [
    ["productionMinutes", "生产", "production"],
    ["breakMinutes", "休息", "break"],
    ["setupMinutes", "换型", "changeover"],
    ["maintenanceMinutes", "维护", "maintenance"],
    ["plannedStopMinutes", "计划停机", "planned stop"],
];
function stableDayFillNote(form, zh) {
    const opened = form.shiftMinutes * form.shiftsPerDay;
    const safeOpened = Number.isFinite(opened) ? opened : 0;
    const deductions = stableActionLabels.flatMap(([field, zhLabel, enLabel]) => {
        const minutes = form[field];
        return Number.isFinite(minutes) && minutes > 0 ? [`-${formatNumber(minutes)} ${zh ? `分钟${zhLabel}` : `min ${enLabel}`}`] : [];
    });
    const filled = stableActionLabels.reduce((sum, [field]) => sum + (Number.isFinite(form[field]) ? form[field] : 0), 0);
    const remaining = safeOpened - filled;
    const remainder = remaining > 0
        ? (zh ? `还需填满 ${formatNumber(remaining)} 分钟` : `${formatNumber(remaining)} min remaining`)
        : remaining < 0
            ? (zh ? `超出 ${formatNumber(-remaining)} 分钟` : `${formatNumber(-remaining)} min over`)
            : (zh ? "已排满" : "Filled");
    const autoUnscheduled = Math.max(0, 1440 - safeOpened);
    const head = `${formatNumber(safeOpened)} ${zh ? "分钟" : "min"}${deductions.length ? `，${deductions.join("，")}` : ""}，${remainder}。`;
    return `${head}${zh ? `未开班次 ${formatNumber(autoUnscheduled)} 分钟自动记为未排产。` : ` Unopened shifts: ${formatNumber(autoUnscheduled)} min unscheduled.`}`;
}
function renderCopyProjectionPanel(productId, stationId, operationId, frozen, sourceCurrent) {
    const draft = getCopyProjectionDraft(productId, stationId);
    const zh = locale === "zh";
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const dayStart = minuteOfDay(dayConfig.startMinute);
    const weekStartClock = minuteToTimeValue(dayConfig.startMinute);
    const choices = draft.dayModes.map(mode => ({
        mode, ...(mode === "manual" && draft.stableSaved ? { manual: draft.stableSaved } : {}),
    }));
    const ledger = draft.generated ? buildWeekMinuteLedger({
        weekStartDate: draft.weekStartDate, dayStartMinute: dayStart, choices,
        ...(draft.copyResult ? { copy: draft.copyResult } : {}),
        sourceCurrent: sourceCurrent && draft.builtVersion === frozen?.version && draft.builtDayStart === dayStart,
    }) : undefined;
    const month = draft.monthGenerated && ledger?.summary ? repeatWeekForMonth(ledger, { occurrences: draft.monthlySetupOccurrences, minutesPerOccurrence: draft.monthlySetupMinutes }) : undefined;
    const allowance = observeShiftAllowance({
        stationId,
        shifts: standardSaShiftIntervals(dayConfig),
        actual: rnrActualEventsByContext.get(`${actualScopeKey(productId, operationId, stationId)}`) ?? [],
    });
    const allowanceIsSample = validationFixtureContexts.has(`${actualScopeKey(productId, operationId, stationId)}`);
    const shiftCounts = ledger ? ledger.days.map(day => ledgerShiftCount(day, draft.stableSaved?.shiftsPerDay ?? 0, dayConfig.shiftsPerDay)) : [];
    const mostLikelyWeek = ledger?.summary ? summarizeMostLikely(ledger.days, shiftCounts, allowance?.perShiftMinutes ?? 0) : undefined;
    const mostLikelyMonth = mostLikelyWeek && month?.summary && !month.issues.length
        ? mostLikelySummaryFromProduction(month.summary, mostLikelyMonthProduction(mostLikelyWeek.productionMinutes, month.weeks.length, month.setupAllowanceMinutes))
        : undefined;
    const parameters = scenarioState.operationStationParameters ?? [];
    const perShiftUnplanned = allowance?.perShiftMinutes ?? 0;
    const capacityDay = (day, shiftCount) => ({
        date: day.date, workingDay: day.workingDay, stale: day.stale,
        bestCaseProductionMinutes: day.productionMinutes,
        mostLikelyProductionMinutes: day.workingDay && !day.stale ? Math.max(0, day.productionMinutes - perShiftUnplanned * shiftCount) : 0,
    });
    const weekCapacity = ledger?.summary ? buildPeriodCapacity({
        operationId, stationId, parameters, days: ledger.days.map((day, index) => capacityDay(day, shiftCounts[index] ?? 0)),
    }) : undefined;
    if (draft.generated && ledger?.summary && draft.weekStartDate) {
        stationWeekSnapshots.set(`${planScopeKey(productId, stationId)}::${draft.weekStartDate}`, {
            days: ledger.days.map(day => ({ ...day })),
            shiftCounts: [...shiftCounts],
            perShiftUnplanned,
            ...(ledger.summary.withBreaksSa === undefined ? {} : { withBreaksSa: ledger.summary.withBreaksSa }),
            ...(mostLikelyWeek?.withBreaksSa === undefined ? {} : { mostLikelySa: mostLikelyWeek.withBreaksSa }),
        });
    }
    const monthCapacity = month?.summary && !month.issues.length ? buildPeriodCapacity({
        operationId, stationId, parameters,
        days: month.days.map((day, index) => capacityDay(day, shiftCounts[index % shiftCounts.length] ?? 0)),
        extraChangeoverMinutes: month.setupAllowanceMinutes,
    }) : undefined;
    const maxShifts = maxShiftsForLength(draft.form.shiftMinutes);
    if (draft.form.shiftsPerDay > maxShifts)
        draft.form = { ...draft.form, shiftsPerDay: maxShifts };
    const shiftOptions = Array.from({ length: maxShifts }, (_, index) => index + 1);
    const stableDates = draft.dayModes.flatMap((mode, day) => mode === "manual" && draft.weekStartDate ? [addDays(draft.weekStartDate, day)] : []);
    return `
    <section class="sub-card" style="margin-top:14px;" data-week-ledger>
      <p class="form-error" data-report-gap-station="${escapeHtml(stationId)}" data-report-gap-detail hidden></p>
      <div class="panel-head"><h3>${zh ? "长周期投影 / 日历展开" : "Long-horizon projection / calendar"}</h3><span class="section-label">${zh ? "按需生成 · 本地预览" : "Optional · local preview"}</span></div>
      <div class="field-grid">
        <div class="field"><label for="copyWeekStartDate">${zh ? "整周起始日期" : "Week start date"}</label><input id="copyWeekStartDate" type="date" value="${escapeHtml(draft.weekStartDate)}" /></div>
        <div class="field week-start-field"><span>${zh ? "周起点时间" : "Week start time"}</span><span class="week-start-date">${escapeHtml(draft.weekStartDate || "-")}</span><strong>${weekStartClock}</strong></div>
      </div>
      <h4>${zh ? "第 1 周：逐日选择" : "Week 1: choose each day"}</h4>
      <div class="field-grid">
        ${draft.dayModes.map((mode, day) => {
        const date = draft.weekStartDate ? addDays(draft.weekStartDate, day) : "";
        return `<label class="field"><span class="copy-day-date">${date ? escapeHtml(date) : "-"} ${date ? formatWeekday(date) : ""}</span><select data-week-day-mode="${day}"><option value="copy" ${mode === "copy" ? "selected" : ""}>${zh ? "复制源窗口" : "Copy source"}</option><option value="manual" ${mode === "manual" ? "selected" : ""}>${zh ? "平稳日" : "Stable day"}</option><option value="off" ${mode === "off" ? "selected" : ""}>${zh ? "非工作日" : "Non-working day"}</option></select></label>`;
    }).join("")}
      </div>
      <h4>${zh ? "平稳日" : "Stable day"}</h4>
      <p class="note">${stableDates.length ? (zh ? `套用到 ${stableDates.join("、")}。这些工作日使用同一套分钟。` : `Applied to ${stableDates.join(", ")}.`) : (zh ? "还没有工作日选择平稳日。" : "No day uses the stable day yet.")}</p>
      <div class="field-grid">
        <label class="field">${zh ? "班次时长" : "Shift length"}<select data-manual-field="shiftMinutes"><option value="480" ${draft.form.shiftMinutes === 480 ? "selected" : ""}>8H</option><option value="720" ${draft.form.shiftMinutes === 720 ? "selected" : ""}>12H</option></select></label>
        <label class="field">${zh ? "每日班数" : "Shifts per day"}<select data-manual-field="shiftsPerDay">${shiftOptions.map(count => `<option value="${count}" ${draft.form.shiftsPerDay === count ? "selected" : ""}>${count}</option>`).join("")}</select></label>
        ${["productionMinutes", "breakMinutes", "setupMinutes", "maintenanceMinutes", "plannedStopMinutes"].map(field => `<label class="field">${zh ? ({ productionMinutes: "生产", breakMinutes: "休息", setupMinutes: "换型", maintenanceMinutes: "维护", plannedStopMinutes: "计划停机" }[field]) : field}<input data-manual-field="${field}" type="number" min="0" step="1" value="${draft.form[field]}" /></label>`).join("")}
      </div>
      <p class="note" id="stableDayFillNote">${escapeHtml(stableDayFillNote(draft.form, zh))}</p>
      ${draft.formError ? `<p class="form-error" role="alert">${escapeHtml(draft.formError)}</p>` : ""}
      <div class="action-bar"><button class="button" type="button" id="generateCopyProjection">${zh ? "生成周账" : "Generate ledger"}</button><button class="button secondary" type="button" id="clearManualDay">${zh ? "清除平稳日" : "Clear stable day"}</button></div>
      ${ledger ? renderLedgerIssues(ledger) : ""}
      ${ledger?.summary && mostLikelyWeek ? renderLedgerTable(ledger.days, zh) + renderWeekRatios(ledger.summary, zh) + renderMostLikelyBlock(mostLikelyWeek, allowance, allowanceIsSample, zh, false) + (weekCapacity ? renderPeriodCapacity(weekCapacity, stationId, allowance, zh, false) : "") : ""}
      ${ledger?.copyEvents.length ? `<details style="margin-top:14px;"><summary>${zh ? "复制事件与来源" : "Copied events"} (${formatNumber(ledger.copyEvents.length)})</summary><div class="table-wrap"><table><thead><tr><th>${zh ? "起点" : "Start"}</th><th>${zh ? "终点" : "End"}</th><th>${zh ? "类型" : "Type"}</th><th>${zh ? "来源事件" : "Source event"}</th></tr></thead><tbody>${ledger.copyEvents.map(event => `<tr><td>${escapeHtml(formatProjectedMinute(draft.weekStartDate, event.startMinute))}</td><td>${escapeHtml(formatProjectedMinute(draft.weekStartDate, event.endMinute))}</td><td>${escapeHtml(formatTimelineKind(event.kind))}</td><td>${escapeHtml(event.sourceEventId ?? "-")}</td></tr>`).join("")}</tbody></table></div></details>` : ""}
      <h4>${zh ? "整月换型" : "Monthly changeover"}</h4>
      <div class="field-grid">
        <label class="field">${zh ? "本月次数" : "Occurrences this month"}<select id="monthlySetupOccurrences">${[0, 1, 2, 3].map(count => `<option value="${count}" ${draft.monthlySetupOccurrences === count ? "selected" : ""}>${count}</option>`).join("")}</select></label>
        <label class="field">${zh ? "单次分钟" : "Minutes each"}<input id="monthlySetupMinutes" type="number" min="0" step="1" value="${draft.monthlySetupMinutes}" /></label>
      </div>
      <p class="note">${zh ? "这里只记一个月发生一次、两次或三次、没有写进每周源窗口或平稳日的换型。次数乘单次分钟后，从整月生产时间扣除，不改各周。" : "Monthly changeovers are not part of the repeated week. Their minutes are deducted from the month only."}</p>
      <div class="action-bar"><button class="button" type="button" id="generateMonthLedger">${zh ? "生成月账" : "Generate month ledger"}</button></div>
      ${draft.monthError ? `<p class="form-error" role="alert">${escapeHtml(draft.monthError)}</p>` : ""}
      ${draft.monthGenerated && !ledger?.summary && !draft.monthError ? `<p class="form-error" role="alert">${zh ? "当前周账还不能展开成月账。" : "The current week ledger cannot expand into a month."}</p>` : ""}
      ${month?.issues.length ? `<ul class="message-list">${month.issues.map(issue => `<li>${escapeHtml(issue.message)}</li>`).join("")}</ul>` : ""}
      ${month?.summary && !month.issues.length ? `
        <h4>${zh ? "整月重复" : "Repeated month"}</h4>
        <div class="table-wrap"><table><thead><tr><th>${zh ? "周次" : "Week"}</th><th>${zh ? "周起点" : "Week start"}</th><th>${zh ? "编排方式" : "Arrangement"}</th><th>${zh ? "With breaks SA" : "With breaks SA"}</th><th>${zh ? "Without breaks SA" : "Without breaks SA"}</th><th>${zh ? "整周日历利用率" : "Calendar utilization"}</th></tr></thead><tbody>
          ${month.weeks.map(week => `<tr><td>${zh ? `第 ${week.weekNumber} 周` : `Week ${week.weekNumber}`}</td><td>${week.weekStartDate} ${weekStartClock}</td><td>${week.weekNumber === 1 ? (zh ? "已定义整周" : "Defined week") : (zh ? "重复第 1 周" : "Repeat week 1")}</td><td>${formatRatio(week.summary?.withBreaksSa)}</td><td>${formatRatio(week.summary?.withoutBreaksSa)}</td><td>${formatRatio(week.summary?.calendarUtilization)}</td></tr>`).join("")}
        </tbody></table></div>
        ${renderWeekRatios(month.summary, zh, true)}
        ${mostLikelyMonth ? renderMostLikelyBlock(mostLikelyMonth, allowance, allowanceIsSample, zh, true) : ""}
        ${monthCapacity ? renderPeriodCapacity(monthCapacity, stationId, allowance, zh, true) : ""}
        <p class="note">${zh ? `月内换型已从整月生产时间扣除 ${formatNumber(month.setupAllowanceMinutes)} 分钟。各周仍是重复前的平稳周。` : `Monthly changeover deducts ${formatNumber(month.setupAllowanceMinutes)} minutes from the month.`}</p>` : ""}
    </section>`;
}
function renderLedgerIssues(ledger) {
    const messages = [...ledger.issues.map(issue => issue.message), ...(ledger.copyEvents.length ? [] : ledger.issues.filter(issue => issue.code === "copy_failed").map(() => ""))];
    const copyIssues = ledger.issues.some(issue => issue.code === "copy_failed") ? [] : [];
    void copyIssues;
    return messages.length ? `<ul class="message-list">${ledger.issues.map(issue => `<li>${escapeHtml(issue.date ? `${issue.date}：` : "")}${escapeHtml(issue.message)}</li>`).join("")}</ul>` : "";
}
function renderLedgerTable(days, zh) {
    return `<div class="table-wrap"><table><thead><tr><th>${zh ? "生产日" : "Day"}</th><th>${zh ? "来源" : "Origin"}</th><th>${zh ? "工作日" : "Working"}</th><th>${zh ? "排班" : "Scheduled"}</th><th>${zh ? "非排班" : "Off shift"}</th><th>${zh ? "生产" : "Production"}</th><th>${zh ? "休息" : "Break"}</th><th>${zh ? "换型" : "Setup"}</th><th>${zh ? "未排产" : "Unscheduled"}</th><th>${zh ? "Best case 可用" : "Best case"}</th></tr></thead><tbody>
    ${days.map(day => `<tr><td>${day.date}${day.stale ? (zh ? "（已过期）" : " (stale)") : ""}${day.occupiedByDate ? ` ← ${day.occupiedByDate}` : ""}</td><td>${day.origin === "sourceCopy" ? (zh ? "复制" : "Copy") : day.origin === "manualMinutes" ? (zh ? "平稳日" : "Stable") : (zh ? "非工作日" : "Off")}</td><td>${day.workingDay ? (zh ? "是" : "Yes") : (zh ? "否" : "No")}</td><td>${formatNumber(day.scheduledMinutes)}</td><td>${formatNumber(day.offShiftMinutes)}</td><td>${formatNumber(day.productionMinutes)}</td><td>${formatNumber(day.breakMinutes)}</td><td>${formatNumber(day.setupMinutes)}</td><td>${formatNumber(day.unscheduledMinutes)}</td><td>${formatNumber(day.bestCaseAvailableMinutes)}</td></tr>`).join("")}
  </tbody></table></div>`;
}
function mostLikelySummaryFromProduction(base, production) {
    return {
        ...base,
        productionMinutes: production,
        ...(base.withBreaksDenominator > 0 ? { withBreaksSa: production / base.withBreaksDenominator } : {}),
        ...(base.withoutBreaksDenominator > 0 ? { withoutBreaksSa: production / base.withoutBreaksDenominator } : {}),
        ...(base.calendarDenominator > 0 ? { calendarUtilization: production / base.calendarDenominator } : {}),
    };
}
function renderMostLikelyBlock(summary, allowance, sample, zh, fourWeek) {
    const title = fourWeek ? (zh ? "整月 Most likely" : "Month Most likely") : (zh ? "周 Most likely" : "Week Most likely");
    const calendarLabel = fourWeek ? (zh ? "月日历利用率" : "Month calendar utilization") : (zh ? "整周日历利用率" : "Calendar utilization");
    const observed = allowance
        ? (zh
            ? `已记录非计划停机 ${formatNumber(allowance.observedUnplannedMinutes)} 分钟，可补救 ${formatNumber(allowance.recoverableMinutes)} 分钟，进入排产 ${formatNumber(allowance.planningUnplannedMinutes)} 分钟 / 观察到 ${formatNumber(allowance.observedShiftCount)} 班 = 每班 ${formatNumber(allowance.perShiftMinutes)} 分钟。源窗口日和平稳日按各自班数扣除，纯排版时间轴不变。`
            : `Recorded unplanned ${formatNumber(allowance.observedUnplannedMinutes)} min, recoverable ${formatNumber(allowance.recoverableMinutes)} min, planning ${formatNumber(allowance.planningUnplannedMinutes)} min / ${formatNumber(allowance.observedShiftCount)} shifts = ${formatNumber(allowance.perShiftMinutes)} min per shift.`)
        : (zh ? "无样本，按 0 预留的假设。当前工站还没有落在已开班次上的跑线记录，Most likely 与 Best case 相同。" : "No sample; assuming a 0-minute allowance. Most likely matches Best case.");
    const sources = allowance?.sources.map(source => zh
        ? `${formatTimelineKind(source.category)} 已记录 ${formatNumber(source.minutes)} 分钟，可补救 ${formatNumber(source.recoverableMinutes)} 分钟，进入排产 ${formatNumber(source.planningMinutes)} 分钟，第 ${source.shiftNumbers.join("、")} 班${source.source ? `，${source.source}` : ""}${source.estimated ? "，估算" : ""}`
        : `${source.category} ${formatNumber(source.minutes)} min`).join(zh ? "；" : "; ") ?? "";
    const sampleNote = sample ? (zh ? "当前跑线是验证样本，不是现场记录。" : "The current run is a validation sample, not a field record.") : "";
    return `<div class="field-grid" style="margin-top:14px;"><div class="field"><span>${title} With breaks SA</span><strong>${formatRatio(summary.withBreaksSa)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.withBreaksDenominator)} · ${zh ? "生产" : "Production"} ${formatNumber(summary.productionMinutes)}</small></div><div class="field"><span>Without breaks SA</span><strong>${formatRatio(summary.withoutBreaksSa)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.withoutBreaksDenominator)}</small></div><div class="field"><span>${calendarLabel}</span><strong>${formatRatio(summary.calendarUtilization)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.calendarDenominator)}</small></div></div><p class="note">${escapeHtml(observed)}${sources ? ` ${escapeHtml(sources)}。` : ""}${sampleNote ? ` ${escapeHtml(sampleNote)}` : ""}</p>`;
}
function renderPeriodCapacity(result, stationId, allowance, zh, month) {
    const versions = [...new Set(result.days.flatMap(day => day.status === "calculated" && day.parameterId ? [`${day.parameterId} · CT ${formatNumber(day.standardCycleSec ?? 0)}s · ${zh ? "每循环" : "pcs/cycle"} ${formatNumber(day.piecesPerCycle ?? 0)} · P ${percent(day.performanceRate ?? 0)} · Q ${percent(day.qualityRate ?? 0)}`] : []))];
    const pieces = (value) => value === undefined ? (zh ? "不可计算" : "Not calculable") : formatOutputUnits(value);
    const reserve = allowance
        ? (zh ? `非计划停机预留已含在 Most likely 分钟中：每班 ${formatNumber(allowance.perShiftMinutes)} 分钟。` : `Unplanned allowance is already inside Most likely minutes: ${formatNumber(allowance.perShiftMinutes)} min per shift.`)
        : (zh ? "无样本，按 0 预留的假设。" : "No sample; assuming a 0-minute allowance.");
    const changeover = month
        ? (zh ? `月内额外换型 ${formatNumber(result.extraChangeoverMinutes)} 分钟，不改各周。Best case 扣 ${formatNumber(result.extraChangeoverGoodLossRaw)} 件；Most likely 按已发布 P、Q 扣 ${formatNumber(result.extraChangeoverMostLikelyLossRaw ?? result.extraChangeoverGoodLossRaw)} 件。` : `Extra monthly changeover ${formatNumber(result.extraChangeoverMinutes)} min stays out of the weeks. Best case deducts ${formatNumber(result.extraChangeoverGoodLossRaw)} pieces; Most likely deducts ${formatNumber(result.extraChangeoverMostLikelyLossRaw ?? result.extraChangeoverGoodLossRaw)} after published P and Q.`)
        : "";
    return `<section ${month ? "data-month-capacity" : "data-week-capacity"} style="margin-top:14px;"><h4>${zh ? (month ? "当前工站月件数" : "当前工站周件数") : (month ? "Station month pieces" : "Station week pieces")}</h4><p class="note">${escapeHtml(stationId)}。${escapeHtml(reserve)}${changeover ? ` ${escapeHtml(changeover)}` : ""} ${zh ? "Best case 件数不乘 P、Q。Most likely 件数乘已发布的 P、Q。周、月件数按未取整日值合计后向下取整。" : "Best case pieces do not apply P or Q. Most likely pieces apply the published P and Q. Period pieces floor the sum of unrounded daily values."}</p><div class="field-grid"><div class="field"><span>Best case</span><strong>${pieces(result.bestCaseGoodPieces)}</strong><small>${zh ? "生产" : "Production"} ${formatNumber(result.bestCaseMinutes)} ${zh ? "分钟" : "min"}</small></div><div class="field"><span>Most likely</span><strong>${pieces(result.mostLikelyGoodPieces)}</strong><small>${zh ? "生产" : "Production"} ${formatNumber(result.mostLikelyMinutes)} ${zh ? "分钟" : "min"}</small></div></div>${result.calculable ? "" : `<p class="form-error" role="alert">${escapeHtml(result.reason ?? "")}</p>`}<p class="note">${versions.length ? escapeHtml(versions.join("；")) : (zh ? "没有可追溯的参数版本。" : "No traceable parameter version.")}</p></section>`;
}
function renderWeekRatios(summary, zh, fourWeek = false) {
    const title = fourWeek ? (zh ? "整月汇总" : "Month total") : (zh ? "周汇总" : "Week total");
    const calendarLabel = fourWeek ? (zh ? "月日历利用率" : "Month calendar utilization") : (zh ? "整周日历利用率" : "Calendar utilization");
    return `<div class="field-grid" style="margin-top:14px;"><div class="field"><span>${title} With breaks SA</span><strong>${formatRatio(summary.withBreaksSa)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.withBreaksDenominator)}</small></div><div class="field"><span>Without breaks SA</span><strong>${formatRatio(summary.withoutBreaksSa)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.withoutBreaksDenominator)}</small></div><div class="field"><span>${calendarLabel}</span><strong>${formatRatio(summary.calendarUtilization)}</strong><small>${zh ? "分母" : "Denominator"} ${formatNumber(summary.calendarDenominator)}</small></div></div>`;
}
function formatRatio(value) {
    return value === undefined || !Number.isFinite(value) ? (locale === "zh" ? "不可计算" : "Not calculable") : percent(value);
}
function formatProjectedMinute(weekStartDate, minute) {
    const day = Math.floor(minute / MINUTE_PER_DAY);
    const withinDay = minute - day * MINUTE_PER_DAY;
    return `${addDays(weekStartDate, day)} ${String(Math.floor(withinDay / 60)).padStart(2, "0")}:${String(withinDay % 60).padStart(2, "0")}`;
}
function formatCopyProjectionIssue(issue) {
    if (locale !== "zh") {
        const labels = {
            source_stale: "Source window changed; freeze it again", invalid_source: "Invalid source window", invalid_week_date: "Invalid week start date",
            no_repeat_date: "Select at least one copy date", invalid_repeat_date: "Invalid copy date", duplicate_repeat_date: "Duplicate copy date",
            outside_week: "Event falls outside the selected week", repeat_overlap: "Copied intervals overlap",
        };
        return `${issue.date ? `${issue.date}: ` : ""}${labels[issue.code]}`;
    }
    const labels = {
        source_stale: "源窗口已更改，请重新冻结", invalid_source: "源窗口无效", invalid_week_date: "整周起始日期无效",
        no_repeat_date: "至少选择一个复制日期", invalid_repeat_date: "复制日期无效", duplicate_repeat_date: "复制日期重复",
        outside_week: "事件超出所选整周", repeat_overlap: "复制后的时间段重叠",
    };
    return `${issue.date ? `${issue.date}：` : ""}${labels[issue.code]}`;
}
function formatStandardWindowIssues(issues) {
    if (locale === "zh") {
        const labels = {
            empty: "没有时间段", mixed_station: "包含其他工站", duplicate_id: "事件 ID 重复",
            invalid_kind: "包含非计划事件", invalid_boundary: "起止时间无效",
            outside_horizon: "超出 48 小时窗口", overlap: "时间段重叠", gap: "存在未标记空档",
            invalid_schedule: "班制设置无效", outside_shift: "事件超出已开班时段",
        };
        return `不能冻结：${issues.map(issue => labels[issue]).join("、")}。`;
    }
    return `Cannot freeze: ${issues.join(", ")}.`;
}
function resolvePlannedSaStationId(operations, selectedOperation) {
    const selectedStation = workflowStationViews(selectedOperation).find(item => item.assignment.stationId === selectedWorkflowStationId)?.assignment.stationId
        ?? workflowStationViews(selectedOperation)[0]?.assignment.stationId;
    if (selectedStation)
        return selectedStation;
    const routeStation = operations
        .flatMap(operation => workflowStationViews(operation))[0]?.assignment.stationId;
    return routeStation ?? "-";
}
function buildDefaultPlannedActivityEvents(stationId, productId, config) {
    const counts = { production: 0, break: 0, setup: 0 };
    return buildStandardSaSampleSlots(config).map(slot => {
        const id = `planned-${slot.kind}-${++counts[slot.kind]}`;
        const label = `${formatTimelineKind(slot.kind)} ${minuteToTimeValue(slot.startMinute)}-${minuteToTimeValue(slot.endMinute)}`;
        return buildTimelineEvent(id, stationId, productId, slot.kind, slot.startMinute, slot.endMinute, label);
    });
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
function standardSaDayWindow(config) {
    const durationMinutes = config.dayCount * MINUTE_PER_DAY;
    return { startMinute: config.startMinute, endMinute: config.startMinute + durationMinutes, durationMinutes };
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
function sumTimelineDuration(events) {
    return events.reduce((sum, event) => sum + Math.max(event.endMinute - event.startMinute, 0), 0);
}
function renderPlannedTimeline(stationId, events, window, dayConfig) {
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
            ${standardSaOffShiftIntervals(dayConfig).map(interval => {
        const left = (interval.startMinute - startMinute) / durationMinutes * 100;
        const width = (interval.endMinute - interval.startMinute) / durationMinutes * 100;
        return `<span class="timeline-offshift" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;" title="${locale === "zh" ? "非排班" : "Off shift"}">${locale === "zh" ? "非排班" : "Off shift"}</span>`;
    }).join("")}
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
function minuteOfDay(minute) {
    return ((minute % MINUTE_PER_DAY) + MINUTE_PER_DAY) % MINUTE_PER_DAY;
}
function minuteToTimeValue(minute) {
    const minuteInDay = minuteOfDay(minute);
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
function formatWeekday(dateValue) {
    const day = parseUtcDate(dateValue).getUTCDay();
    return locale === "zh"
        ? ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][day]
        : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][day];
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
    if (event.autoFilled === true || /^planned-unscheduled-\d{13}-\d+$/.test(event.id))
        event.autoFilled = false;
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
    const assignmentView = workflowStationViews(selectedOperation)[0];
    const stationId = selectedWorkflowStationId || assignmentView?.assignment.stationId || "-";
    const productId = assignmentView?.assignment.productId ?? selectedProductId;
    if (stationId === "-") {
        rnrRoot.innerHTML = `${currentStationHead(t("rnrEyebrow"), t("rnrTitle"))}${emptyState(t("stationRequired"))}`;
        return;
    }
    if (!getPlannedSaEvents(stationId, productId).length) {
        rnrRoot.innerHTML = `${currentStationHead(t("rnrEyebrow"), t("rnrTitle"))}${emptyState(t("baselineRequired"))}`;
        return;
    }
    const operationLabel = operation ? `OP${operation.sequence} ${formatKnownText(operation.name)}` : "-";
    const parameter = operation
        ? selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operation.operationId, stationId)
        : undefined;
    const contextKey = actualScopeKey(productId, operation?.operationId ?? "", stationId);
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
                standardCycleSec: parameter?.standardCycleSec ?? (localRouteId() ? 0 : 24),
                piecesPerCycle: parameter?.piecesPerCycle ?? (localRouteId() ? 0 : 1),
                orderId: "", evidenceSource: "", isEstimated: false,
            };
            cycleCheckDraft = emptyCycleSampleDraft();
            editingCycleSampleId = "";
        }
        else if (parameter) {
            rnrSegmentDraft.standardCycleSec = parameter.standardCycleSec;
            rnrSegmentDraft.piecesPerCycle = parameter.piecesPerCycle;
        }
        rnrContextKey = contextKey;
        if (!saved)
            editingCycleSampleId = "";
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
    const hasActualRecord = (rnrActualEventsByContext.get(rnrContextKey)?.length ?? 0) > 0;
    const validationSample = validationFixtureContexts.has(rnrContextKey);
    const trackingStatus = validationSample
        ? (locale === "zh" ? "验证样本 · 非现场记录" : "Validation sample · not field data")
        : hasActualRecord
            ? (locale === "zh" ? "记录中" : "Recording")
            : t("notStarted");
    rnrRoot.innerHTML = `
    ${currentStationHead(t("rnrEyebrow"), t("rnrTitle"), `<span class="pill ${validationSample ? "warn" : hasActualRecord ? "good" : ""}">${trackingStatus}</span><span class="pill">${locale === "zh" ? "本机自动保存" : "Auto-saved locally"}</span>`)}
    <p class="note">${t("rnrNote")}</p>
    <section class="sub-card" style="margin-top:14px;" data-rnr-mode-panel>
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
    <div class="field-grid">
      ${field(t("rnrTarget"), operationLabel)}
      ${field(t("station"), stationId)}
      ${field(t("unplannedStopScope"), unplannedStops)}
    </div>
    ${rnrMode === "timeWindow"
        ? `${renderRnrBaselineReference(stationId, productId)}${renderRnrActualEditor(stationId, productId, parameter, operation)}`
        : renderCycleCheckRecord(parameter, operation?.operationId ?? "", stationId)}
    <div class="action-bar">
      <span>${t("capacityAnalysisSeparated")}</span>
    </div>
  `;
    bindRnrTracking();
}
function renderRnrBaselineReference(stationId, productId) {
    const events = getPlannedSaEvents(stationId, productId);
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const window = standardSaDayWindow(dayConfig);
    const summary = summarizeStandardSaDay(events, dayConfig);
    const valid = !validateStandardSaDay(events, dayConfig).length;
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${t("baselineReference")}</h3><span class="pill">${plannedSaEventsAreDefault ? t("sampleBaseline") : t("baselineReference")}</span></div>
      <div class="field-grid">
        ${field(t("station"), stationId)}
        ${field(t("baselineSaMetric"), valid ? percent(summary.bestCaseSaWithBreaks) : "-")}
        ${field(t("bestCaseSaWithoutBreaks"), valid ? percent(summary.bestCaseSaWithoutBreaks) : "-")}
      </div>
      ${renderRnrTimelineMetrics(stationId, events, window, dayConfig)}
      ${reconcileCurrentRnrSpeed().segments.some(segment => segment.issue === "faster_than_verified_standard") ? `<p class="form-error" role="alert">${locale === "zh" ? "存在快于已校验标准节拍的生产段：请复核 OK/NOK 数量、每循环件数和真实节拍后再出结果。" : "A production interval is faster than the verified standard: review OK/NOK quantity, pieces per cycle and observed cycle before finalizing."}</p>` : ""}
    </section>
  `;
}
function currentRnrActualEvents() {
    return rnrActualEventsByContext.get(rnrContextKey) ?? [];
}
function plannedCycleSecFor(operationId, stationId) {
    const parameter = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operationId, stationId);
    return parameter && parameter.standardCycleSec > 0 ? parameter.standardCycleSec : undefined;
}
function speedOptionsForCycle() {
    // Cycle samples stay diagnostic. They do not switch the parked time-window
    // speed split, and they do not apply a slow-deviation tolerance.
    return undefined;
}
function reconcileCurrentRnrSpeed() {
    const [, operationId = "", stationId = ""] = rnrContextKey.split("::");
    const [productId = ""] = rnrContextKey.split("::");
    const production = currentRnrActualEvents().filter(event => event.kind === "production");
    return reconcileRnrSpeedLoss(production.map(event => ({
        id: event.id, productId, operationId, stationId,
        startMinute: event.startMinute, endMinute: event.endMinute,
        okQty: event.okQty ?? 0, nokQty: event.nokQty ?? 0,
        piecesPerCycle: event.piecesPerCycle ?? 0,
    })), speedOptionsForCycle() ?? {});
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
function renderRnrTimelineMetrics(stationId, planned, window, dayConfig) {
    const actual = currentRnrActualEvents();
    const start = window.startMinute ?? 0;
    const duration = Math.max(window.durationMinutes, 1);
    const ticks = timelineTicks(duration);
    const plannedMinutes = sumTimelineDuration(planned.filter(event => event.kind === "production"));
    const actualMinutes = sumTimelineDuration(actual.filter(event => event.kind === "production"));
    const unrecordedMinutes = findStandardSaDayGaps(actual, dayConfig)
        .reduce((sum, gap) => sum + gap.endMinute - gap.startMinute, 0);
    const speed = reconcileCurrentRnrSpeed();
    const pace = currentRnrPaceSummary();
    const complete = unrecordedMinutes === 0
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
        ${field(locale === "zh" ? "待补录分钟" : "Unrecorded minutes", formatNumber(unrecordedMinutes))}
        ${field(locale === "zh" ? "推断时间损失（分钟）" : "Inferred time loss (min)", round1(speed.inferredSaLossMinutes))}
        ${field(locale === "zh" ? "性能损失（分钟）" : "Performance loss (min)", round1(speed.performanceLossMinutes))}
        ${field(locale === "zh" ? "全程平均节拍" : "Full-run average cycle time", pace.averageCycleSec === undefined ? "-" : `${round1(pace.averageCycleSec)}s`)}
      </div>
    </section>
  `;
}
function renderRnrTimelineBars(stationId, productId) {
    const planned = getPlannedSaEvents(stationId, productId);
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const window = standardSaDayWindow(dayConfig);
    const actual = currentRnrActualEvents();
    const start = window.startMinute ?? 0;
    const duration = Math.max(window.durationMinutes, 1);
    const ticks = timelineTicks(duration);
    return `
    <div class="timeline-wrap rnr-comparison" data-rnr-timeline style="--rnr-timeline-width:${Math.max(960, (ticks.length - 1) * 150)}px;">
      <div class="rnr-axis">
        <span class="timeline-station">${t("station")}</span>
        <div class="rnr-axis-track">${ticks.map((minute, index) => `<span class="${index === ticks.length - 1 ? "end" : ""}" style="left:${(minute / duration * 100).toFixed(2)}%">${formatTimelineTick(start + minute, index === 0 ? undefined : start + ticks[index - 1])}</span>`).join("")}</div>
      </div>
      <div class="timeline-row"><div class="timeline-station">${locale === "zh" ? "计划" : "Planned"}<small>${escapeHtml(stationId)}</small></div><div class="timeline-track">${renderRnrOffShift(dayConfig, start, duration)}${planned.filter(event => event.stationId === stationId).map(event => renderTimelineSegment(event, start, duration)).join("")}</div></div>
      <div class="timeline-row"><div class="timeline-station">${locale === "zh" ? "实际" : "Actual"}<small>${escapeHtml(stationId)}</small></div><div class="timeline-track">${renderRnrOffShift(dayConfig, start, duration)}${actual.map(event => renderTimelineSegment(event, start, duration)).join("")}</div></div>
    </div>
    <p class="note">${locale === "zh" ? "实际轨道由现场记录构成；空白表示待补录，不自动计为停机。推断时间损失只在生产段内扣除，不与显式停机重复。" : "The actual track uses on-site records. Blank time is unrecorded, not downtime. Inferred loss is deducted only within production windows, never double-counted with explicit stops."}</p>
  `;
}
function renderRnrOffShift(config, startMinute, durationMinutes) {
    return standardSaOffShiftIntervals(config).map(interval => {
        const left = (interval.startMinute - startMinute) / durationMinutes * 100;
        const width = (interval.endMinute - interval.startMinute) / durationMinutes * 100;
        const label = locale === "zh" ? "非排班" : "Off shift";
        return `<span class="timeline-offshift" style="left:${left.toFixed(2)}%;width:${width.toFixed(2)}%;" title="${label}">${label}</span>`;
    }).join("");
}
function renderRnrActualEditor(stationId, productId, parameter, operation) {
    const events = currentRnrActualEvents();
    const window = standardSaDayWindow(getStandardSaDayConfig(productId, stationId));
    const issues = validatePlannedSaEvents(events, window);
    const pace = currentRnrPaceSummary();
    const loadSample = parameter && operation
        ? `<button class="button secondary" type="button" data-load-rnr-validation>${locale === "zh" ? "加载 R&R 验证样本" : "Load R&R validation sample"}</button>`
        : "";
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "实际时间段" : "Actual time intervals"}</h3><div class="panel-actions">${loadSample}<span class="section-label">${formatNumber(events.length)}</span></div></div>
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
        ${rnrAbnormalKinds.has(rnrActualKind) ? rnrInputField(locale === "zh" ? "可补救分钟" : "Recoverable minutes", "recoverableMinutes", String(rnrSegmentDraft.recoverableMinutes), "number") : ""}
        <div class="field"><label for="rnr-note">${locale === "zh" ? "原因 / 说明" : "Reason / note"}</label><input id="rnr-note" data-rnr-note value="${escapeHtml(rnrEventNote)}" /></div>
      </div>
      ${rnrDraftError ? `<p class="form-error" role="alert">${escapeHtml(rnrDraftError)}</p>` : ""}
      ${issues.length ? `<p class="form-error" role="alert">${issues.map(issue => escapeHtml(formatKnownText(issue.message))).join("<br>")}</p>` : ""}
      <div class="action-bar"><span>${rnrSelectedEventId ? (locale === "zh" ? "正在编辑已记录时间段" : "Editing a recorded interval") : (locale === "zh" ? "填完这一段后加入记录" : "Add this interval to the record")}</span>
        <div>${rnrSelectedEventId ? `<button type="button" class="button secondary" data-rnr-new>${locale === "zh" ? "取消编辑" : "Cancel edit"}</button>` : ""}
        <button type="button" class="button" data-rnr-save>${rnrSelectedEventId ? (locale === "zh" ? "保存修改" : "Save changes") : (locale === "zh" ? "添加时间段" : "Add interval")}</button></div>
      </div>
      ${renderRnrTimelineBars(stationId, productId)}
      <div class="table-wrap"><table><thead><tr>
        <th>${locale === "zh" ? "类型" : "Type"}</th><th>${t("startTime")}</th><th>${t("endTime")}</th><th>${t("elapsedMin")}</th><th>OK / NOK</th><th>${locale === "zh" ? "本段平均节拍" : "Segment average CT"}</th><th>${locale === "zh" ? "相对全程差异" : "Vs full-run"}</th><th>${locale === "zh" ? "原因 / 证据" : "Reason / evidence"}</th><th>${locale === "zh" ? "操作" : "Actions"}</th>
      </tr></thead><tbody>${events.length ? events.map(event => `<tr>
        <td><span class="actual-kind"><span class="kind-dot ${escapeHtml(event.kind)}" aria-hidden="true"></span>${formatTimelineKind(event.kind)}</span></td>
        <td>${escapeHtml(formatOptionalMinutePoint(event.startMinute))}</td><td>${escapeHtml(formatOptionalMinutePoint(event.endMinute))}</td>
        <td>${formatNumber(event.endMinute - event.startMinute)}</td><td>${event.kind === "production" ? `${formatOutputUnits(event.okQty ?? 0)} / ${formatOutputUnits(event.nokQty ?? 0)}` : "-"}</td>
        <td>${(() => { const segment = pace.segments.find(item => item.id === event.id); return segment?.averageCycleSec === undefined ? "-" : `${round1(segment.averageCycleSec)}s`; })()}</td>
        <td>${(() => { const segment = pace.segments.find(item => item.id === event.id); return escapeHtml(formatPaceVariance(segment?.deltaSec, segment?.deltaPercent)); })()}</td>
        <td>${escapeHtml([event.note, event.evidenceSource, event.isEstimated ? (locale === "zh" ? "估算" : "Estimated") : ""].filter(Boolean).join(" / ") || "-")}</td>
        <td><button type="button" class="button secondary" data-rnr-edit="${escapeHtml(event.id)}">${locale === "zh" ? "编辑" : "Edit"}</button>
        <button type="button" class="button secondary" data-rnr-delete="${escapeHtml(event.id)}">${t("deleteEvent")}</button></td>
      </tr>`).join("") : `<tr><td colspan="9">${locale === "zh" ? "尚无实际记录" : "No actual records yet"}</td></tr>`}</tbody></table></div>
    </section>
  `;
}
function boundedRecoverableMinutes(value, duration) {
    if (!Number.isFinite(value) || !Number.isFinite(duration))
        return 0;
    return Math.min(Math.max(0, duration), Math.max(0, Math.floor(value)));
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
    const plannedWindow = standardSaDayWindow(getStandardSaDayConfig(productId, stationId));
    const start = rnrSegmentDraft.startMinute;
    const end = rnrSegmentDraft.endMinute;
    if (end <= start || start < (plannedWindow.startMinute ?? 0) || end > (plannedWindow.endMinute ?? 0)) {
        rnrDraftError = locale === "zh" ? "实际时间段必须在标准观察窗口内，且结束晚于开始。" : "The interval must fit the observation window and end after it starts.";
        render(selectedProductId);
        return;
    }
    if (!intervalCoveredByShifts(start, end, standardSaShiftIntervals(getStandardSaDayConfig(productId, stationId)))) {
        rnrDraftError = locale === "zh" ? "实际时间段不能进入非排班。实跑轨迹不能长于已开班的计划。" : "An actual interval cannot enter off-shift time. The actual track cannot run longer than the scheduled plan.";
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
        ...(rnrAbnormalKinds.has(rnrActualKind) ? { isEstimated: rnrSegmentDraft.isEstimated, recoverableMinutes: boundedRecoverableMinutes(rnrSegmentDraft.recoverableMinutes, end - start) } : {}),
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
    rnrSegmentDraft.recoverableMinutes = event.recoverableMinutes ?? 0;
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
        ${metricCard(t("actualQty"), formatOutputUnits(calculation.actualQty), "OK + NOK", "neutral")}
        ${metricCard(t("observedCtSec"), `${round1(calculation.observedCycleSec)}s`, t("calculatedTile"), statusToneValue)}
        ${metricCard(t("expectedQty"), formatOutputUnits(calculation.expectedQtyAtStandard), t("calculatedTile"), "neutral")}
        ${metricCard(t("missingQty"), formatOutputUnits(calculation.missingQty), t("calculatedTile"), calculation.missingQty > 0 ? "warn" : "good")}
        ${metricCard(t("hiddenLossMin"), `${round1(calculation.hiddenLossMinutes)} ${t("minuteUnit")}`, t("calculatedTile"), calculation.hiddenLossMinutes > 0 ? "warn" : "good")}
        ${metricCard(t("performanceRate"), percent(calculation.performanceRate), t("calculatedTile"), statusToneValue)}
      </section>
    </section>
  `;
}
function renderCycleCheckRecord(parameter, operationId, stationId) {
    const zh = locale === "zh";
    const summary = summarizeCycleSamples(cycleCheckDraft);
    const diagnosis = diagnosePlannedCycle(summary, parameter && parameter.standardCycleSec > 0 ? parameter.standardCycleSec : undefined);
    const statusLabel = summary.legacyUnparsed
        ? (zh ? "原文待处理" : "Unparsed text kept")
        : summary.validCount > 0
            ? (zh ? "已算出均值" : "Mean ready")
            : summary.status === "empty"
                ? (zh ? "尚未录入" : "No samples")
                : (zh ? "尚无有效节拍" : "No valid laps");
    const slower = new Set(summary.slowerSampleIds);
    const rows = cycleCheckDraft.samples.map((sample, index) => {
        const editing = sample.id === editingCycleSampleId;
        const slow = slower.has(sample.id);
        const needsReason = sample.lineStop === true || sample.nok === true || slow;
        return `<li class="cycle-sample-row${sample.lineStop ? " is-stop" : ""}${slow ? " is-slow" : ""}">
      <span class="cycle-sample-index">${formatNumber(index + 1)}</span>
      ${editing
            ? `<input data-cycle-edit-input="${escapeHtml(sample.id)}" inputmode="numeric" value="${escapeHtml(String(stopwatchCode(sample.seconds)))}" aria-label="${zh ? "修改秒表数字" : "Edit stopwatch digits"}" />
           <button class="button" type="button" data-cycle-save="${escapeHtml(sample.id)}">${zh ? "保存" : "Save"}</button>
           <button class="button secondary" type="button" data-cycle-cancel>${zh ? "取消" : "Cancel"}</button>`
            : `<span class="cycle-sample-time">${escapeHtml(formatStopwatch(sample.seconds))}</span>
           <label class="cycle-mark"><input type="checkbox" data-cycle-nok="${escapeHtml(sample.id)}" ${sample.nok ? "checked" : ""} /> N.OK</label>
           <label class="cycle-mark"><input type="checkbox" data-cycle-stop="${escapeHtml(sample.id)}" ${sample.lineStop ? "checked" : ""} /> Stopping</label>
           ${slow ? `<span class="status warn">${zh ? "慢于平均" : "Slower than average"}</span>` : ""}
           ${needsReason ? `<input class="cycle-reason" data-cycle-reason="${escapeHtml(sample.id)}" value="${escapeHtml(sample.reason ?? "")}" placeholder="${zh ? "异常原因，可后补" : "Reason, optional for now"}" aria-label="${zh ? "这一拍的异常原因" : "Reason for this cycle"}" />` : ""}
           <button class="button secondary" type="button" data-cycle-edit="${escapeHtml(sample.id)}">${zh ? "修改" : "Edit"}</button>
           <button class="button secondary" type="button" data-cycle-delete="${escapeHtml(sample.id)}">${zh ? "删除" : "Delete"}</button>`}
    </li>`;
    }).join("");
    return `
    <section class="sub-card cycle-sample-panel" data-cycle-check>
      <div class="panel-head">
        <h3>${t("cycleCheckRecord")}</h3>
        <span class="status ${summary.validCount > 0 && !summary.legacyUnparsed ? "good" : "warn"}" data-cycle-status>${statusLabel}</span>
      </div>
      <p class="note">${t("cycleCheckNote")}</p>
      <div class="field-grid" data-cycle-counts>
        ${field(zh ? "计划节拍" : "Planned CT", diagnosis.hasPlannedCycle ? formatStopwatch(diagnosis.plannedCycleSec ?? 0) : (zh ? "无" : "None"))}
        ${field(zh ? "观察均值" : "Observed mean", summary.observedMeanSec === undefined ? "-" : formatStopwatch(summary.observedMeanSec))}
        ${field(zh ? "采集" : "Collected", formatNumber(summary.recordedCount))}
        ${field(zh ? "有效" : "Valid", formatNumber(summary.validCount))}
        ${field(zh ? "去除" : "Excluded", formatNumber(summary.excludedCount))}
        ${field(zh ? "去除时长" : "Excluded time", formatStopwatch(summary.lineStopSeconds))}
      </div>
      <p class="note">${zh ? "采集是已经录入的拍。有效的进入平均。去除是勾了 Stopping 的拍数。去除时长是这些拍的秒表时间合计，只记中断，不进平均。" : "Collected means entered laps. Valid laps enter the average. Excluded is the number of Stopping laps. Excluded time is their stopwatch total: an interruption, kept out of the average."}</p>
      <form class="cycle-sample-add" data-cycle-add>
        <label>${zh ? "秒表数字" : "Stopwatch digits"}
          <input name="seconds" inputmode="numeric" autocomplete="off" placeholder="337" aria-label="${zh ? "秒表数字" : "Stopwatch digits"}" />
        </label>
        <p class="cycle-entry-hint">${zh ? "只填秒表上的数字，不要写冒号或小数点。337 会显示为 00:03.37，按 3.37 秒计算。超过 1 分钟写成 10337，即 01:03.37。" : "Type only the digits on the stopwatch, without a colon or decimal point. 337 is shown as 00:03.37 and counted as 3.37 seconds. Past one minute, 10337 means 01:03.37."}</p>
        <button class="button" type="submit">${zh ? "新增" : "Add"}</button>
      </form>
      ${summary.legacyUnparsed ? `<p class="form-error" role="alert">${zh ? "旧草稿里有无法解析的节拍原文，已保留且不计入均值：" : "Unparsed cycle text from an older draft was kept and excluded from the mean:"} ${escapeHtml(summary.legacyUnparsed)}</p>` : ""}
      ${diagnosis.fasterThanPlanned ? `<p class="form-error" role="alert">${zh ? "样本均值快于计划 CT。请先复核循环边界、产出件数和每循环件数。现有 CT 可以保持；只有确认后才会写入。" : "The sample mean is faster than the planned CT. Review the cycle boundary, output count and pieces per cycle first. The current CT can stay; it changes only after confirmation."}</p>` : ""}
      ${renderCycleCorrection(diagnosis, summary, operationId, stationId)}
      ${rnrDraftError ? `<p class="form-error" role="alert">${escapeHtml(rnrDraftError)}</p>` : ""}
      ${rows ? `<ol class="cycle-sample-list" data-cycle-sample-list>${rows}</ol>` : `<p class="note" data-cycle-sample-list>${zh ? "还没有已提交的样本。未提交的输入不会保存。" : "No committed samples yet. An unsubmitted entry is not saved."}</p>`}
      ${diagnosis.hasPlannedCycle ? "" : renderInitialPresetPanel(operationId, stationId, summary)}
    </section>
  `;
}
function renderCycleCorrection(diagnosis, summary, operationId, stationId) {
    const zh = locale === "zh";
    const mean = summary.observedMeanSec;
    if (!diagnosis.hasPlannedCycle) {
        return `<p class="note">${zh ? "当前没有有效计划 CT，不会用默认秒数代替。有计入平均的节拍后，在下面确认 CT、每循环件数和 P。P 默认 100%，改成其他有效值时会提示这是人工判断，并再确认一次才写入。不必为了写入再进入第四阶段。" : "No effective planned CT. A default number of seconds is not used. After at least one lap is in the average, confirm CT, pieces per cycle and P below. P defaults to 100%. Another valid value warns that it is a judgement, then asks for a second confirmation. Stage 4 is not required for the write."}</p>`;
    }
    const delta = diagnosis.deltaSec === undefined ? "-" : `${diagnosis.deltaSec > 0 ? "+" : ""}${formatNumber(diagnosis.deltaSec, 1)} ${zh ? "秒" : "s"}`;
    const proposed = mean === undefined ? undefined : Math.round(mean * 100) / 100;
    const unchanged = proposed !== undefined && Math.abs(proposed - (diagnosis.plannedCycleSec ?? 0)) < 0.005;
    if (mean === undefined || proposed === undefined) {
        const stoppedAll = summary.excludedCount > 0;
        return `${stoppedAll
            ? `<p class="note">${zh ? `N.OK 算有效节拍，会进入平均。Stopping 不进平均。这些拍都勾了 Stopping 之后，没有剩下的有效节拍，所以不能矫正计划 CT。取消 Stopping 后，只要还有有效节拍，矫正会回到这里。` : `N.OK counts as a valid lap and stays in the average. Stopping stays out. Every lap is Stopping, so no valid lap remains and planned CT cannot be corrected. Clear Stopping and the correction returns when a valid lap remains.`}</p>`
            : `<p class="note">${zh ? `当前计划 CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} 秒。还没有可计入平均的节拍，不能矫正。N.OK 算有效节拍。` : `Planned CT is ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} s. There is no lap in the average yet, so CT cannot be corrected. N.OK counts as a valid lap.`}</p>`}
      <div class="action-bar" data-correct-planned-ct-hold><button class="button secondary" type="button" disabled>${zh ? "矫正计划 CT" : "Correct planned CT"}</button></div>`;
    }
    if (unchanged) {
        return `<p class="note">${summary.excludedCount > 0
            ? (zh ? `N.OK 仍算有效节拍。去掉 Stopping 后，剩下的有效节拍均值与计划 CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} 秒一致，所以不必矫正。` : `N.OK still counts as a valid lap. After Stopping is removed, the remaining mean matches planned CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} s, so no correction is needed.`)
            : (zh ? `当前计划 CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} 秒，与观察均值一致，无需矫正。N.OK 算有效节拍。` : `Planned CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} s already matches the observed mean. N.OK counts as a valid lap.`)}</p>
      <div class="action-bar" data-correct-planned-ct-hold><button class="button secondary" type="button" disabled>${zh ? "矫正计划 CT" : "Correct planned CT"}</button></div>`;
    }
    const linkedWindow = performanceAgainstCycle(proposed, productionLapsFor(operationId, stationId));
    const windowNote = linkedWindow
        ? (zh ? "这一工站已有时间窗生产记录。确认写入后，按这些记录和新 CT 重算 P。Q 和每循环件数不变，时间窗的时钟、数量和停机原因保留。" : "This station already has time-window production. After confirmation, P is recalculated from those records and the new CT. Q and pieces per cycle stay unchanged. Clocks, quantities and stop reasons stay as recorded.")
        : (zh ? "这一工站还没有可重算的时间窗生产记录，P、Q 和每循环件数不变。" : "This station has no time-window production to recalculate, so P, Q and pieces per cycle stay unchanged.");
    return `<p class="note">${zh ? `当前计划 CT ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} 秒，与观察均值相差 ${delta}。现有 CT 可以保持。点「矫正计划 CT」后，还要在弹出框里再确认一次才会写入；取消则不变。${windowNote}不必进入第四阶段。` : `Planned CT is ${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} s, delta ${delta}. The current CT can stay. Correct planned CT opens a confirmation; it is written only if that popup is confirmed. ${windowNote} Stage 4 is not required.`}</p>
    <form data-correct-planned-ct data-operation-id="${escapeHtml(operationId)}" data-station-id="${escapeHtml(stationId)}" data-planned-cycle-sec="${diagnosis.plannedCycleSec ?? 0}">
      <div class="field" style="max-width:280px;"><label>${zh ? "若矫正，采用的 CT（秒）" : "CT to use if correcting (sec)"}</label><input name="standardCycleSec" type="number" min="0.0001" step="any" required value="${proposed}" /></div>
      <div class="action-bar"><button class="button secondary" type="submit">${zh ? "矫正计划 CT" : "Correct planned CT"}</button></div>
      <dialog class="ct-confirm" data-ct-confirm>
        <h3>${zh ? "确认写入计划 CT" : "Confirm the planned CT write"}</h3>
        <p data-ct-confirm-copy></p>
        <div class="action-bar">
          <button class="button secondary" type="button" data-ct-cancel>${zh ? "取消" : "Cancel"}</button>
          <button class="button" type="button" data-ct-commit>${zh ? "确认写入" : "Write it"}</button>
        </div>
      </dialog>
    </form>`;
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
let ignoreValidationLoadClick = false;
function armIgnoreValidationLoadClick() {
    ignoreValidationLoadClick = true;
    setTimeout(() => { ignoreValidationLoadClick = false; }, 0);
}
function bindRnrTracking() {
    rnrRoot.querySelector("[data-load-rnr-validation]")?.addEventListener("click", () => {
        if (ignoreValidationLoadClick)
            return;
        const productId = selectedProductId;
        const operationId = selectedOperationId;
        const stationId = selectedWorkflowStationId;
        const existingActual = rnrActualEventsByContext.get(`${actualScopeKey(productId, operationId, stationId)}`) ?? [];
        if (existingActual.length && !window.confirm(locale === "zh"
            ? "加载验证样本会替换当前工站已有的实际记录。标准 SA 计划不会改变。继续吗？"
            : "Loading the validation sample replaces this station's actual records. The standard SA plan stays unchanged. Continue?"))
            return;
        const parameter = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operationId, stationId);
        if (!parameter)
            return;
        const observation = standardSaDayWindow(getStandardSaDayConfig(productId, stationId));
        if (observation.durationMinutes < RNR_VALIDATION_WINDOW_MINUTES) {
            rnrDraftError = locale === "zh"
                ? "当前标准观察窗口短于 24 小时，放不下验证样本。请先在标准 SA 设定中调整窗口。"
                : "The current standard window is shorter than 24 hours, so the validation sample does not fit. Adjust it in Standard SA setup.";
            render(selectedProductId);
            return;
        }
        const fixture = createRnrValidationFixture(productId, stationId, parameter.standardCycleSec, parameter.piecesPerCycle);
        const dayConfig = getStandardSaDayConfig(productId, stationId);
        const actual = placeFixtureActualsOnWindow(fixture.actual, observation.startMinute);
        const shifts = standardSaShiftIntervals(dayConfig);
        if (actual.some(event => event.startMinute < observation.startMinute || event.endMinute > observation.endMinute
            || !intervalCoveredByShifts(event.startMinute, event.endMinute, shifts))) {
            rnrDraftError = locale === "zh"
                ? "当前标准 SA 还有非排班时段，24 小时验证样本会跑进未开班时间，无法和计划比对。请先在标准 SA 设定中排满观察窗口，例如 12 小时 × 2 班或 8 小时 × 3 班。"
                : "The standard SA still has off-shift time, so the 24-hour sample would run beyond the scheduled plan and cannot be compared. Fill the observation window in Standard SA setup, for example two 12-hour shifts or three 8-hour shifts.";
            render(selectedProductId);
            return;
        }
        rnrDraftError = "";
        const actualKey = `${actualScopeKey(productId, operationId, stationId)}`;
        rnrContextKey = actualKey;
        rnrActualEventsByContext.set(actualKey, actual);
        validationFixtureContexts.add(actualKey);
        confirmedSuggestions.clear();
        calibrationActionError = "";
        cycleCheckDraft = {
            samples: fixture.cycleSamplesSec.map((seconds, index) => ({ id: `fixture-${stationId}-${index + 1}`, seconds })),
            targetSamples: fixture.cycleSamplesSec.length,
        };
        editingCycleSampleId = "";
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
    rnrRoot.querySelector("[data-cycle-add]")?.addEventListener("submit", event => {
        event.preventDefault();
        const input = event.currentTarget.querySelector("input[name='seconds']");
        const next = addCycleSample(cycleCheckDraft, input?.value ?? "");
        if (next.error) {
            rnrDraftError = locale === "zh" ? "请输入秒表上的数字，例如 337 表示 00:03.37。空值或小数不会进入均值。" : "Type the stopwatch digits, for example 337 for 00:03.37. Empty values and decimals stay out of the mean.";
        }
        else {
            cycleCheckDraft = next.draft;
            rnrDraftError = "";
        }
        render(selectedProductId);
    });
    rnrRoot.querySelectorAll("[data-cycle-edit]").forEach(button => button.addEventListener("click", () => {
        editingCycleSampleId = button.dataset.cycleEdit ?? "";
        rnrDraftError = "";
        render(selectedProductId);
    }));
    rnrRoot.querySelector("[data-cycle-cancel]")?.addEventListener("click", () => {
        editingCycleSampleId = "";
        render(selectedProductId);
    });
    rnrRoot.querySelectorAll("[data-cycle-save]").forEach(button => button.addEventListener("click", () => {
        const id = button.dataset.cycleSave ?? "";
        const input = rnrRoot.querySelector(`[data-cycle-edit-input="${CSS.escape(id)}"]`);
        const next = replaceCycleSample(cycleCheckDraft, id, input?.value ?? "");
        if (next.error) {
            rnrDraftError = locale === "zh" ? "请输入秒表上的数字，例如 337 表示 00:03.37。空值或小数不会进入均值。" : "Type the stopwatch digits, for example 337 for 00:03.37. Empty values and decimals stay out of the mean.";
        }
        else {
            cycleCheckDraft = next.draft;
            editingCycleSampleId = "";
            rnrDraftError = "";
        }
        render(selectedProductId);
    }));
    rnrRoot.querySelectorAll("[data-cycle-delete]").forEach(button => button.addEventListener("click", () => {
        cycleCheckDraft = removeCycleSample(cycleCheckDraft, button.dataset.cycleDelete ?? "");
        if (editingCycleSampleId === button.dataset.cycleDelete)
            editingCycleSampleId = "";
        rnrDraftError = "";
        render(selectedProductId);
    }));
    rnrRoot.querySelectorAll("[data-cycle-nok], [data-cycle-stop]").forEach(input => {
        input.addEventListener("change", () => {
            const mark = input.dataset.cycleNok !== undefined ? "nok" : "lineStop";
            const id = input.dataset.cycleNok ?? input.dataset.cycleStop ?? "";
            cycleCheckDraft = setCycleSampleMark(cycleCheckDraft, id, mark, input.checked);
            render(selectedProductId);
        });
    });
    rnrRoot.querySelectorAll("[data-cycle-reason]").forEach(input => {
        input.addEventListener("change", () => {
            cycleCheckDraft = setCycleSampleReason(cycleCheckDraft, input.dataset.cycleReason ?? "", input.value);
            render(selectedProductId);
        });
    });
    rnrRoot.querySelector("[data-correct-planned-ct]")?.addEventListener("submit", event => {
        event.preventDefault();
        openPlannedCycleCorrection(event.currentTarget);
    });
    rnrRoot.querySelector("[data-initial-preset]")?.addEventListener("submit", event => {
        event.preventDefault();
        submitInitialPreset(event.currentTarget);
    });
}
function productionLapsFor(operationId, stationId) {
    return (rnrActualEventsByContext.get(actualScopeKey(selectedProductId, operationId, stationId)) ?? [])
        .filter(event => event.kind === "production")
        .map(event => ({
        startMinute: event.startMinute,
        endMinute: event.endMinute,
        okQty: event.okQty ?? 0,
        nokQty: event.nokQty ?? 0,
        piecesPerCycle: event.piecesPerCycle ?? 0,
    }));
}
function openPlannedCycleCorrection(form) {
    const fields = new FormData(form);
    const operation = form.dataset.operationId ?? "";
    const station = form.dataset.stationId ?? "";
    const dialog = form.querySelector("[data-ct-confirm]");
    const copy = form.querySelector("[data-ct-confirm-copy]");
    if (!dialog || !copy)
        return;
    const samplesBefore = cycleCheckDraft.samples.map(sample => ({ ...sample }));
    const plannedBefore = JSON.stringify(getPlannedSaEvents(station, selectedProductId));
    const laps = productionLapsFor(operation, station);
    const previous = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operation, station);
    try {
        const next = correctPlannedCycleFromCheck({
            operationId: operation,
            stationId: station,
            existingParameters: scenarioState.operationStationParameters ?? [],
            standardCycleSec: Number(fields.get("standardCycleSec")),
            ctConfirmed: true,
            samples: cycleCheckDraft,
            evidenceRef: `cycle-check:${selectedProductId}:${operation}:${station}`,
            parameterId: `local-baseline-${Date.now()}-${++localBaselineVersionCounter}`,
            effectiveFrom: todayDateValue(),
            timeWindowProduction: laps,
            windowEvidenceRef: `time-window:${selectedProductId}:${operation}:${station}`,
        });
        if (JSON.stringify(getPlannedSaEvents(station, selectedProductId)) !== plannedBefore) {
            throw new Error(locale === "zh" ? "标准 SA 时间轴不应改变。" : "The planned SA timeline must stay unchanged.");
        }
        const plannedSec = Number(form.dataset.plannedCycleSec);
        const linked = performanceAgainstCycle(next.standardCycleSec, laps);
        const previousP = previous?.performanceRate ?? next.performanceRate;
        const pSentence = linked
            ? (linked.fasterThanCorrectedCt
                ? (locale === "zh"
                    ? `上一轮时间窗快于新 CT，观察节拍 ${formatStopwatch(linked.observedCycleSec)}。P 从 ${percent(previousP)} 改为 ${percent(linked.performanceRate)}，不超过 100%。请复核产出数量和循环边界。`
                    : `The previous time window is faster than the new CT; observed cycle ${formatStopwatch(linked.observedCycleSec)}. P changes from ${percent(previousP)} to ${percent(linked.performanceRate)} and is not raised above 100%. Review output quantity and the cycle boundary.`)
                : (locale === "zh"
                    ? `上一轮时间窗按新 CT 重算：观察节拍 ${formatStopwatch(linked.observedCycleSec)}，P 从 ${percent(previousP)} 改为 ${percent(linked.performanceRate)}。`
                    : `The previous time window is recalculated against the new CT: observed cycle ${formatStopwatch(linked.observedCycleSec)}, P changes from ${percent(previousP)} to ${percent(linked.performanceRate)}.`))
            : (locale === "zh"
                ? `这一工站还没有可重算的时间窗生产记录，P 保持 ${percent(previousP)}。`
                : `This station has no time-window production to recalculate, so P stays ${percent(previousP)}.`);
        copy.textContent = locale === "zh"
            ? `现有计划 CT 是 ${formatStopwatch(plannedSec)}。确认后改为 ${formatStopwatch(next.standardCycleSec)}（${formatNumber(next.standardCycleSec)} 秒）。${pSentence}Q 和每循环件数不变。时间窗的时钟、数量和停机原因保留。先前按旧 CT 确认过的 P 不再沿用。这不是上游主数据批准。原始节拍样本和标准 SA 时间轴保持不变。`
            : `Planned CT is ${formatStopwatch(plannedSec)}. After confirmation it becomes ${formatStopwatch(next.standardCycleSec)} (${formatNumber(next.standardCycleSec)} s). ${pSentence} Q and pieces per cycle stay unchanged. Time-window clocks, quantities and stop reasons stay as recorded. A P previously confirmed against the old CT is not kept. This is not upstream master-data approval. Raw samples and the planned SA timeline stay unchanged.`;
        pendingCycleCorrection = next;
        const commitButton = form.querySelector("[data-ct-commit]");
        const cancelButton = form.querySelector("[data-ct-cancel]");
        const detach = () => {
            commitButton?.removeEventListener("click", commit);
            cancelButton?.removeEventListener("click", cancel);
            dialog.removeEventListener("cancel", dismiss);
        };
        const commit = () => {
            const saving = pendingCycleCorrection;
            pendingCycleCorrection = undefined;
            detach();
            dialog.close();
            if (!saving)
                return;
            saveLocalState(localBaselineStorageKey(selectedProductId, operation, station), JSON.stringify(saving));
            scenarioState.operationStationParameters ??= [];
            scenarioState.operationStationParameters.push(saving);
            for (const [id, saved] of confirmedSuggestions) {
                if (saved.suggestion.operationId === operation && saved.suggestion.stationId === station && saved.suggestion.target === "performanceRate") {
                    confirmedSuggestions.delete(id);
                }
            }
            cycleCheckDraft = { ...cycleCheckDraft, samples: samplesBefore };
            rnrDraftError = "";
            calibrationActionError = "";
            render(selectedProductId);
        };
        const dismiss = () => {
            pendingCycleCorrection = undefined;
            detach();
        };
        const cancel = () => {
            dismiss();
            dialog.close();
        };
        commitButton?.addEventListener("click", commit);
        cancelButton?.addEventListener("click", cancel);
        dialog.addEventListener("cancel", dismiss);
        setTimeout(() => {
            if (pendingCycleCorrection !== next || dialog.open)
                return;
            dialog.showModal();
        }, 0);
    }
    catch (error) {
        pendingCycleCorrection = undefined;
        rnrDraftError = error instanceof Error ? error.message : String(error);
        render(selectedProductId);
    }
}
function submitInitialPreset(form) {
    const fields = new FormData(form);
    const operation = form.dataset.operationId ?? "";
    const station = form.dataset.stationId ?? "";
    const samplesBefore = cycleCheckDraft.samples.map(sample => ({ ...sample }));
    const plannedBefore = JSON.stringify(getPlannedSaEvents(station, selectedProductId));
    try {
        const performancePercent = Number(fields.get("performanceRatePercent"));
        const performanceRate = performancePercent / 100;
        const manualOverride = Math.abs(performanceRate - 1) > 1e-9;
        if (manualOverride) {
            const warning = locale === "zh"
                ? `P ${formatNumber(performancePercent, 1)}% 是人工判断，尚非时间窗实跑推导。取消则不写入。要继续确认吗？`
                : `P ${formatNumber(performancePercent, 1)}% is a manual judgement, not derived from a time window. Cancel writes nothing. Continue to the confirmation?`;
            if (!globalThis.confirm(warning))
                return;
        }
        const next = establishInitialLocalPreset({
            operationId: operation,
            stationId: station,
            existingParameters: scenarioState.operationStationParameters ?? [],
            standardCycleSec: Number(fields.get("standardCycleSec")),
            piecesPerCycle: Number(fields.get("piecesPerCycle")),
            performanceRate,
            performanceReviewed: true,
            performanceOverrideConfirmed: manualOverride,
            samples: cycleCheckDraft,
            evidenceRef: `cycle-check:${selectedProductId}:${operation}:${station}`,
            parameterId: `local-baseline-${Date.now()}-${++localBaselineVersionCounter}`,
            effectiveFrom: todayDateValue(),
        });
        if (JSON.stringify(getPlannedSaEvents(station, selectedProductId)) !== plannedBefore) {
            throw new Error(locale === "zh" ? "标准 SA 时间轴不应改变。" : "The planned SA timeline must stay unchanged.");
        }
        const confirmation = locale === "zh"
            ? `建立本地初始预设？\nCT ${formatNumber(next.standardCycleSec)} 秒，每循环 ${formatNumber(next.piecesPerCycle)} 件。P ${percent(next.performanceRate)}${manualOverride ? "，人工判断，不是时间窗实跑推导" : "，默认 100%"}。\n这不是上游主数据批准。原始节拍样本和标准 SA 时间轴保持不变。生效后，周/月件数从生效日起按新参数计算。`
            : `Establish a local initial preset?\nCT ${formatNumber(next.standardCycleSec)}s, ${formatNumber(next.piecesPerCycle)} pcs/cycle. P ${percent(next.performanceRate)}${manualOverride ? ", a manual judgement rather than a time-window result" : ", the 100% default"}.\nThis is not upstream master-data approval. Raw samples and the planned SA timeline stay unchanged. Week and month pieces use the new parameter from its effective date.`;
        if (!globalThis.confirm(confirmation))
            return;
        saveLocalState(localBaselineStorageKey(selectedProductId, operation, station), JSON.stringify(next));
        scenarioState.operationStationParameters ??= [];
        scenarioState.operationStationParameters.push(next);
        cycleCheckDraft = { ...cycleCheckDraft, samples: samplesBefore };
        rnrDraftError = "";
        calibrationActionError = "";
        render(selectedProductId);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (form.closest("[data-cycle-check]"))
            rnrDraftError = message;
        else
            calibrationActionError = message;
        render(selectedProductId);
    }
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
    else if (fieldName === "recoverableMinutes") {
        rnrSegmentDraft.recoverableMinutes = boundedRecoverableMinutes(Number(value), rnrSegmentDraft.endMinute - rnrSegmentDraft.startMinute);
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
    render(selectedProductId);
}
function round1(value) {
    return formatNumber(value, 1);
}
function renderRouteWeekReportPanel(routingConfig) {
    const zh = locale === "zh";
    const product = routingConfig.product;
    const stationId = routingConfig.operations.flatMap(operation => operation.assignments).find(view => view.planningStatus === "available")?.assignment.stationId ?? selectedWorkflowStationId;
    const draftWeek = stationId && stationId !== "-" ? getCopyProjectionDraft(routingConfig.productId, stationId).weekStartDate : "";
    const demandDefault = product?.weeklyDemand === undefined ? "" : String(product.weeklyDemand);
    return `<section class="sub-card" style="margin-top:14px;" data-route-week-report>
    <div class="panel-head"><h3>${zh ? "路线周计划报告" : "Route week plan report"}</h3><span class="pill warn">${zh ? "内部草稿 · 当前参数回算" : "Internal draft · current-parameter recalculation"}</span></div>
    <p class="note">${zh ? "两页分别读取各工站已生成的那一周周账，不共用一套动作损失。48 小时 R&R 不会被扩成整周 Actual。没有历史计划快照，件数按当前已发布参数回算。刷新后周账快照不保留。静态 report-preview.html 的示例数字不会进入这里。" : "Each page reads the week ledger generated for that week. A 48-hour R&R is not expanded into a week actual. Pieces are recalculated with current published parameters. Refresh drops the week snapshots. Demo numbers in report-preview.html are not used."}</p>
    <div data-report-gap-host="report"></div>
    <div class="field-grid">
      <div class="field"><label>${zh ? "下周起始日期" : "Next week start"}</label><input type="date" data-report-week value="${escapeHtml(draftWeek)}" /></div>
      <div class="field"><label>${zh ? "周需求（件）" : "Weekly demand (pcs)"}</label><input type="number" min="0" step="1" data-report-demand value="${escapeHtml(demandDefault)}" /></div>
    </div>
    <p class="note">${zh ? "回顾页用这个日期的前一周。需求默认取产品主数据的周需求，可以改；留空则不计算余量。" : "The review page uses the previous week. Demand defaults to the product master weekly demand and can be changed. Leave it blank to skip the margin."}</p>
    <div class="action-bar"><button class="button" type="button" data-route-week-open>${zh ? "查看 / 打印 PDF" : "View / print PDF"}</button></div>
    <p class="form-error" data-route-week-error hidden></p>
    <dialog class="route-week-report" data-route-week-dialog>
      <div class="report-toolbar"><strong>${zh ? "内部产能决策报告" : "Internal capacity report"}</strong><div class="action-bar">
        <button class="button" type="button" data-route-week-print>${zh ? "打印 / PDF" : "Print / PDF"}</button>
        <button class="button secondary" type="button" data-route-week-close>${zh ? "关闭" : "Close"}</button>
      </div></div>
      <div data-route-week-body></div>
    </dialog>
  </section>`;
}
function bindRouteWeekReport(routingConfig) {
    const dialog = calibrationRoot.querySelector("[data-route-week-dialog]");
    calibrationRoot.querySelector("[data-route-week-open]")?.addEventListener("click", () => {
        openRouteWeekReport(routingConfig, dialog);
    });
    dialog?.querySelector("[data-route-week-close]")?.addEventListener("click", () => dialog.close());
    dialog?.querySelector("[data-route-week-print]")?.addEventListener("click", () => {
        const body = dialog.querySelector("[data-route-week-body]");
        const printRoot = document.querySelector("#routeWeekPrintRoot");
        if (!body || !printRoot)
            return;
        printRoot.innerHTML = body.innerHTML;
        printRoot.hidden = false;
        document.body.classList.add("printing-week-report");
        const done = () => {
            document.body.classList.remove("printing-week-report");
            printRoot.hidden = true;
            printRoot.innerHTML = "";
            window.removeEventListener("afterprint", done);
        };
        window.addEventListener("afterprint", done);
        window.print();
    });
}
function openRouteWeekReport(routingConfig, dialog) {
    const zh = locale === "zh";
    const error = calibrationRoot.querySelector("[data-route-week-error]");
    const weekStart = calibrationRoot.querySelector("[data-report-week]")?.value ?? "";
    const demandRaw = calibrationRoot.querySelector("[data-report-demand]")?.value ?? "";
    const fail = (message) => {
        if (!error)
            return;
        error.hidden = false;
        error.textContent = message;
    };
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
        fail(zh ? "请先选择下周起始日期。" : "Choose the next week start date.");
        return;
    }
    const demandQty = demandRaw === "" ? undefined : Number(demandRaw);
    if (demandQty !== undefined && (!Number.isSafeInteger(demandQty) || demandQty < 0)) {
        fail(zh ? "周需求必须是非负整数，或留空。" : "Weekly demand must be a nonnegative integer, or blank.");
        return;
    }
    if (error)
        error.hidden = true;
    const review = routeWeekPlanFor(routingConfig, addDays(weekStart, -7), "review", demandQty);
    const outlook = routeWeekPlanFor(routingConfig, weekStart, "outlook", demandQty);
    const product = routingConfig.product;
    const html = renderRouteWeekSheets({
        zh, review, outlook,
        productName: product?.name ?? routingConfig.productId,
        productVersion: product?.version ?? "",
        routeId: routingConfig.route?.routeId ?? "-",
        generatedAt: new Date().toISOString().slice(0, 16).replace("T", " "),
        weekEnd: start => addDays(start, 7),
    });
    const body = dialog?.querySelector("[data-route-week-body]");
    if (!dialog || !body)
        return;
    body.innerHTML = html;
    dialog.showModal();
}
function routeWeekPlanFor(routingConfig, weekStart, role, demandQty) {
    const zh = locale === "zh";
    const routeId = routingConfig.route?.routeId ?? "";
    const parameters = scenarioState.operationStationParameters ?? [];
    const stations = routingConfig.operations.flatMap(operation => operation.assignments.filter(view => view.planningStatus === "available").map(view => {
        const stationId = view.assignment.stationId;
        const operationId = operation.operation.operationId;
        const snap = stationWeekSnapshots.get(`${planScopeKey(routingConfig.productId, stationId)}::${weekStart}`);
        const capacity = snap ? buildPeriodCapacity({
            operationId, stationId, parameters,
            days: snap.days.map((day, index) => ({
                date: day.date, workingDay: day.workingDay, stale: day.stale,
                bestCaseProductionMinutes: day.productionMinutes,
                mostLikelyProductionMinutes: day.workingDay && !day.stale
                    ? Math.max(0, day.productionMinutes - snap.perShiftUnplanned * (snap.shiftCounts[index] ?? 0)) : 0,
            })),
        }) : undefined;
        return {
            productId: routingConfig.productId,
            routeId,
            operationId,
            stationId,
            weekStartDate: weekStart,
            ledgerPresent: Boolean(snap),
            ...(capacity ? { capacity } : {}),
            ...(view.assignment.plannedShare === undefined ? {} : { plannedShare: view.assignment.plannedShare }),
            ...(view.assignment.allocationMode ? { allocationMode: view.assignment.allocationMode } : {}),
            ...(snap?.withBreaksSa === undefined ? {} : { withBreaksSa: snap.withBreaksSa }),
            ...(snap?.mostLikelySa === undefined ? {} : { mostLikelySa: snap.mostLikelySa }),
            planBasis: "currentParameterRecalc",
        };
    }));
    const requirements = routingConfig.route ? routingConfig.operations.map(item => resolveOperationOutputRequirement(scenarioState, routingConfig.route, item.operation, weekStart, addDays(weekStart, 6))) : [];
    const issueText = {
        stage_bom_missing: zh ? "缺少阶段 BOM" : "Stage BOM missing",
        stage_bom_mismatch: zh ? "阶段 BOM 不匹配" : "Stage BOM mismatch",
        source_not_effective: zh ? "来源版本未生效" : "Source not effective",
        quantity_missing: zh ? "缺少工序用量" : "Quantity missing",
        quantity_invalid: zh ? "工序用量无效" : "Invalid quantity",
    };
    return buildRouteWeekPlan({
        productId: routingConfig.productId,
        routeId,
        weekStartDate: weekStart,
        role,
        ...(demandQty === undefined ? {} : { demandQty }),
        stations,
        operationOrder: routingConfig.operations.map(item => item.operation.operationId),
        ...(routingConfig.route?.stationFlowPolicies?.length ? { stationFlowPolicies: routingConfig.route.stationFlowPolicies } : {}),
        operationUnits: requirements.map(item => ({
            operationId: item.operationId,
            ...(item.unitsPerFinishedProduct === undefined ? {} : { unitsPerFinishedProduct: item.unitsPerFinishedProduct }),
            ...(item.issue ? { issue: issueText[item.issue] ?? item.issue } : {}),
        })),
        ...(role === "review" ? { actual: { completeSameWeek: false, note: zh ? "本机每工站只有一份草稿，不是历史整周归档。48 小时 R&R 不能按比例扩成整周 Actual。" : "Each station has one local draft, not a historical full-week archive. A 48-hour R&R is not scaled up to a week actual." } } : {}),
    });
}
function renderCalibration(selectedOperation, routingConfig) {
    const routePanel = renderRouteWindowCapacityPanel(routingConfig);
    const reportPanel = renderRouteWeekReportPanel(routingConfig);
    const assignment = selectedOperation?.assignments.find(item => item.assignment.stationId === selectedWorkflowStationId)
        ?? selectedOperation?.assignments.find(item => item.planningStatus === "available");
    const stationId = selectedWorkflowStationId || "-";
    if (stationId === "-") {
        calibrationRoot.innerHTML = `${currentStationHead(t("stageCalibration"), t("calibrationTitle"))}${emptyState(t("stationRequired"))}${routePanel}${reportPanel}<p class="note">${t("capacityPreviewOnly")}</p>`;
        bindRouteWindowControls(selectedOperation, routingConfig);
        bindRouteWeekReport(routingConfig);
        return;
    }
    const productId = assignment?.assignment.productId ?? selectedProductId;
    const events = getPlannedSaEvents(stationId, productId);
    if (!events.length) {
        calibrationRoot.innerHTML = `${currentStationHead(t("stageCalibration"), t("calibrationTitle"))}${emptyState(t("baselineRequired"))}${routePanel}${reportPanel}<p class="note">${t("capacityPreviewOnly")}</p>`;
        bindRouteWindowControls(selectedOperation, routingConfig);
        bindRouteWeekReport(routingConfig);
        return;
    }
    const dayConfig = getStandardSaDayConfig(productId, stationId);
    const window = standardSaDayWindow(dayConfig);
    const offShiftIntervals = standardSaOffShiftIntervals(dayConfig);
    const baseline = summarizeStandardSaDay(events, dayConfig);
    const baselineValid = !validateStandardSaDay(events, dayConfig).length;
    const actualEvents = rnrActualEventsByContext.get(actualScopeKey(productId, selectedOperation?.operation.operationId ?? "", stationId)) ?? [];
    const hasActualRecord = actualEvents.length > 0;
    const productionEvents = actualEvents.filter(event => event.kind === "production");
    const actualQty = productionEvents.reduce((sum, event) => sum + (event.okQty ?? 0) + (event.nokQty ?? 0), 0);
    const okQty = productionEvents.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
    const qualityRate = actualQty > 0 ? okQty / actualQty : undefined;
    const cycleSummary = summarizeCycleSamples(cycleCheckDraft);
    const samples = cycleSummary.orderedSeconds;
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
            offShiftIntervals,
        });
    }
    catch (error) {
        reconciliationError = error instanceof Error ? error.message : String(error);
    }
    const evidence = reconciliation ? buildRnrEvidence({
        productId, operationId: selectedOperation?.operation.operationId ?? "", stationId,
        startMinute: window.startMinute ?? 0, endMinute: window.endMinute ?? 0,
        planned: events, actual: actualEvents, offShiftIntervals, speed,
    }) : undefined;
    const operationId = selectedOperation?.operation.operationId ?? "";
    const parameter = selectEffectiveParameter(scenarioState.operationStationParameters ?? [], operationId, stationId);
    const versions = (scenarioState.operationStationParameters ?? []).filter(item => item.operationId === operationId && item.stationId === stationId);
    let bestActualPreview;
    if (parameter && reconciliation && speed.readyForCalibration) {
        try {
            bestActualPreview = buildRnrBestActualPreview({
                stationId, planned: events, actual: actualEvents,
                windowStartMinute: window.startMinute, windowEndMinute: window.endMinute, offShiftIntervals,
                standardCycleSec: parameter.standardCycleSec, piecesPerCycle: parameter.piecesPerCycle,
                plannedQualityRate: parameter.qualityRate,
                publishedPerformanceRate: parameter.performanceRate,
                acceptedUnplannedMinutes: observeShiftAllowance({
                    stationId,
                    shifts: standardSaShiftIntervals(dayConfig),
                    actual: actualEvents,
                })?.planningUnplannedMinutes ?? 0,
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
        cycleSamplesSec: samples, targetSampleCount: 0, speed, evidence,
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
    const evidenceDraft = captureRnrEvidenceDraft(evidencePackage, dayConfig);
    syncAutoSavedRnrEvidence(evidenceDraft);
    const cycleDiagnosis = diagnosePlannedCycle(cycleSummary, parameter && parameter.standardCycleSec > 0 ? parameter.standardCycleSec : undefined);
    const suggestionFingerprint = JSON.stringify({ events, actualEvents, samples, speed, evidence, parameter });
    const observationFingerprint = JSON.stringify({ events, actualEvents, samples, speed, evidence });
    const performance = speed.readyForCalibration && actualEvents.length > 0
        ? Math.max(0, Math.min(1, (productionEvents.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0) - speed.inferredSaLossMinutes - speed.performanceLossMinutes)
            / Math.max(productionEvents.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0) - speed.inferredSaLossMinutes, 0.0001)))
        : undefined;
    calibrationRoot.innerHTML = `
    ${currentStationHead(t("stageCalibration"), t("calibrationTitle"), `<span class="pill">${t("observedDraft")}</span>`)}
    <p class="note">${t("calibrationNote")}</p>
    <section class="metrics" style="margin-top:14px;">
      ${metricCard(t("baselineSaMetric"), baselineValid ? percent(baseline.bestCaseSaWithBreaks) : "-", t("baselineReference"), "good")}
      ${metricCard(t("draftPerformanceMetric"), performance === undefined ? "-" : percent(performance), hasActualRecord ? t("observedDraft") : (locale === "zh" ? "暂无实际记录" : "No actual record"), "neutral")}
      ${metricCard(t("draftQualityMetric"), qualityRate === undefined ? "-" : percent(qualityRate), hasActualRecord ? t("observedDraft") : (locale === "zh" ? "暂无实际记录" : "No actual record"), "neutral")}
    </section>
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "计划 / 实际时间对账" : "Planned / actual time reconciliation"}</h3><span class="pill ${reconciliation?.complete ? "good" : "warn"}">${reconciliation?.complete ? (locale === "zh" ? "时间账完整" : "Timeline complete") : (locale === "zh" ? "待核对" : "Review needed")}</span></div>
      ${reconciliation ? `
        <div class="field-grid">
          ${field(locale === "zh" ? "计划生产分钟" : "Planned production minutes", formatNumber(reconciliation.plannedProductionMinutes))}
          ${field(locale === "zh" ? "实际生产分钟" : "Actual production minutes", hasActualRecord ? formatNumber(reconciliation.actualProductionMinutes) : "-")}
          ${field(locale === "zh" ? "显式异常分钟" : "Recorded abnormal minutes", hasActualRecord ? formatNumber(reconciliation.explicitAbnormalMinutes) : "-")}
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
    ${renderRnrBestActualPreviewPanel(bestActualPreview, validationFixtureContexts.has(`${productId}::${selectedOperation?.operation.operationId ?? ""}::${stationId}`))}
    ${renderCycleDiagnosisPanel(cycleDiagnosis, cycleSummary)}
    ${parameter ? "" : renderInitialPresetPanel(operationId, stationId, cycleSummary)}
    ${renderParameterSuggestionsPanel(suggestions, suggestionFingerprint, observationFingerprint, evidence, parameter, versions, events)}
    ${renderRnrEvidencePackagePanel(evidenceDraft)}
    ${routePanel}
    ${reportPanel}
    <p class="note">${t("capacityPreviewOnly")}</p>
  `;
    bindRouteWindowControls(selectedOperation, routingConfig);
    bindRouteWeekReport(routingConfig);
    calibrationRoot.querySelectorAll("[data-recoverable-event]").forEach(input => {
        input.addEventListener("input", () => {
            const max = Number(input.max);
            const raw = Number(input.value);
            if (Number.isFinite(raw) && Number.isFinite(max) && raw > max) {
                input.value = String(max);
                input.setCustomValidity(locale === "zh" ? `可补救分钟不能超过这段损失的 ${formatNumber(max)} 分钟。` : `Recoverable minutes cannot exceed the recorded ${formatNumber(max)} minutes.`);
                input.reportValidity();
            }
            else {
                input.setCustomValidity("");
            }
            const saved = Number(input.dataset.savedRecoverable ?? "0");
            const current = boundedRecoverableMinutes(Number(input.value), max);
            input.parentElement?.querySelector("button")?.classList.toggle("is-confirmed", input.dataset.recoverableConfirmed === "1" && current === saved);
        });
    });
    calibrationRoot.querySelectorAll("[data-confirm-recoverable]").forEach(button => {
        button.addEventListener("click", () => {
            const eventId = button.dataset.confirmRecoverable ?? "";
            const input = calibrationRoot.querySelector(`[data-recoverable-event="${CSS.escape(eventId)}"]`);
            const key = `${actualScopeKey(productId, operationId, stationId)}`;
            const current = rnrActualEventsByContext.get(key) ?? [];
            const target = current.find(event => event.id === eventId);
            if (!input || !target)
                return;
            const recoverableMinutes = boundedRecoverableMinutes(Number(input.value), target.endMinute - target.startMinute);
            rnrActualEventsByContext.set(key, current.map(event => event.id === eventId ? { ...event, recoverableMinutes, recoverableConfirmed: true } : event));
            render(selectedProductId);
        });
    });
    calibrationRoot.querySelector("[data-evidence-clear]")?.addEventListener("click", () => {
        if (!globalThis.confirm(locale === "zh"
            ? "清除当前工站的本地草稿并重置计划/实跑输入？已发布参数不会撤销。"
            : "Clear this station's local draft and reset planned/actual inputs? Published parameters stay unchanged."))
            return;
        clearCurrentRnrEvidence(evidenceDraft);
    });
    calibrationRoot.querySelector("[data-evidence-export]")?.addEventListener("click", () => {
        const json = JSON.stringify({ ...evidenceDraft, savedAt: new Date().toISOString() }, null, 2);
        const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `rnr-${productId}-${stationId}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 0);
    });
    calibrationRoot.querySelector("[data-evidence-import]")?.addEventListener("change", async (event) => {
        const file = event.currentTarget.files?.[0];
        if (!file)
            return;
        try {
            if (file.size > 2_000_000)
                throw new Error(locale === "zh" ? "文件超过 2 MB。" : "File exceeds 2 MB.");
            const imported = parseRnrEvidenceDraft(await file.text(), evidenceDraft.snapshot.scope);
            if (!globalThis.confirm(locale === "zh"
                ? "导入会替换当前工站的计划和 R&R 输入；已发布参数不受影响。继续？"
                : "Import replaces this station's planned and R&R inputs. Published parameters are unaffected. Continue?"))
                return;
            applyRnrEvidenceDraft(imported);
            evidenceDraftMessage = locale === "zh" ? "已导入并自动保存，结果已重算。" : "Imported and auto-saved; results recalculated.";
            render(selectedProductId);
        }
        catch (error) {
            evidenceDraftMessage = error instanceof Error ? error.message : String(error);
            renderCalibration(selectedOperation, routingConfig);
        }
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
    calibrationRoot.querySelector("[data-initial-preset]")?.addEventListener("submit", event => {
        event.preventDefault();
        submitInitialPreset(event.currentTarget);
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
            ...(localRouteId() ? { routeId: localRouteId() } : {}),
            startMinute: input.window.startMinute,
            endMinute: input.window.endMinute,
            durationMinutes: input.window.durationMinutes,
        },
        plannedEvents: input.planned,
        actualEvents: input.actual,
        cycleSamplesSec: input.cycleSamplesSec,
        cycleSampleRecord: {
            schemaVersion: 2,
            samples: cycleCheckDraft.samples.map((sample, index) => ({
                sequence: index + 1, id: sample.id, seconds: sample.seconds, display: formatStopwatch(sample.seconds),
                ...(sample.nok ? { nok: true } : {}),
                ...(sample.lineStop ? { lineStop: true } : {}),
                ...(sample.reason ? { reason: sample.reason } : {}),
            })),
            recordedCount: cycleCheckDraft.samples.filter(sample => sample.seconds > 0).length,
            validCount: input.cycleSamplesSec.length,
            excludedCount: cycleCheckDraft.samples.filter(sample => sample.seconds > 0 && sample.lineStop === true).length,
            observedMeanSec: input.cycleSamplesSec.length
                ? input.cycleSamplesSec.reduce((sum, value) => sum + value, 0) / input.cycleSamplesSec.length
                : null,
            status: input.cycleSamplesSec.length ? "verified" : cycleCheckDraft.samples.some(sample => sample.seconds > 0) ? "below-target" : "empty",
            basis: "mean of non-stop laps, converted from stopwatch digits such as 337 = 00:03.37",
            legacyUnparsed: cycleCheckDraft.legacyUnparsed ?? null,
        },
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
            "Local browser draft. Not persisted to upstream master data.",
            "Derived results are recalculated from restored inputs; parameter publication is not restored.",
        ],
    };
}
function captureRnrEvidenceDraft(snapshot, dayConfig) {
    return {
        schemaVersion: 2,
        snapshot,
        dayConfig: { ...dayConfig },
        cycleDraft: { ...cycleCheckDraft },
        validationFixture: validationFixtureContexts.has(rnrContextKey),
        decisions: {
            confirmedTargets: [...confirmedSuggestions.values()].filter(item => item.suggestion.productId === snapshot.scope.productId && item.suggestion.operationId === snapshot.scope.operationId && item.suggestion.stationId === snapshot.scope.stationId).map(item => item.suggestion.target),
            publishedVersionIds: publishedSuggestions.filter(item => item.suggestion.productId === snapshot.scope.productId && item.suggestion.operationId === snapshot.scope.operationId && item.suggestion.stationId === snapshot.scope.stationId).map(item => item.versionId),
        },
    };
}
function evidenceStorageKeyForScope(scope) {
    const { productId, operationId, stationId } = scope;
    if (scope.routeId) {
        return `capa-rnr-evidence-v2:${encodeURIComponent(productId)}:${encodeURIComponent(scope.routeId)}:${encodeURIComponent(operationId)}:${encodeURIComponent(stationId)}`;
    }
    return `capa-rnr-evidence-v1:${encodeURIComponent(productId)}:${encodeURIComponent(operationId)}:${encodeURIComponent(stationId)}`;
}
function evidenceStorageKey(draft) {
    return evidenceStorageKeyForScope(draft.snapshot.scope);
}
function evidenceInputSignature(draft) {
    return JSON.stringify({
        dayConfig: draft.dayConfig,
        planned: draft.snapshot.plannedEvents,
        actual: draft.snapshot.actualEvents,
        cycle: draft.cycleDraft,
        validationFixture: draft.validationFixture,
        decisions: draft.decisions,
    });
}
function syncAutoSavedRnrEvidence(draft) {
    const key = evidenceStorageKey(draft);
    const signature = evidenceInputSignature(draft);
    const previous = autoSavedEvidenceSignatures.get(key);
    if (previous === undefined) {
        autoSavedEvidenceSignatures.set(key, signature);
        return;
    }
    if (previous === signature)
        return;
    try {
        saveLocalState(key, JSON.stringify({ ...draft, savedAt: new Date().toISOString() }));
        autoSavedEvidenceSignatures.set(key, signature);
        evidenceDraftMessage = "";
    }
    catch {
        evidenceDraftMessage = locale === "zh" ? "自动保存失败，请检查浏览器存储空间或权限。" : "Auto-save failed; check browser storage or permissions.";
    }
}
function restoreAutoSavedRnrEvidence(expected) {
    const key = evidenceStorageKeyForScope(expected);
    if (autoRestoredEvidenceContexts.has(key))
        return;
    autoRestoredEvidenceContexts.add(key);
    evidenceDraftMessage = "";
    try {
        const raw = localStorage.getItem(key);
        if (!raw)
            return;
        applyRnrEvidenceDraft(parseRnrEvidenceDraft(raw, expected));
        evidenceDraftMessage = locale === "zh" ? "已自动恢复本机草稿。" : "Local draft restored automatically.";
    }
    catch (error) {
        evidenceDraftMessage = locale === "zh"
            ? `本机草稿未能恢复：${error instanceof Error ? error.message : String(error)}`
            : `Local draft could not be restored: ${error instanceof Error ? error.message : String(error)}`;
    }
}
function clearAllAutoSavedRnrEvidence() {
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith("capa-rnr-evidence-v1:"))
                keys.push(key);
        }
        keys.forEach(removeLocalState);
    }
    catch { /* Browser storage may be disabled. */ }
    autoRestoredEvidenceContexts.clear();
    autoSavedEvidenceSignatures.clear();
    evidenceDraftMessage = "";
}
function parseRnrEvidenceDraft(raw, expected) {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object")
        throw new Error(locale === "zh" ? "证据包格式无效。" : "Invalid evidence package.");
    const draft = parsed;
    const scope = draft.snapshot?.scope;
    const config = draft.dayConfig;
    const validConfig = config && Number.isFinite(config.startMinute) && (config.dayCount === 1 || config.dayCount === 2)
        && (config.shiftMinutes === 480 || config.shiftMinutes === 720)
        && Number.isInteger(config.shiftsPerDay) && config.shiftsPerDay >= 1
        && config.shiftsPerDay * config.shiftMinutes <= MINUTE_PER_DAY;
    const validEvents = (events) => Array.isArray(events) && events.length <= 500 && events.every(event => event && typeof event.id === "string" && typeof event.stationId === "string" && event.stationId === expected.stationId
        && rnrActualKinds.includes(event.kind) && Number.isFinite(event.startMinute) && Number.isFinite(event.endMinute)
        && event.startMinute >= config.startMinute && event.endMinute <= config.startMinute + PLANNED_SA_HORIZON_MINUTES
        && event.endMinute > event.startMinute);
    const timelineValid = (events) => Array.isArray(events) && events.every(event => event && Number.isFinite(event.startMinute) && Number.isFinite(event.endMinute))
        && validateTimelineEvents(events.map(event => ({
            ...event,
            startMinute: event.startMinute - config.startMinute,
            endMinute: event.endMinute - config.startMinute,
        })), PLANNED_SA_HORIZON_MINUTES).every(issue => issue.severity !== "error");
    const cycleSamples = draft.cycleDraft && typeof draft.cycleDraft === "object"
        ? draft.cycleDraft.samples : undefined;
    if ((draft.schemaVersion !== 1 && draft.schemaVersion !== 2) || !scope || !validConfig
        || (typeof cycleSamples !== "string" && !Array.isArray(cycleSamples))
        || scope.productId !== expected.productId || scope.operationId !== expected.operationId || scope.stationId !== expected.stationId
        || (expected.routeId !== undefined && scope.routeId !== expected.routeId)
        || scope.startMinute !== config.startMinute || scope.endMinute !== config.startMinute + config.dayCount * MINUTE_PER_DAY
        || !validEvents(draft.snapshot.plannedEvents) || !validEvents(draft.snapshot.actualEvents)
        || !timelineValid(draft.snapshot.plannedEvents) || !timelineValid(draft.snapshot.actualEvents)
        || !draft.snapshot.actualEvents.every(event => event.kind !== "production" ||
            (Number.isFinite(event.okQty) && (event.okQty ?? -1) >= 0 && Number.isFinite(event.nokQty) && (event.nokQty ?? -1) >= 0
                && Number.isFinite(event.piecesPerCycle) && (event.piecesPerCycle ?? 0) > 0))) {
        throw new Error(locale === "zh" ? "证据包与当前工站不匹配，或时间轴/节拍输入无效。" : "Package scope or timeline/cycle inputs are invalid.");
    }
    return { ...draft, schemaVersion: 2, cycleDraft: migrateLegacyCycleDraft(draft.cycleDraft).draft };
}
function isValidationFixturePlan(events) {
    return events.length > 0 && events.every(event => event.source === "template" && event.id.startsWith("validation"));
}
function applyRnrEvidenceDraft(draft) {
    const scope = draft.snapshot.scope;
    const config = draft.dayConfig;
    const planKey = `${scope.productId}::${scope.stationId}`;
    const actualKey = `${scope.productId}::${scope.operationId}::${scope.stationId}`;
    const fixturePlan = isValidationFixturePlan(draft.snapshot.plannedEvents);
    const liveWindow = standardSaDayWindow(fixturePlan ? getStandardSaDayConfig(scope.productId, scope.stationId) : config);
    const delta = fixturePlan ? liveWindow.startMinute - config.startMinute : 0;
    const actualEvents = draft.snapshot.actualEvents.map(event => delta === 0 ? event : {
        ...event,
        startMinute: event.startMinute + delta,
        endMinute: event.endMinute + delta,
    });
    const shiftConfig = fixturePlan ? getStandardSaDayConfig(scope.productId, scope.stationId) : config;
    const shifts = standardSaShiftIntervals(shiftConfig);
    if (actualEvents.some(event => event.startMinute < liveWindow.startMinute || event.endMinute > liveWindow.endMinute
        || !intervalCoveredByShifts(event.startMinute, event.endMinute, shifts))) {
        throw new Error(locale === "zh"
            ? "已保存的实际记录进入了非排班时段，未恢复。请先在标准 SA 设定中排满班次。"
            : "Saved actual records enter off-shift time and were not restored. Fill the shifts in Standard SA setup first.");
    }
    if (rnrContextKey && rnrContextKey !== actualKey)
        rnrDrafts.set(rnrContextKey, { segment: { ...rnrSegmentDraft }, cycle: { ...cycleCheckDraft } });
    if (!fixturePlan) {
        standardSaDayConfigs.set(planKey, { ...config });
        plannedSaContexts.set(planKey, { events: draft.snapshot.plannedEvents, areDefault: false });
        if (!plannedSaContextKey || plannedSaContextKey === planKey) {
            plannedSaContextKey = planKey;
            plannedSaEvents = draft.snapshot.plannedEvents;
            plannedSaEventsAreDefault = false;
        }
        frozenStandardWindows.delete(planKey);
        copyProjectionDrafts.delete(planKey);
    }
    rnrActualEventsByContext.set(actualKey, actualEvents);
    const plannedEvents = fixturePlan
        ? plannedSaContexts.get(planKey)?.events ?? buildDefaultPlannedActivityEvents(scope.stationId, scope.productId, getStandardSaDayConfig(scope.productId, scope.stationId))
        : draft.snapshot.plannedEvents;
    const firstProduction = plannedEvents.find(event => event.kind === "production");
    const segment = {
        ...rnrSegmentDraft,
        startMinute: firstProduction?.startMinute ?? config.startMinute,
        endMinute: (firstProduction?.startMinute ?? config.startMinute) + 60,
        okQty: 0, nokQty: 0, evidenceSource: "", isEstimated: false,
    };
    rnrDrafts.set(actualKey, { segment, cycle: { ...draft.cycleDraft } });
    if (rnrContextKey === actualKey || !rnrContextKey) {
        rnrContextKey = actualKey;
        rnrSegmentDraft = segment;
        cycleCheckDraft = { ...draft.cycleDraft };
    }
    if (draft.validationFixture)
        validationFixtureContexts.add(actualKey);
    else
        validationFixtureContexts.delete(actualKey);
    rnrSelectedEventId = "";
}
function clearCurrentRnrEvidence(draft) {
    const { productId, operationId, stationId } = draft.snapshot.scope;
    const key = evidenceStorageKey(draft);
    try {
        removeLocalState(key);
    }
    catch { /* Browser storage may be disabled. */ }
    autoSavedEvidenceSignatures.delete(key);
    const planKey = `${planScopeKey(productId, stationId)}`;
    const actualKey = `${actualScopeKey(productId, operationId, stationId)}`;
    const config = { startMinute: 510, dayCount: 1, shiftMinutes: 720, shiftsPerDay: 1 };
    const events = buildDefaultPlannedActivityEvents(stationId, productId, config);
    standardSaDayConfigs.set(planKey, config);
    plannedSaContexts.set(planKey, { events, areDefault: true });
    plannedSaContextKey = planKey;
    plannedSaEvents = events;
    plannedSaEventsAreDefault = true;
    frozenStandardWindows.delete(planKey);
    copyProjectionDrafts.delete(planKey);
    rnrActualEventsByContext.delete(actualKey);
    rnrDrafts.delete(actualKey);
    validationFixtureContexts.delete(actualKey);
    confirmedSuggestions.forEach((saved, id) => {
        if (saved.suggestion.productId === productId && saved.suggestion.operationId === operationId && saved.suggestion.stationId === stationId)
            confirmedSuggestions.delete(id);
    });
    rnrContextKey = "";
    rnrSelectedEventId = "";
    rnrActualKind = "production";
    rnrEventNote = "";
    rnrMode = "timeWindow";
    rnrDraftError = "";
    standardWindowFreezeError = "";
    cycleCheckDraft = emptyCycleSampleDraft();
    editingCycleSampleId = "";
    evidenceDraftMessage = locale === "zh" ? "本机草稿已清除。" : "Local draft cleared.";
    render(selectedProductId);
}
function renderRnrEvidencePackagePanel(draft) {
    const zh = locale === "zh";
    const snapshot = draft.snapshot;
    let savedAt = "";
    try {
        const saved = localStorage.getItem(evidenceStorageKey(draft));
        savedAt = saved ? JSON.parse(saved).savedAt ?? "" : "";
    }
    catch { /* Browser storage may be disabled. */ }
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head">
        <h3>${zh ? "R&R 记录备份" : "R&R record backup"}</h3>
        <div class="panel-actions">
          <span class="pill ${snapshot.status === "draft-complete" ? "good" : "warn"}">${snapshot.status === "draft-complete" ? (zh ? "记录完整" : "Complete") : (zh ? "待补录" : "Incomplete")}</span>
          <button class="button secondary" type="button" data-evidence-export>${zh ? "导出 JSON" : "Export JSON"}</button>
        </div>
      </div>
      <p class="note">${zh ? "计划、实跑和节拍输入生效后自动保存在本机；再次打开同一工站自动恢复。不会发布 CT/P/Q。" : "Committed planned, actual and cycle inputs are auto-saved locally and restored for this station. CT/P/Q are not published."}</p>
      <div class="field-grid">
        ${field(zh ? "最近自动保存" : "Last auto-save", savedAt ? savedAt.replace("T", " ").slice(0, 19) : "-")}
        ${field(zh ? "数据来源" : "Data source", draft.validationFixture ? (zh ? "验证样本 · 非现场记录" : "Validation sample") : (zh ? "现场草稿" : "Field draft"))}
      </div>
      ${evidenceDraftMessage ? `<p class="note" role="status">${escapeHtml(evidenceDraftMessage)}</p>` : ""}
      <details style="margin-top:14px;"><summary class="backup-toggle">${zh ? "数据备份与清除" : "Backup and clear"}</summary>
        <div class="actions" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
          <label>${zh ? "导入 JSON" : "Import JSON"}<input type="file" accept="application/json,.json" data-evidence-import></label>
          <button class="button secondary" type="button" data-evidence-clear>${zh ? "清除本地草稿" : "Clear local draft"}</button>
        </div>
      </details>
    </section>
  `;
}
function renderRnrBestActualPreviewPanel(preview, isValidationFixture) {
    const zh = locale === "zh";
    return `<section class="sub-card" style="margin-top:14px;">
    <div class="panel-head"><h3>${zh ? "Best case 与实跑对比" : "Best case versus actual"}</h3><div class="panel-actions"><span class="pill" data-current-station-scope>${zh ? "当前工站" : "Current station"}</span><span class="pill warn">${isValidationFixture ? (zh ? "验证样本 · 草稿预览" : "Validation sample · draft preview") : (zh ? "草稿预览" : "Draft preview")}</span></div></div>
    <p class="note">${zh ? "仅比较当前工站的完整观察窗口：Best case = 计划生产分钟 × 标准 CT × 每循环件数，不乘 P、Q。计划停机、休息、换型和维护已从计划生产分钟扣除。Actual = 实际生产分钟、现场 OK/NOK 与回算 Actual CT/Q。不含需求份额和多工站分配。" : "Station-level complete-window preview only: Best case is planned production minutes × standard CT × pieces per cycle, without P or Q. Breaks, changeover, maintenance and planned stops are already out of those minutes. Actual uses recorded production minutes and OK/NOK. Demand share and multi-station allocation are excluded."}</p>
    ${preview?.complete ? `<div class="field-grid">
      ${field(zh ? "标准时间开动率（扣计划休息/停机）" : "Planned time availability (excl. planned breaks/stops)", percent(preview.plannedSa))}
      ${field(zh ? "Actual 时间开动率（扣实际休息/停机/推断）" : "Actual time availability (excl. actual breaks/stops/inference)", percent(preview.actualSa))}
      ${field(zh ? "Planned Q" : "Planned Q", percent(preview.plannedQualityRate))}
      ${field(zh ? "Actual Q" : "Actual Q", preview.actualQualityRate === undefined ? "-" : percent(preview.actualQualityRate))}
      ${field(zh ? "标准 CT（秒/循环）" : "Standard CT (sec/cycle)", formatNumber(preview.standardCycleSec, 1))}
      ${field(zh ? "Actual CT（秒/循环）" : "Actual CT (sec/cycle)", preview.actualCycleSec === undefined ? "-" : formatNumber(preview.actualCycleSec, 1))}
      ${field(zh ? "Best case 理论件数（件）" : "Best case ideal units", formatOutputUnits(preview.bestCaseIdealUnits))}
      ${field(zh ? "实跑总产出（件）" : "Actual gross units", formatOutputUnits(preview.actualGrossUnits))}
      ${field(zh ? "Best case 理论 OK（件）" : "Best case ideal OK units", formatOutputUnits(preview.bestCaseOkUnits))}
      ${field(zh ? "实跑良品件数" : "Actual good units", formatOutputUnits(preview.actualGoodUnits))}
      ${field(zh ? "Best case 理论 NOK（件）" : "Best case ideal NOK units", formatOutputUnits(preview.bestCaseNokUnits))}
      ${field(zh ? "实跑 NOK（件）" : "Actual NOK units", formatOutputUnits(preview.qualityGapUnits))}
      ${field(zh ? "实录生产时间占比（扣实际休息/停机）" : "Recorded production share (excl. actual breaks/stops)", percent(preview.actualRecordedSa))}
      ${field(zh ? "良品差额（件）" : "Good-unit gap", formatOutputUnits(preview.totalGapUnits))}
      ${field(zh ? "时间损失折算（件，含推断）" : "Time gap in units incl. inference", formatOutputUnits(preview.timeGapUnits))}
      ${field(zh ? "其中待归因推断（件）" : "Of which inferred units", formatOutputUnits(preview.inferredSaGapUnits))}
      ${field(zh ? "性能率差额折算（件）" : "Performance gap in units", formatOutputUnits(preview.paceGapUnits))}
    </div>` : `<p class="note">${zh ? "需先补齐当前工站完整观察窗口的计划与实际记录，才显示可比结果。" : "Complete both planned and actual records for the whole observation window before comparing."}</p>`}
    ${preview && !preview.complete ? `<div class="field-grid">
      ${field(zh ? "观察窗口分钟" : "Observation window min", formatNumber(preview.windowMinutes))}
      ${field(zh ? "计划生产分钟" : "Planned production min", formatNumber(preview.plannedProductionMinutes))}
      ${field(zh ? "已录实际生产分钟" : "Recorded actual production min", formatNumber(preview.actualProductionMinutes))}
      ${field(zh ? "待补录分钟" : "Unrecorded min", formatNumber(preview.unrecordedMinutes))}
    </div>` : ""}
    ${preview?.complete && preview.paceGapUnits < 0 ? `<p class="form-error">${zh ? "实跑节拍快于当前标准 CT，请先复核数量和 CT。" : "Actual output is faster than standard CT; review quantities and CT."}</p>` : ""}
    <p class="note">${zh ? "按当前节拍容差规则，推断时间损失计入 Actual SA；原因待查不妨碍计算，也不重复扣减。" : "Inferred time loss enters Actual SA under the current cycle-tolerance rule. An unknown cause does not block calculation or create a second deduction."}</p>
    ${preview?.complete ? renderMostLikelyActualComparison(preview) : ""}
  </section>`;
}
function renderMostLikelyActualComparison(preview) {
    const zh = locale === "zh";
    const rateDelta = (actual, published) => actual === undefined ? "-" : percent(actual - published);
    return `<section class="sub-card" style="margin-top:14px;" data-most-likely-actual>
    <div class="panel-head"><h3>${zh ? "Most likely 与实跑对比" : "Most likely versus actual"}</h3></div>
    <p class="note">${zh ? "只比较已发布的 P、Q，以及已接受的非计划中断对时间开动率的影响。未发布的建议不进入这档。实跑 P = 标准 CT / 实跑节拍，最高 100%。差额 = 实跑 − Most likely。" : "Compares published P, published Q, and the SA effect of accepted unplanned interruptions. Unpublished suggestions stay out. Actual P is standard CT / actual cycle, capped at 100%. Delta = actual − Most likely."}</p>
    <div class="field-grid">
      ${field(zh ? "已发布 P" : "Published P", percent(preview.publishedPerformanceRate))}
      ${field(zh ? "实跑 P" : "Actual P", preview.actualPerformanceRate === undefined ? "-" : percent(preview.actualPerformanceRate))}
      ${field(zh ? "P 差额" : "P delta", rateDelta(preview.actualPerformanceRate, preview.publishedPerformanceRate))}
      ${field(zh ? "已接受非计划中断（分钟）" : "Accepted unplanned (min)", formatNumber(preview.acceptedUnplannedMinutes, 1))}
      ${field(zh ? "已发布 Q" : "Published Q", percent(preview.plannedQualityRate))}
      ${field(zh ? "实跑 Q" : "Actual Q", preview.actualQualityRate === undefined ? "-" : percent(preview.actualQualityRate))}
      ${field(zh ? "Q 差额" : "Q delta", rateDelta(preview.actualQualityRate, preview.plannedQualityRate))}
      ${field(zh ? "Most likely 时间开动率" : "Most likely availability", percent(preview.mostLikelySa))}
      ${field(zh ? "Actual 时间开动率" : "Actual availability", percent(preview.actualSa))}
      ${field(zh ? "SA 差额" : "SA delta", percent(preview.actualSa - preview.mostLikelySa))}
      ${field(zh ? "Most likely 良品（件）" : "Most likely good units", formatOutputUnits(preview.mostLikelyGoodUnits))}
      ${field(zh ? "实跑良品（件）" : "Actual good units", formatOutputUnits(preview.actualGoodUnits))}
    </div>
  </section>`;
}
function currentStationHead(eyebrow, title, actions = "") {
    return `<div class="panel-head"><div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2></div><div class="panel-actions"><span class="pill" data-current-station-scope>${t("currentStationScope")}</span>${actions}</div></div>`;
}
function peekPlannedSaEvents(stationId, productId) {
    const planKey = stationPlanKey(productId, stationId);
    if (planKey === plannedSaContextKey)
        return plannedSaEvents;
    return plannedSaContexts.get(planKey)?.events
        ?? buildDefaultPlannedActivityEvents(stationId, productId, getStandardSaDayConfig(productId, stationId));
}
function collectRouteStationObservations(routingConfig) {
    return routingConfig.operations.flatMap(operation => operation.assignments.filter(view => view.planningStatus === "available").map(view => {
        const stationId = view.assignment.stationId;
        const operationId = operation.operation.operationId;
        const actualKey = stationActualKey(routingConfig.productId, operationId, stationId);
        const cycle = actualKey === rnrContextKey ? cycleCheckDraft : rnrDrafts.get(actualKey)?.cycle;
        const speedOptions = speedOptionsForCycle();
        const dayConfig = getStandardSaDayConfig(routingConfig.productId, stationId);
        const standardWindow = standardSaDayWindow(dayConfig);
        const offShiftIntervals = standardSaOffShiftIntervals(dayConfig);
        return {
            productId: routingConfig.productId,
            operationId,
            stationId,
            shareCeiling: 1,
            ...(view.parameter ? { parameter: view.parameter } : {}),
            planned: peekPlannedSaEvents(stationId, routingConfig.productId),
            actual: rnrActualEventsByContext.get(actualKey) ?? [],
            ...(speedOptions ? { speedOptions } : {}),
            ...(offShiftIntervals.length ? { offShiftIntervals } : {}),
            standardWindow: { startMinute: standardWindow.startMinute, endMinute: standardWindow.endMinute },
        };
    }));
}
function bindRouteWindowControls(selectedOperation, routingConfig) {
    const routeKey = `${routingConfig.productId}::${routingConfig.route?.routeId ?? ""}`;
    calibrationRoot.querySelector("[data-route-window]")?.addEventListener("change", event => {
        const value = event.currentTarget.value;
        if (!value)
            routeWindowMemory.delete(routeKey);
        else
            routeWindowMemory.set(routeKey, { key: value, explicit: true });
        renderCalibration(selectedOperation, routingConfig);
    });
    calibrationRoot.querySelector("[data-window-demand]")?.addEventListener("change", event => {
        const input = event.currentTarget;
        if (!input.checkValidity()) {
            input.reportValidity();
            return;
        }
        windowDemandByRoute.set(routeKey, input.value);
        renderCalibration(selectedOperation, routingConfig);
    });
}
function formatRouteBlocker(code, stationWindow) {
    const zh = locale === "zh";
    const labels = {
        missing_or_invalid_parameter: ["工站参数缺失或无效", "Station parameter missing or invalid"],
        planned_window_missing: ["缺少计划时间窗", "Planned window missing"],
        timeline_invalid: ["时间轴重叠或越界", "Timeline overlaps or exceeds window"],
        planned_window_gap: ["计划时间窗有空档", "Planned window has a gap"],
        actual_window_incomplete: ["实跑时间未覆盖整个窗口", "Actual track does not cover the whole window"],
        actual_production_missing: ["缺少实跑生产段", "Actual production interval missing"],
        actual_cycle_or_quantity_invalid: ["节拍或产出数量待复核", "Cycle time or output quantity needs review"],
        route_window_unselected: ["尚未选择路线观察窗口", "Route observation window is not selected"],
        window_mismatch: ["标准 SA 窗口与所选路线窗口不一致", "Standard SA window differs from the selected route window"],
        standard_window_missing: ["尚未定义标准 SA 窗口", "Standard SA window is not defined"],
    };
    const text = (labels[code] ?? [code, code])[zh ? 0 : 1];
    if (code === "window_mismatch" && stationWindow) {
        return `${text}（${formatOptionalMinutePoint(stationWindow.startMinute)} – ${formatOptionalMinutePoint(stationWindow.endMinute)}）`;
    }
    return text;
}
function renderRouteWindowSelect(view) {
    const zh = locale === "zh";
    const selectedKey = view.selected ? routeWindowKey(view.selected) : "";
    const placeholder = view.candidates.length === 0
        ? `<option value="">${escapeHtml(zh ? "没有已定义的标准 SA 窗口" : "No defined standard SA window")}</option>`
        : view.needsExplicitChoice
            ? `<option value="">${escapeHtml(zh ? "请选择观察窗口" : "Choose an observation window")}</option>`
            : "";
    const options = view.candidates.map(candidate => {
        const key = routeWindowKey(candidate);
        const label = `${formatOptionalMinutePoint(candidate.startMinute)} – ${formatOptionalMinutePoint(candidate.endMinute)} · ${candidate.stationIds.join(", ")}`;
        return `<option value="${escapeHtml(key)}" ${key === selectedKey ? "selected" : ""}>${escapeHtml(label)}</option>`;
    }).join("");
    return `<label class="field" for="routeWindowSelect">${zh ? "路线观察窗口" : "Route observation window"}
    <select id="routeWindowSelect" data-route-window ${view.candidates.length === 0 || (view.candidates.length === 1 && !view.needsExplicitChoice) ? "disabled" : ""}>${placeholder}${options}</select>
  </label>`;
}
function renderRouteWindowCapacityPanel(routingConfig) {
    const zh = locale === "zh";
    const routeKey = `${routingConfig.productId}::${routingConfig.route?.routeId ?? ""}`;
    const rawDemand = windowDemandByRoute.get(routeKey) ?? "";
    const demandQty = rawDemand === "" ? undefined : Number(rawDemand);
    const stations = collectRouteStationObservations(routingConfig);
    const storedWindow = routeWindowMemory.get(routeKey);
    const resolution = resolveRouteObservationWindow(storedWindow, collectRouteWindowCandidates(stations));
    const requirements = routingConfig.route ? routingConfig.operations.map(item => resolveOperationOutputRequirement(scenarioState, routingConfig.route, item.operation, resolution.selected ? minuteToDateValue(resolution.selected.startMinute) : undefined, resolution.selected ? minuteToDateValue(resolution.selected.endMinute - 1) : undefined)) : [];
    const operationUnitsPerProduct = Object.fromEntries(requirements
        .filter(item => item.unitsPerFinishedProduct !== undefined)
        .map(item => [item.operationId, item.unitsPerFinishedProduct]));
    const view = buildRouteWindowCapacityView({
        ...(storedWindow ? { memory: storedWindow } : {}),
        stations,
        operationIds: routingConfig.operations.map(item => item.operation.operationId),
        ...(routingConfig.route?.stationFlowPolicies?.length ? { stationFlowPolicies: routingConfig.route.stationFlowPolicies } : {}),
        ...(Object.keys(operationUnitsPerProduct).length ? { operationUnitsPerProduct } : {}),
        ...(demandQty === undefined ? {} : { demandQty }),
    });
    if (view.memory)
        routeWindowMemory.set(routeKey, view.memory);
    const value = (number) => number === undefined ? "-" : formatOutputUnits(number);
    const selectedLabel = view.selected
        ? `${formatOptionalMinutePoint(view.selected.startMinute)} – ${formatOptionalMinutePoint(view.selected.endMinute)}`
        : (zh ? "未选择" : "Not selected");
    return `<section class="sub-card" style="margin-top:14px;" data-whole-route-scope>
    <div class="panel-head"><h3>${zh ? "同窗工序能力" : "Same-window route capacity"}</h3><div class="panel-actions"><span class="pill">${t("wholeRouteScope")}</span><span class="pill warn">${zh ? "本地试算" : "Local simulation"}</span></div></div>
    <div class="field-grid">
      ${renderRouteWindowSelect(view)}
      ${field(zh ? "所选观察窗口" : "Selected observation window", selectedLabel)}
      ${field(zh ? "路线计划等效成品能力" : "Planned product-equivalent capacity", value(view.bestGoodCapacity))}
      ${field(zh ? "路线实跑等效成品上限" : "Actual product-equivalent upper bound", value(view.actualGoodOutput))}
      ${field(zh ? "计划 / 实跑瓶颈工序" : "Planned / actual bottleneck", `${view.bestBottleneckOperationId ?? (routingConfig.route?.stationFlowPolicies?.length && view.bestGoodCapacity !== undefined ? (zh ? "工站流转约束" : "Station links") : "-")} / ${view.actualBottleneckOperationId ?? (routingConfig.route?.stationFlowPolicies?.length && view.actualGoodOutput !== undefined ? (zh ? "工站流转约束" : "Station links") : "-")}`)}
      ${view.demandQty === undefined ? "" : field(zh ? "本窗口能力余量（计划 / 实跑）" : "Window capacity margin (planned / actual)", `${value(view.bestGap)} / ${value(view.actualGap)}`)}
    </div>
    <p class="note">${zh ? "路线观察窗口按当前产品与路线记住。切换当前工序或工站不会改它，也不会截取不同窗口的交集。" : "The route window is remembered for this product and route. Switching the current operation or station does not change it or intersect different windows."}</p>
    ${view.error ? `<p class="form-error" role="alert">${escapeHtml(view.error)}</p>` : ""}
    ${view.flowIssue ? `<p class="form-error" role="alert">${escapeHtml(view.flowIssue)}</p>` : ""}
    <label class="field" style="display:block;max-width:280px;margin-top:14px;">${zh ? "本窗口需求件数" : "Demand units for this window"}
      <input type="number" min="0" step="1" data-window-demand value="${escapeHtml(rawDemand)}" />
    </label>
    <div class="table-wrap"><table><thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "目标产出/WIP" : "Output/WIP"}</th><th>${zh ? "每件成品所需件数" : "Units per finished product"}</th><th>${zh ? "用量来源" : "Quantity source"}</th></tr></thead><tbody>
      ${requirements.map(item => `<tr><td>${escapeHtml(item.operationId)}</td><td>${escapeHtml(item.outputItem ?? "-")}</td><td>${item.unitsPerFinishedProduct === undefined ? "-" : formatNumber(item.unitsPerFinishedProduct)}</td><td>${item.issue ? escapeHtml({ stage_bom_missing: zh ? "缺少阶段 BOM" : "Stage BOM missing", stage_bom_mismatch: zh ? "阶段 BOM 不匹配" : "Stage BOM mismatch", source_not_effective: zh ? "来源版本未生效" : "Source not effective", quantity_missing: zh ? "缺少工序用量" : "Quantity missing", quantity_invalid: zh ? "工序用量无效" : "Invalid quantity" }[item.issue] ?? item.issue) : escapeHtml(item.source === "stageBom" ? `${zh ? "阶段 BOM" : "Stage BOM"} · ${item.sourceRef ?? "-"}${item.version ? ` · ${item.version}` : ""}` : `${zh ? "本地验证输入" : "Local validation"}${item.version ? ` · ${item.version}` : ""}`)}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="note">${zh ? "本窗口的计划和实跑都按工站 100% 的生产时间计算。70% / 30% 一类占用只用于周或月的综合产能，不在本窗口扣减。工序用量在第一阶段维护；缺少有效用量时路线结果留空。未填本窗口需求时不计算余量。" : "This window's planned and actual results use 100% of each station's production time. Shares such as 70% / 30% apply only to weekly or monthly capacity, not this window. Operation quantities are maintained in stage 1. Route totals require valid quantities. Margin requires window demand."}</p>
    <div class="table-wrap"><table><thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "工站" : "Station"}</th><th>${zh ? "计划生产分钟" : "Planned production min"}</th><th>${zh ? "计划良品能力" : "Planned good units"}</th><th>${zh ? "实跑 OK" : "Actual OK"}</th><th>${zh ? "实跑时间开动率" : "Actual time availability"}</th><th>${zh ? "待补条件" : "Missing inputs"}</th></tr></thead><tbody>
      ${view.stations.map(item => `<tr><td>${escapeHtml(item.operationId)}</td><td>${escapeHtml(item.stationId)}</td><td>${item.plannedProductionMinutes === undefined ? "-" : formatNumber(item.plannedProductionMinutes, 1)}</td><td>${value(item.bestGoodCapacity)}</td><td>${value(item.actualGoodOutput)}</td><td>${item.actualSa === undefined ? "-" : percent(item.actualSa)}</td><td>${item.blockers.length ? item.blockers.map(code => escapeHtml(formatRouteBlocker(code, item.standardWindow))).join("；") : "-"}</td></tr>`).join("") || `<tr><td colspan="7">${zh ? "没有可排产的工站" : "No planning-allowed stations"}</td></tr>`}
    </tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>${zh ? "工序" : "Operation"}</th><th>${zh ? "工站数" : "Stations"}</th><th>${zh ? "计划良品能力" : "Planned good units"}</th><th>${zh ? "实跑 OK" : "Actual OK"}</th></tr></thead><tbody>
      ${view.operations.map(item => `<tr><td>${escapeHtml(item.operationId)}</td><td>${formatNumber(item.stationCount)}</td><td>${value(item.bestGoodCapacity)}</td><td>${value(item.actualGoodOutput)}</td></tr>`).join("")}
    </tbody></table></div>
  </section>`;
}
function renderCycleDiagnosisPanel(diagnosis, summary) {
    const zh = locale === "zh";
    const mean = diagnosis.observedMeanSec === undefined ? "-" : `${formatNumber(diagnosis.observedMeanSec, 1)} ${zh ? "秒" : "s"}`;
    const delta = diagnosis.deltaSec === undefined ? "-" : `${diagnosis.deltaSec > 0 ? "+" : ""}${formatNumber(diagnosis.deltaSec, 1)} ${zh ? "秒" : "s"}`;
    const gate = summary.legacyUnparsed
        ? (zh ? "原文待处理" : "Unparsed text kept")
        : summary.validCount > 0
            ? (zh ? "观察均值已算出" : "Mean is available")
            : (zh ? "尚无有效节拍" : "No valid laps");
    return `<section class="sub-card" style="margin-top:14px;" data-cycle-diagnosis>
    <div class="panel-head"><h3>${zh ? "节拍诊断" : "Cycle diagnosis"}</h3><span class="pill ${summary.validCount > 0 && !summary.legacyUnparsed ? "good" : "warn"}">${gate}</span></div>
    <div class="field-grid">
      ${field(zh ? "当前计划 CT" : "Planned CT", diagnosis.hasPlannedCycle ? `${formatNumber(diagnosis.plannedCycleSec ?? 0, 1)} ${zh ? "秒" : "s"}` : (zh ? "无有效计划 CT" : "No planned CT"))}
      ${field(zh ? "样本均值" : "Sample mean", mean)}
      ${field(zh ? "均值 − 计划 CT" : "Mean − planned CT", delta)}
      ${field(zh ? "采集 / 有效 / 去除" : "Collected / valid / excluded", `${formatNumber(summary.recordedCount)} / ${formatNumber(summary.validCount)} / ${formatNumber(summary.excludedCount)}`)}
    </div>
    ${diagnosis.hasPlannedCycle ? `<p class="note">${zh ? "这里对照当前计划 CT 和检查均值。已有 CT 可以保持，也可以在节拍检查里经确认后矫正。建议表不会自动另提一条标准节拍。" : "This compares the planned CT with the check mean. An existing CT can stay, or be corrected in Cycle Check after confirmation. No extra CT suggestion row is created."}</p>` : `<p class="note">${zh ? "没有有效计划 CT。初始预设可在节拍检查里确认，本阶段也会保留同一入口。" : "There is no effective planned CT. The initial preset can be confirmed in Cycle Check. This stage keeps the same entry."}</p>`}
    ${diagnosis.fasterThanPlanned ? `<p class="form-error" role="alert">${zh ? "样本快于计划 CT。请先复核循环边界、产出件数和每循环件数，再决定是否调整记录。P 不会自动超过 100%。" : "Samples are faster than the planned CT. Review the cycle boundary, output count and pieces per cycle before changing records. P is not raised above 100%."}</p>` : ""}
  </section>`;
}
function renderInitialPresetPanel(operationId, stationId, summary) {
    const zh = locale === "zh";
    const ready = summary.validCount > 0 && !summary.legacyUnparsed && summary.legacyIssues.length === 0 && summary.observedMeanSec !== undefined;
    const blocked = !ready
        ? (summary.legacyUnparsed || summary.legacyIssues.length
            ? (zh ? "旧样本里还有无法解析的原文，不能建立初始预设。" : "Unparsed legacy sample text is still present, so an initial preset cannot be created.")
            : (zh ? "还没有可计入平均的节拍，不能建立初始预设。" : "There is no lap in the average yet, so an initial preset cannot be created."))
        : "";
    return `<section class="sub-card" style="margin-top:14px;" data-initial-preset-panel>
    <div class="panel-head"><h3>${zh ? "建立本地初始预设" : "Establish local initial preset"}</h3><span class="pill warn">${zh ? "本机验证 · 不是主数据批准" : "Local validation · not master-data approval"}</span></div>
    <p class="note">${zh ? "只在没有有效计划 CT 时使用。确认 CT 和每循环件数。P 默认 100%，可以改成大于 0 且不超过 100% 的其他值；非默认值会提示这是人工判断，并再确认一次才写入。原始节拍样本不会被改写，标准 SA 时间轴也不变。Q 仍单独走建议和确认。" : "Use this only when no effective planned CT exists. Confirm CT and pieces per cycle. P defaults to 100% and may be changed to another value above 0 and at most 100%. A non-default value warns that it is a judgement and needs a second confirmation. Raw samples and the planned SA timeline stay unchanged. Q keeps its own suggestion flow."}</p>
    ${blocked ? `<p class="note">${blocked}</p>` : `<form data-initial-preset data-operation-id="${escapeHtml(operationId)}" data-station-id="${escapeHtml(stationId)}">
      <div class="field-grid">
        <div class="field"><label>${zh ? "确认 CT（秒）" : "Confirm CT (sec)"}</label><input name="standardCycleSec" type="number" min="0.0001" step="any" required value="${summary.observedMeanSec ?? ""}" /></div>
        <div class="field"><label>${zh ? "每循环件数" : "Pieces per cycle"}</label><input name="piecesPerCycle" type="number" min="1" step="1" required /></div>
        <div class="field"><label>${zh ? "P (%)" : "P (%)"}</label><input name="performanceRatePercent" type="number" min="0.1" max="100" step="any" required value="100" /></div>
      </div>
      <div class="action-bar"><span>${zh ? `证据 ${escapeHtml(`cycle-check:${selectedProductId}:${operationId}:${stationId}`)}` : `Evidence ${escapeHtml(`cycle-check:${selectedProductId}:${operationId}:${stationId}`)}`}</span>
        <button class="button" type="submit">${zh ? "建立本地初始预设" : "Establish local initial preset"}</button></div>
    </form>`}
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
        ? plannedProductionMinutes * 60 / parameter.standardCycleSec * parameter.piecesPerCycle : undefined;
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
    <p class="note">${zh ? "先本地确认，再明确发布 CT/P/Q 到计划参数。已有计划 CT 时，普通 R&R 不会因为样本均值要求确认新 CT。若在第一阶段主动新建 CT 版本，仍要确认 P 已按新 CT 复核。确认不改计划；发布只影响生效日之后的当前会话件数，标准 SA 时间轴不变。休息超时、维保、计划停机及换型差异只进入 Actual SA 和待纠偏。" : "Confirm locally, then explicitly publish CT/P/Q. An ordinary R&R does not ask for a new CT just because the sample mean differs. A CT version created in stage 1 still requires P reviewed against that CT. The planned SA timeline stays unchanged. Break overruns, maintenance, planned stops and setup deltas stay in Actual SA."}</p>
    <div class="field-grid">
      ${field(zh ? "当前生效参数版本" : "Active parameter version", parameter?.parameterId ?? "-")}
      ${field(zh ? "当前 CT / P / Q" : "Current CT / P / Q", parameter ? `${formatNumber(parameter.standardCycleSec, 1)}s / ${percent(parameter.performanceRate)} / ${percent(parameter.qualityRate)}` : "-")}
      ${field(zh ? "当前窗口计划良品能力（件）" : "Planned good-unit potential (window)", plannedGoodUnits === undefined ? "-" : formatOutputUnits(plannedGoodUnits))}
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
        ...evidence.explicit.map(item => `<tr><td>${locale === "zh" ? "已记录异常" : "Recorded abnormal"}</td><td>${escapeHtml(formatTimelineKind(item.category))}</td><td>${escapeHtml(formatOptionalMinutePoint(item.startMinute))} - ${escapeHtml(formatOptionalMinutePoint(item.endMinute))}</td><td>${formatNumber(item.minutes, 1)}</td><td><div class="recoverable-edit"><input data-recoverable-event="${escapeHtml(item.sourceEventId)}" data-saved-recoverable="${item.recoverableMinutes}" data-recoverable-confirmed="${item.recoverableConfirmed ? "1" : "0"}" type="number" min="0" max="${item.minutes}" step="1" value="${item.recoverableMinutes}" aria-label="${locale === "zh" ? "可补救分钟" : "Recoverable minutes"}" /><button type="button" class="button secondary${item.recoverableConfirmed ? " is-confirmed" : ""}" data-confirm-recoverable="${escapeHtml(item.sourceEventId)}">${locale === "zh" ? "确认" : "Confirm"}</button></div></td><td>${formatNumber(item.minutes - item.recoverableMinutes, 1)}</td><td>${escapeHtml(item.evidenceSource || "-")}</td><td>${item.isEstimated ? (locale === "zh" ? "是" : "Yes") : (locale === "zh" ? "否" : "No")}</td><td>${escapeHtml(item.sourceEventId)}</td></tr>`),
        ...evidence.inferred.map(item => `<tr><td>${locale === "zh" ? "推断损失" : "Inferred loss"}</td><td>${locale === "zh" ? "待归因" : "Unclassified"}</td><td>${escapeHtml(formatOptionalMinutePoint(item.startMinute))} - ${escapeHtml(formatOptionalMinutePoint(item.endMinute))}</td><td>${formatNumber(item.estimatedMinutes, 1)}</td><td>-</td><td>-</td><td>${locale === "zh" ? "产出反推" : "Output inference"}</td><td>${locale === "zh" ? "是" : "Yes"}</td><td>${escapeHtml(item.sourceProductionEventId)}</td></tr>`),
    ].join("");
    return `
    <section class="sub-card" style="margin-top:14px;">
      <div class="panel-head"><h3>${locale === "zh" ? "异常证据与推断损失" : "Abnormal evidence and inferred loss"}</h3><span class="pill ${evidence.readyForCalculation ? "good" : "warn"}">${evidence.readyForCalculation ? (locale === "zh" ? "计算数据完整" : "Calculation inputs complete") : (locale === "zh" ? "计算数据待补齐" : "Calculation inputs incomplete")}</span></div>
      <div class="field-grid">
        ${field(locale === "zh" ? "已记录异常分钟" : "Recorded abnormal minutes", formatNumber(evidence.explicitMinutes, 1))}
        ${field(locale === "zh" ? "待确认推断分钟" : "Inferred minutes to confirm", formatNumber(evidence.inferredMinutes, 1))}
      </div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>${locale === "zh" ? "来源类型" : "Evidence type"}</th><th>${locale === "zh" ? "类别" : "Category"}</th><th>${locale === "zh" ? "起止时钟" : "Time window"}</th><th>${locale === "zh" ? "分钟" : "Minutes"}</th><th>${locale === "zh" ? "可补救分钟" : "Recoverable minutes"}</th><th>${locale === "zh" ? "进入排产" : "Into planning"}</th><th>${locale === "zh" ? "证据来源" : "Source"}</th><th>${locale === "zh" ? "估算" : "Estimated"}</th><th>${locale === "zh" ? "原始事件ID" : "Source event ID"}</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="note">${locale === "zh" ? "暂无异常证据或推断损失。" : "No abnormal evidence or inferred loss yet."}</p>`}
      ${evidence.blockers.length ? `<ul class="message-list">${evidence.blockers.map(blocker => `<li>${escapeHtml(blockerLabels[blocker.code][locale === "zh" ? 0 : 1])}${blocker.sourceEventId ? ` · ${escapeHtml(blocker.sourceEventId)}` : ""}</li>`).join("")}</ul>` : ""}
      ${evidence.notices.length ? `<ul class="message-list">${evidence.notices.map(notice => `<li>${escapeHtml(noticeLabels[notice.code][locale === "zh" ? 0 : 1])}${notice.sourceEventId ? ` · ${escapeHtml(notice.sourceEventId)}` : ""}</li>`).join("")}</ul>` : ""}
      <p class="note">${locale === "zh" ? "可补救分钟不能超过该段已记录分钟。填好后点该行「确认」，进入排产和 Most likely 才改变；未确认的输入不会生效。实跑记录本身不改。推断损失不进入班次预留。" : "Recoverable minutes cannot exceed the recorded interval. Confirm the row before Most likely changes. The recorded interval stays unchanged."}</p>
    </section>
  `;
}
function renderLocalTrialStatus() {
    const routeId = selectedRouteId() ?? "";
    const route = scenarioState.routes.find(item => item.routeId === routeId);
    if (!route || !isLocalDraftRoute(route))
        return "";
    const trial = assessLocalTrial(scenarioState, selectedProductId, routeId);
    const zh = locale === "zh";
    const gaps = trial.gaps.map(localIssueText);
    const formal = trial.formalIssues.map(issue => issue.message);
    return `
    <section class="sub-card" style="margin-bottom:14px;">
      <h3>${zh ? "本地试算与正式发布" : "Local trial and formal release"}</h3>
      <div class="field-grid">
        ${field(zh ? "本地试算" : "Local trial", trial.localFlowOpen ? (zh ? "可继续记录标准 SA / R&R" : "SA / R&R can continue") : (zh ? "未打开" : "Closed"))}
        ${field(zh ? "本工站计算" : "Station calculation", trial.calculable ? (zh ? "参数已齐" : "Parameters present") : (zh ? "待补" : "Incomplete"))}
        ${field(zh ? "正式发布" : "Formal release", trial.formalReady ? (zh ? "可通过" : "Ready") : (zh ? "仍被拒绝" : "Still rejected"))}
      </div>
      ${gaps.length ? `<p class="note">${zh ? "待补" : "Still missing"}：${escapeHtml(gaps.join("；"))}</p>` : ""}
      ${formal.length ? `<p class="note">${zh ? "正式发布尚缺" : "Formal release still needs"}：${escapeHtml(formal.join("；"))}</p>` : ""}
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
    const selectedRoute = scenarioState.routes.find(item => item.routeId === selectedRouteId());
    const viewingLocalDraft = selectedRoute ? isLocalDraftRoute(selectedRoute) : false;
    const canEnterAnalysis = !viewingLocalDraft && preflight.ready && preflight.blockers.length === 0;
    preflightRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${t("parameterPreflight")} · ${escapeHtml(selectedRoute?.routeId ?? "-")}</p>
        <h2>${viewingLocalDraft ? (locale === "zh" ? "正式发布仍被拒绝" : "Formal release is still rejected") : (canEnterAnalysis ? t("readyForCapacity") : t("blockedBeforeCapacity"))}</h2>
      </div>
      <span class="pill ${canEnterAnalysis ? "good" : "bad"}">${canEnterAnalysis ? t("ready") : t("blocked")}</span>
    </div>
    ${renderLocalTrialStatus()}
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
function localRouteId() {
    const routeId = selectedRouteId() ?? "";
    const route = scenarioState.routes.find(item => item.routeId === routeId);
    return route && isLocalDraftRoute(route) ? routeId : "";
}
function planScopeKey(productId, stationId) {
    const routeId = localRouteId();
    return routeId ? `${routeId}::${productId}::${stationId}` : `${productId}::${stationId}`;
}
function actualScopeKey(productId, operationId, stationId) {
    const routeId = localRouteId();
    return routeId ? `${routeId}::${productId}::${operationId}::${stationId}` : `${productId}::${operationId}::${stationId}`;
}
function updateLocalValidationBanner(routingConfig) {
    const banner = document.querySelector("#localValidationBanner");
    if (!banner)
        return;
    const local = routingConfig.route ? isLocalDraftRoute(routingConfig.route) : false;
    banner.hidden = !local;
    banner.textContent = local
        ? (locale === "zh"
            ? "本地验证 · 本机数据，不是正式主数据。正式发布门禁仍然拒绝草稿工艺和草稿路线。"
            : "Local validation · stored on this browser, not formal master data. Formal release still rejects draft processes and routes.")
        : "";
}
function localIssueText(issue) {
    if (locale !== "zh")
        return issue.message;
    if (issue.code === "station_incompatible" && issue.field === "equipmentId")
        return "待投资资源只填写规划资源号，不填写申报设备编号。";
    if (issue.code === "missing_field" && issue.field === "equipmentId")
        return "本地申报现有设备需要填写申报设备编号；它不是物理 UID。";
    if (issue.code === "missing_field" && issue.field === "sourceReference")
        return "请填写资料来源或规划依据。";
    const labels = {
        missing_field: "还有必填项没写",
        invalid_name: "工序名称需为 1–80 个字符",
        duplicate_process: "工艺编号已存在，没有写入第二条",
        missing_process_type: "类型清单里没有这个工艺类型",
        duplicate_process_type: "目录中已有该工艺类型，请直接选择",
        duplicate_business_code: "企业业务编号已存在，没有写入",
        similar_name: "名称相似，没有自动合并",
        duplicate_operation: "工序编号已存在",
        duplicate_sequence: "工序顺序重复或无效",
        duplicate_station: "工站排产键或申报设备编号已存在",
        duplicate_assignment: "这个工站已经分配过",
        missing_process: "工艺清单里没有这个工艺",
        route_not_found: "路线或工序不存在",
        source_route_missing: "只能从已发布样例路线复制",
        not_local_draft: "当前不是本地验证路线",
        station_missing: "工站不存在或还没分配",
        station_incompatible: "工站不承接当前工艺类型；请在工艺库核对候选类型",
        invalid_station_flow: "工站连线无效；只能连接相邻工序的可排产工站，至少选一组",
        process_group_unbound: "历史工艺组规则不完整；请核对旧数据",
        backup_not_plannable: "备用工站在客户批准前不能排产",
        investment_not_plannable: "待投资工站不能排产",
        parameter_incomplete: "CT、每循环件数、P、Q 还没填完整",
        stage_reference_missing: "还没有阶段物料 / WIP 引用",
    };
    const label = labels[issue.code] ?? issue.message;
    if (issue.code === "duplicate_process" || !issue.field)
        return label;
    return `${label}（${issue.field}）`;
}
function persistLocalValidation() {
    try {
        const store = extractLocalValidation(scenarioState);
        saveLocalState(localValidationStorageKey, JSON.stringify(store));
    }
    catch { /* Browser storage may be disabled. */ }
}
function restoreLocalValidation() {
    try {
        const raw = localStorage.getItem(localValidationStorageKey);
        if (!raw)
            return;
        const parsed = parseLocalValidationStore(JSON.parse(raw));
        if (!parsed.ok) {
            localStoreError = locale === "zh"
                ? "本机工艺数据无法按当前版本读取，原数据还在，没有清空。"
                : "Saved local process data does not match this version. It was left in place and was not cleared.";
            return;
        }
        applyLocalValidation(scenarioState, parsed.store);
        if (parsed.migratedFrom) {
            persistLocalValidation();
            localValidationNotice = locale === "zh"
                ? "已沿用本机原有工艺，内部编号没有改写。"
                : "Existing local processes were kept. Internal IDs were not rewritten.";
        }
    }
    catch {
        localStoreError = locale === "zh"
            ? "本机工艺数据无法读取，原数据还在，没有清空。"
            : "Saved local process data could not be read. It was left in place and was not cleared.";
    }
}
function dropLocalRuntimeState() {
    const maps = [plannedSaContexts, standardSaDayConfigs, frozenStandardWindows, copyProjectionDrafts, stationWeekSnapshots, rnrActualEventsByContext, rnrDrafts];
    for (const map of maps) {
        for (const key of [...map.keys()]) {
            if (key.startsWith("local-"))
                map.delete(key);
        }
    }
    try {
        const keys = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith("capa-rnr-evidence-v2:")) {
                const routeId = decodeURIComponent(key.split(":")[2] ?? "");
                if (routeId.startsWith("local-"))
                    keys.push(key);
            }
        }
        keys.forEach(removeLocalState);
    }
    catch { /* Browser storage may be disabled. */ }
}
function libraryTypeMatches(item, query) {
    return [item.name, libraryDisplayText(item.name), item.processTypeId]
        .join(" ")
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase());
}
function libraryTypeOptions() {
    const zh = locale === "zh";
    const types = scenarioState.processTypes ?? [];
    const typeQuery = libraryTypeQuery.trim().toLocaleLowerCase();
    return [`<option value="">${zh ? "选择工艺类型" : "Choose a process type"}</option>`]
        .concat(["manufacturing", "quality"].map(family => {
        const label = processFamilyLabel(family);
        const options = types
            .filter(item => processTypeFamilyOf(item) === family)
            .filter(item => !typeQuery || libraryTypeMatches(item, typeQuery))
            .map(item => `<option value="${escapeHtml(item.processTypeId)}"${item.processTypeId === libraryForm.processTypeId ? " selected" : ""}>${escapeHtml(libraryDisplayText(item.name))}${isLocalDraftProcessType(item) ? (zh ? " · 本地类型" : " · local type") : ""}</option>`)
            .join("");
        return options ? `<optgroup label="${escapeHtml(label)}">${options}</optgroup>` : "";
    }))
        .join("");
}
function updateLibraryTypeResults() {
    const results = processLibraryRoot.querySelector("#libraryTypeResults");
    if (!results)
        return;
    const query = libraryTypeQuery.trim();
    results.hidden = !query;
    if (!query) {
        results.innerHTML = "";
        return;
    }
    const matches = (scenarioState.processTypes ?? []).filter(item => libraryTypeMatches(item, query));
    results.innerHTML = matches.length
        ? matches.map(item => `<button class="library-type-result" type="button" data-library-type="${escapeHtml(item.processTypeId)}" aria-pressed="${item.processTypeId === libraryForm.processTypeId}">
      <span>${escapeHtml(libraryDisplayText(item.name))}</span><small>${escapeHtml(processFamilyLabel(processTypeFamilyOf(item)))}</small>
    </button>`).join("")
        : `<p class="note">${locale === "zh" ? "目录中没有匹配的类型。" : "No matching type in the catalog."}</p>`;
    results.querySelectorAll("[data-library-type]").forEach(button => {
        button.addEventListener("click", () => {
            readLibraryForm();
            libraryForm.processTypeId = button.dataset.libraryType ?? "";
            renderProcessLibrary();
        });
    });
}
function libraryProcessSearchText(process) {
    const typeName = scenarioState.processTypes?.find(item => item.processTypeId === process.processType)?.name ?? process.processType;
    return [process.processId, process.name, libraryDisplayText(process.name), process.businessCode ?? "", process.processType, typeName, libraryDisplayText(typeName), process.version]
        .join(" ")
        .toLocaleLowerCase();
}
function updateLibraryProcessSearch() {
    const query = libraryQuery.trim().toLocaleLowerCase();
    let visible = 0;
    processLibraryRoot.querySelectorAll("[data-library-search]").forEach(row => {
        row.hidden = !!query && !(row.dataset.librarySearch ?? "").includes(query);
        if (!row.hidden)
            visible++;
    });
    const empty = processLibraryRoot.querySelector("#libraryNoMatches");
    if (empty)
        empty.hidden = visible > 0;
}
function renderProcessLibrary() {
    const zh = locale === "zh";
    const processes = [...(scenarioState.processMasters ?? [])]
        .sort((a, b) => Number(isLocalDraftProcess(b)) - Number(isLocalDraftProcess(a)) || a.name.localeCompare(b.name, zh ? "zh" : "en"));
    const selected = (scenarioState.processMasters ?? []).find(process => process.processId === librarySelectedProcessId);
    const stationGroups = scenarioState.stationGroups ?? [];
    const stationRows = (scenarioState.stations ?? []).map(station => {
        const local = station.sourceSystem === "local-validation";
        const status = local
            ? station.investmentStatus === "existing" ? (zh ? "本地申报现有设备" : "Locally declared existing") : (zh ? "待投资规划资源" : "Planned resource")
            : station.investmentStatus === "existing" ? (zh ? "样例现有" : "Sample existing") : (zh ? "样例待投资" : "Sample planned");
        const verification = local
            ? station.investmentStatus === "existing" ? (zh ? "本地复核 · 模拟" : "Local review · simulation") : (zh ? "未核验 · 规划" : "Unverified · planned")
            : (zh ? "未提供现场核验" : "No site verification supplied");
        const legacyTypes = (scenarioState.processMasters ?? [])
            .filter(process => process.compatibleStationGroupIds?.includes(station.stationGroupId ?? ""))
            .map(process => process.processType);
        const types = station.qualifiedProcessTypeIds ?? [...new Set(legacyTypes)];
        const typeText = types.map(processTypeLabel).join("、") || "-";
        const sourceNote = station.qualifiedProcessTypeIds?.length ? "" : station.stationGroupId && stationGroups.some(group => group.stationGroupId === station.stationGroupId)
            ? (zh ? " · 历史组规则" : " · legacy group rule") : "";
        return `<tr><td>${escapeHtml(station.equipmentId ?? "-")}</td><td>${escapeHtml(station.stationId)}</td><td>${escapeHtml(formatKnownText(station.name))}</td><td>${escapeHtml(typeText + sourceNote)}</td><td>${status}</td><td>${escapeHtml(station.sourceReference ?? station.sourceSystem ?? "-")}</td><td>${verification}</td></tr>`;
    }).join("");
    const candidateTypeOptions = (scenarioState.processTypes ?? []).map(type => `<label class="library-review-check"><input type="checkbox" name="qualifiedProcessTypeIds" value="${escapeHtml(type.processTypeId)}">${escapeHtml(processTypeLabel(type.processTypeId))} / ${escapeHtml(type.processTypeId)}</label>`).join("");
    const selectedRefs = selected ? listProcessRouteReferences(scenarioState, selected.processId) : [];
    const rows = processes.map(process => {
        const refCount = listProcessRouteReferences(scenarioState, process.processId).length;
        return `<tr data-library-search="${escapeHtml(libraryProcessSearchText(process))}">
      <td><button class="button secondary" type="button" data-library-process="${escapeHtml(process.processId)}">${zh ? "查看" : "View"}</button></td>
      <td>${escapeHtml(process.processId)}</td>
      <td>${escapeHtml(libraryDisplayText(process.name))}</td>
      <td>${escapeHtml(processFamilyLabel(processTypeFamilyOfId(process.processType)))}</td>
      <td>${escapeHtml(processSourceLabel(process))}</td>
      <td>${escapeHtml(process.version)}</td>
      <td>${escapeHtml(processStatusLabel(process))}</td>
      <td>${escapeHtml(zh ? `${refCount} 条路线工序` : `${refCount} route operation${refCount === 1 ? "" : "s"}`)}</td>
    </tr>`;
    }).join("");
    processLibraryRoot.innerHTML = `
    <div class="panel-head">
      <div>
        <p class="eyebrow">${zh ? "基础资料 · 四阶段之外" : "Master data · outside the four stages"}</p>
        <h2>${zh ? "工艺库" : "Process Library"}</h2>
      </div>
      <button class="button secondary" type="button" id="returnFromLibrary">${zh ? "返回排产" : "Back to scheduling"}</button>
    </div>
    <p class="note">${zh ? "先确认工艺类型，再登记可承接该类型的设备；产品路线决定实际工站角色与放行。工站排产键不是物理设备 UID。" : "Choose a process type, register candidate equipment, then decide station roles and release on the product route. A station planning key is not a physical equipment UID."}</p>
    ${localStoreError ? `<p class="form-error" role="alert">${escapeHtml(localStoreError)}</p>` : ""}
    <section class="library-step">
      <h3><span>01</span>${zh ? "选择工艺类型" : "Choose a process type"}</h3>
      <div class="mini-grid">
        <label class="field">${zh ? "检索类型目录" : "Search type catalog"}<input id="libraryTypeSearch" type="search" value="${escapeHtml(libraryTypeQuery)}" placeholder="${zh ? "例如：机加工" : "e.g. Machining"}"></label>
        <label class="field">${zh ? "已有工艺类型" : "Existing process type"}<select id="libraryProcessType">${libraryTypeOptions()}</select></label>
      </div>
      <div id="libraryTypeResults" class="library-type-results" aria-live="polite"></div>
      <details id="libraryNewTypeDetails" ${libraryShowNewType ? "open" : ""}>
        <summary class="backup-toggle">${zh ? "目录里没有？申请新增类型" : "Type missing? Add a local type"}</summary>
        <div class="mini-grid">
          <label class="field">${zh ? "新类型名称" : "New type name"}<input id="libraryNewTypeName" type="text" value="${escapeHtml(libraryForm.newTypeName)}"></label>
          <label class="field">${zh ? "类型归类" : "Type family"}<select id="libraryNewTypeFamily"><option value="manufacturing"${libraryForm.newTypeFamily === "manufacturing" ? " selected" : ""}>${zh ? "制造工艺" : "Manufacturing"}</option><option value="quality"${libraryForm.newTypeFamily === "quality" ? " selected" : ""}>${zh ? "质量门" : "Quality gate"}</option></select></label>
        </div>
        <label class="library-review-check"><input id="libraryTypeReviewed" type="checkbox">${zh ? "我已检查类型目录，确认没有同义或重复类型" : "I checked the catalog for equivalent or duplicate types"}</label>
        <button class="button secondary" type="button" id="createLibraryType">${zh ? "确认新增本地类型" : "Confirm local type"}</button>
      </details>
    </section>
    <section class="library-step">
      <h3><span>02</span>${zh ? "建立具体工艺" : "File a specific process"}</h3>
      <div class="field-grid library-process-fields">
        <label class="field">${zh ? "工艺名称" : "Process name"}<input id="libraryProcessName" type="text" value="${escapeHtml(libraryForm.name)}" placeholder="${zh ? "例如：压铸" : "e.g. Die casting"}" title="${zh ? "填写可复用的工艺名称；产品专属工序名称在路线编排中填写" : "Name a reusable process; set product-specific operation names in the route editor"}"></label>
        <label class="field">${zh ? "企业业务编号 · 可选" : "Business code · optional"}<input id="libraryBusinessCode" type="text" value="${escapeHtml(libraryForm.businessCode)}"></label>
        <label class="field">${zh ? "说明 · 可选" : "Description · optional"}<input id="libraryProcessDescription" type="text" value="${escapeHtml(libraryForm.description)}"></label>
      </div>
      <div class="panel-actions"><button class="button" type="button" id="createLibraryProcess" ${libraryForm.processTypeId ? "" : "disabled"}>${zh ? "写入工艺库" : "Save process"}</button></div>
      ${libraryNotice ? `<p class="form-ok" role="status">${escapeHtml(libraryNotice)}</p>` : ""}
      ${libraryError ? `<p class="form-error" role="alert">${escapeHtml(libraryError)}</p>` : ""}
    </section>
    <section class="library-step">
      <h3><span>03</span>${zh ? "工站与设备资源" : "Station resources"}</h3>
      <p class="note">${zh ? "前置系统尚未接入时在此补录模拟资源。申报设备编号不是物理设备 UID；本地确认只用于模拟计算，待投资资源不计入可排产能力。" : "Register local simulation resources here while upstream integration is unavailable. A declared equipment code is not a physical UID; planned resources do not count as schedulable capacity."}</p>
      <form id="libraryStationForm" class="form-section">
        <div class="field-grid">
          <label class="field">${zh ? "资源状态" : "Resource status"}<select name="investmentStatus"><option value="existing">${zh ? "本地申报现有设备" : "Locally declared existing equipment"}</option><option value="plannedInvestment">${zh ? "待投资规划资源" : "Planned investment resource"}</option></select></label>
          <label class="field" id="libraryEquipmentCodeField"><span>${zh ? "申报设备编号（非 UID）" : "Declared equipment code (not UID)"}</span><input name="equipmentId" required></label>
          <label class="field"><span id="libraryStationKeyLabel">${zh ? "工站排产键" : "Station planning key"}</span><input name="stationId" required></label>
          <label class="field">${zh ? "工站名称" : "Station name"}<input name="name" required></label>
          <label class="field">${zh ? "资料来源/规划依据" : "Source / planning basis"}<input name="sourceReference" required></label>
          <fieldset class="library-station-types"><legend id="libraryQualifiedTypeLegend">${zh ? "本地确认可承接工艺类型" : "Candidate process types"}</legend>${candidateTypeOptions}</fieldset>
        </div>
        <label class="checkbox-field" id="libraryQualificationCheck"><input name="qualificationConfirmed" type="checkbox" required> ${zh ? "已复核申报编号、来源及候选工艺类型；仅用于本地模拟" : "I reviewed the declared code, source and candidate process types for local simulation only"}</label>
        <div class="panel-actions"><button class="button" type="submit">${zh ? "登记工站" : "Register station"}</button></div>
      </form>
      ${libraryNotice ? `<p class="form-ok" role="status">${escapeHtml(libraryNotice)}</p>` : ""}
      ${libraryError ? `<p class="form-error" role="alert">${escapeHtml(libraryError)}</p>` : ""}
      <div class="table-wrap"><table class="library-table"><thead><tr><th>${zh ? "申报设备编号" : "Declared code"}</th><th>${zh ? "工站/规划资源号" : "Station / plan key"}</th><th>${zh ? "名称" : "Name"}</th><th>${zh ? "候选工艺类型" : "Candidate types"}</th><th>${zh ? "状态" : "Status"}</th><th>${zh ? "资料来源" : "Source"}</th><th>${zh ? "核验状态" : "Verification"}</th></tr></thead><tbody>${stationRows}</tbody></table></div>
    </section>
    <section class="library-step">
      <div class="panel-head"><h3><span>04</span>${zh ? "进入工艺路线" : "Continue to route"}</h3><button class="button secondary" type="button" id="libraryGoRoute">${zh ? "打开工艺路线与工站" : "Open route editor"}</button></div>
    </section>
    <section class="library-step">
      <h3>${zh ? "工艺清单" : "Process list"}</h3>
      <label class="field">${zh ? "搜索工艺" : "Search processes"}<input id="librarySearch" type="search" value="${escapeHtml(libraryQuery)}"></label>
      <div class="table-wrap"><table class="library-table">
        <thead><tr><th></th><th>${zh ? "内部工艺编号" : "Internal process ID"}</th><th>${zh ? "名称" : "Name"}</th><th>${zh ? "类型" : "Type"}</th><th>${zh ? "来源" : "Source"}</th><th>${zh ? "版本" : "Version"}</th><th>${zh ? "状态" : "Status"}</th><th>${zh ? "路线引用" : "Route use"}</th></tr></thead>
        <tbody>${rows}<tr id="libraryNoMatches" ${rows ? "hidden" : ""}><td colspan="8">${zh ? "没有匹配的工艺。" : "No matching process."}</td></tr></tbody>
      </table></div>
    </section>
    ${selected ? `
      <section class="library-step">
        <h3>${escapeHtml(libraryDisplayText(selected.name))}</h3>
        <div class="field-grid">
          ${libraryField(zh ? "内部工艺编号" : "Internal process ID", selected.processId)}
          ${libraryField(zh ? "具体类型" : "Specific type", processTypeLabel(selected.processType))}
          ${libraryField(zh ? "类型归类" : "Type group", processFamilyLabel(processTypeFamilyOfId(selected.processType)))}
          ${libraryField(zh ? "版本" : "Version", selected.version)}
          ${libraryField(zh ? "状态" : "Status", processStatusLabel(selected))}
          ${libraryField(zh ? "来源" : "Source", processSourceLabel(selected))}
          ${libraryField(zh ? "企业业务编号" : "Business code", selected.businessCode || (zh ? "未填" : "Not set"))}
          ${libraryField(zh ? "创建时间" : "Created", selected.createdAt || (zh ? "早期记录未记" : "Not recorded"))}
          ${libraryField(zh ? "说明" : "Description", selected.description || (zh ? "未填" : "Not set"))}
        </div>
        <p class="note">${selectedRefs.length
        ? escapeHtml(zh ? "这条工艺已被路线工序引用。改名不在本包里，已发布路线不会被静默改写。" : "Route operations already reference this process. Renaming is outside this package, and released routes are not rewritten.")
        : escapeHtml(zh ? "还没有任何路线工序引用它。" : "No route operation references it yet.")}</p>
        ${selectedRefs.length ? `<ul class="message-list">${selectedRefs.map(item => `<li>${escapeHtml(item.routeId)} · ${escapeHtml(String(item.sequence))} · ${escapeHtml(item.operationId)} · ${escapeHtml(item.productId)}</li>`).join("")}</ul>` : ""}
      </section>
    ` : ""}
  `;
    bindProcessLibrary();
    updateLibraryTypeResults();
    updateLibraryProcessSearch();
}
function libraryField(label, value) {
    return `<div class="field"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}
const libraryGlossary = [
    ["Machining", "机加工"],
    ["Assembly", "装配"],
    ["Quality gate", "质量门"],
    ["Packaging", "包装"],
    ["Cleaning", "清洗"],
    ["Die casting", "压铸"],
    ["Ultrasonic cleaning", "超声清洗"],
];
function libraryDisplayText(value) {
    const trimmed = value.trim();
    for (const [en, zh] of libraryGlossary) {
        const sameEn = trimmed.localeCompare(en, undefined, { sensitivity: "accent" }) === 0;
        if (locale === "zh" && (sameEn || trimmed === zh))
            return zh;
        if (locale !== "zh" && (sameEn || trimmed === zh))
            return en;
    }
    return locale === "zh" ? formatKnownText(trimmed) : trimmed;
}
function processFamilyLabel(family) {
    if (family === "quality")
        return locale === "zh" ? "质量门" : "Quality gate";
    return locale === "zh" ? "制造工艺" : "Manufacturing";
}
function processTypeFamilyOfId(processTypeId) {
    const found = scenarioState.processTypes?.find(item => item.processTypeId === processTypeId);
    if (found)
        return processTypeFamilyOf(found);
    return processTypeId.trim().toLowerCase() === "qualitygate" ? "quality" : "manufacturing";
}
function processTypeLabel(processTypeId) {
    const found = scenarioState.processTypes?.find(item => item.processTypeId === processTypeId);
    return libraryDisplayText(found?.name ?? processTypeId);
}
function processStatusLabel(process) {
    if (process.sourceSystem === "local-validation" && process.status === "draft")
        return locale === "zh" ? "本地草稿" : "Local draft";
    if (process.status === "released")
        return locale === "zh" ? "已发布样例" : "Released sample";
    return process.status;
}
function processSourceLabel(process) {
    if (process.sourceSystem === "local-validation" && process.status === "draft")
        return locale === "zh" ? "本地建档" : "Local filing";
    if (process.status === "released")
        return locale === "zh" ? "样例" : "Sample";
    return process.sourceSystem;
}
function readLibraryForm() {
    const read = (id) => processLibraryRoot.querySelector(`#${id}`)?.value ?? "";
    libraryForm = {
        name: read("libraryProcessName"),
        processTypeId: read("libraryProcessType"),
        description: read("libraryProcessDescription"),
        businessCode: read("libraryBusinessCode"),
        newTypeName: read("libraryNewTypeName"),
        newTypeFamily: read("libraryNewTypeFamily") === "quality" ? "quality" : "manufacturing",
    };
}
function similarLibraryText(warnings) {
    if (!warnings.length)
        return "";
    const names = warnings.map(item => {
        const process = scenarioState.processMasters?.find(entry => entry.processId === item.field);
        const processType = scenarioState.processTypes?.find(entry => entry.processTypeId === item.field);
        return process?.name ?? processType?.name ?? item.field ?? "";
    }).filter(Boolean);
    return locale === "zh"
        ? `与「${names.join("、")}」名称相似，没有自动合并。`
        : `Similar to ${names.join(", ")}. Nothing was merged.`;
}
function commitLibraryChange(result, notice) {
    if ("issues" in result) {
        libraryNotice = "";
        libraryError = result.issues.map(localIssueText).join("；");
        renderProcessLibrary();
        return;
    }
    libraryError = "";
    libraryNotice = notice;
    scenarioState = result.scenario;
    persistLocalValidation();
    render(selectedProductId);
}
function bindProcessLibrary() {
    const stationForm = processLibraryRoot.querySelector("#libraryStationForm");
    const stationStatus = stationForm?.querySelector('select[name="investmentStatus"]');
    const updateStationFields = () => {
        const existing = stationStatus?.value === "existing";
        const equipmentField = stationForm?.querySelector("#libraryEquipmentCodeField");
        const equipmentInput = stationForm?.querySelector('input[name="equipmentId"]');
        const qualificationField = stationForm?.querySelector("#libraryQualificationCheck");
        const qualificationInput = qualificationField?.querySelector("input");
        const keyLabel = stationForm?.querySelector("#libraryStationKeyLabel");
        const typeLegend = stationForm?.querySelector("#libraryQualifiedTypeLegend");
        if (equipmentField)
            equipmentField.hidden = !existing;
        if (equipmentInput) {
            equipmentInput.required = existing;
            if (!existing)
                equipmentInput.value = "";
        }
        if (qualificationField)
            qualificationField.hidden = !existing;
        if (qualificationInput) {
            qualificationInput.required = existing;
            if (!existing)
                qualificationInput.checked = false;
        }
        if (keyLabel)
            keyLabel.textContent = existing ? (locale === "zh" ? "工站排产键" : "Station planning key") : (locale === "zh" ? "规划资源号" : "Planning resource ID");
        if (typeLegend)
            typeLegend.textContent = existing ? (locale === "zh" ? "本地确认可承接工艺类型" : "Candidate process types") : (locale === "zh" ? "拟承接工艺类型" : "Planned process types");
    };
    stationStatus?.addEventListener("change", updateStationFields);
    updateStationFields();
    stationForm?.addEventListener("submit", event => {
        event.preventDefault();
        const form = event.currentTarget;
        const values = new FormData(form);
        const result = createLocalStation(scenarioState, {
            stationId: String(values.get("stationId") ?? ""), equipmentId: String(values.get("equipmentId") ?? ""), name: String(values.get("name") ?? ""),
            investmentStatus: values.get("investmentStatus") === "plannedInvestment" ? "plannedInvestment" : "existing",
            sourceReference: String(values.get("sourceReference") ?? ""),
            qualifiedProcessTypeIds: values.getAll("qualifiedProcessTypeIds").map(String),
            qualificationConfirmed: values.get("qualificationConfirmed") === "on",
        });
        commitLibraryChange(result, locale === "zh" ? "工站已登记到本地资源库。" : "Station registered in the local resource library.");
    });
    processLibraryRoot.querySelector("#libraryGoRoute")?.addEventListener("click", () => {
        setWorkflowStage("routing");
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    processLibraryRoot.querySelector("#libraryNewTypeDetails")?.addEventListener("toggle", event => {
        libraryShowNewType = event.currentTarget.open;
    });
    const typeSearch = processLibraryRoot.querySelector("#libraryTypeSearch");
    const updateTypeSearch = () => {
        libraryTypeQuery = typeSearch?.value ?? "";
        const selected = scenarioState.processTypes?.find(item => item.processTypeId === libraryForm.processTypeId);
        if (libraryTypeQuery.trim() && selected && !libraryTypeMatches(selected, libraryTypeQuery)) {
            libraryForm.processTypeId = "";
            const create = processLibraryRoot.querySelector("#createLibraryProcess");
            if (create)
                create.disabled = true;
        }
        const select = processLibraryRoot.querySelector("#libraryProcessType");
        if (select)
            select.innerHTML = libraryTypeOptions();
        updateLibraryTypeResults();
    };
    typeSearch?.addEventListener("input", event => {
        if (!event.isComposing)
            updateTypeSearch();
    });
    typeSearch?.addEventListener("compositionend", updateTypeSearch);
    processLibraryRoot.querySelector("#libraryProcessType")?.addEventListener("change", () => {
        readLibraryForm();
        renderProcessLibrary();
    });
    processLibraryRoot.querySelector("#returnFromLibrary")?.addEventListener("click", () => {
        setWorkflowStage(libraryReturnStage);
        window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const processSearch = processLibraryRoot.querySelector("#librarySearch");
    const updateProcessSearch = () => {
        libraryQuery = processSearch?.value ?? "";
        updateLibraryProcessSearch();
    };
    processSearch?.addEventListener("input", event => {
        if (!event.isComposing)
            updateProcessSearch();
    });
    processSearch?.addEventListener("compositionend", updateProcessSearch);
    processLibraryRoot.querySelectorAll("[data-library-process]").forEach(button => {
        button.addEventListener("click", () => {
            readLibraryForm();
            librarySelectedProcessId = button.dataset.libraryProcess ?? "";
            renderProcessLibrary();
        });
    });
    processLibraryRoot.querySelector("#createLibraryType")?.addEventListener("click", () => {
        readLibraryForm();
        if (!processLibraryRoot.querySelector("#libraryTypeReviewed")?.checked) {
            libraryError = locale === "zh" ? "请先核对类型目录并勾选确认。" : "Review the type catalog and confirm before adding.";
            libraryNotice = "";
            renderProcessLibrary();
            return;
        }
        if (!libraryForm.newTypeName.trim()) {
            libraryError = locale === "zh" ? "请填写新类型名称。" : "Enter a type name.";
            libraryNotice = "";
            renderProcessLibrary();
            return;
        }
        const matching = (scenarioState.processTypes ?? []).find(item => libraryDisplayText(item.name).toLocaleLowerCase() === libraryForm.newTypeName.trim().toLocaleLowerCase());
        if (matching) {
            libraryForm.processTypeId = matching.processTypeId;
            libraryError = locale === "zh" ? `目录中已有「${libraryDisplayText(matching.name)}」，已为你选中。` : `Type ${libraryDisplayText(matching.name)} already exists and is now selected.`;
            libraryNotice = "";
            renderProcessLibrary();
            return;
        }
        if (!window.confirm(locale === "zh"
            ? `确认新增工艺类型「${libraryForm.newTypeName.trim()}」？此操作只建立本地类型，不建立具体工艺。`
            : `Add local process type "${libraryForm.newTypeName.trim()}"? This does not create a process.`))
            return;
        const result = createLocalProcessType(scenarioState, { name: libraryForm.newTypeName, family: libraryForm.newTypeFamily });
        if ("issues" in result) {
            commitLibraryChange(result, "");
            return;
        }
        libraryForm.processTypeId = result.processType.processTypeId;
        libraryForm.newTypeName = "";
        libraryShowNewType = false;
        const warning = similarLibraryText(result.warnings);
        commitLibraryChange(result, locale === "zh"
            ? `已新增本地类型：${libraryDisplayText(result.processType.name)}，归类为${processFamilyLabel(processTypeFamilyOf(result.processType))}。还没有写成工艺。${warning}`
            : `Added local type ${libraryDisplayText(result.processType.name)} under ${processFamilyLabel(processTypeFamilyOf(result.processType))}. It is not a process yet. ${warning}`);
    });
    processLibraryRoot.querySelector("#createLibraryProcess")?.addEventListener("click", () => {
        readLibraryForm();
        const result = createLocalProcess(scenarioState, {
            name: libraryForm.name,
            processTypeId: libraryForm.processTypeId,
            description: libraryForm.description,
            businessCode: libraryForm.businessCode,
        });
        if ("issues" in result) {
            commitLibraryChange(result, "");
            return;
        }
        librarySelectedProcessId = result.process.processId;
        libraryForm = { ...libraryForm, name: "", description: "", businessCode: "", newTypeName: "" };
        const warning = similarLibraryText(result.warnings);
        commitLibraryChange(result, locale === "zh"
            ? `已写入工艺库：${result.process.name} / ${result.process.processId} · 版本 ${result.process.version} · 本地草稿。没有加入任何路线。${warning}`
            : `Saved ${result.process.name} / ${result.process.processId}, version ${result.process.version}, local draft. It was not added to a route. ${warning}`);
    });
}
function syncRouteSelector(productId, preferredRouteId) {
    const previous = preferredRouteId || routeSelect.value;
    const groups = groupProductRoutes(scenarioState, productId);
    const zh = locale === "zh";
    const option = (routeId, label) => `<option value="${escapeHtml(routeId)}">${escapeHtml(label)}</option>`;
    const latest = groups.latestDraft;
    routeSelect.innerHTML = [
        latest ? option(latest.routeId ?? "", `${latest.routeId} · ${zh ? "当前本地草稿" : "Current local draft"}`) : "",
        groups.released.length ? `<optgroup label="${zh ? "已发布路线" : "Released routes"}">${groups.released.map(route => option(route.routeId ?? route.productId, route.routeId ?? route.productId)).join("")}</optgroup>` : "",
        groups.historicalDrafts.length ? `<optgroup label="${zh ? "历史本地草稿" : "Earlier local drafts"}">${groups.historicalDrafts.map(route => option(route.routeId ?? "", route.routeId ?? "")).join("")}</optgroup>` : "",
    ].join("");
    const routes = [latest, ...groups.released, ...groups.historicalDrafts].filter(route => route !== undefined);
    routeSelect.disabled = routes.length <= 1;
    const productRouteId = scenarioState.products?.find(product => product.productId === productId)?.routeId;
    const wanted = previous && routes.some(route => route.routeId === previous) ? previous
        : latest?.routeId ?? productRouteId;
    routeSelect.value = wanted && routes.some(route => route.routeId === wanted) ? wanted : routes[0]?.routeId ?? "";
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
    visualInspectorMode = "operation";
    visualStationId = "";
    render(selectedProductId);
    if (window.matchMedia("(max-width: 760px)").matches) {
        operationDetailRoot.scrollIntoView({ block: "start", behavior: "smooth" });
    }
}
function resolveSelectedOperation(operations) {
    const ordered = [...operations].sort((left, right) => left.operation.sequence - right.operation.sequence);
    const selected = ordered.find(operation => operation.operation.operationId === selectedOperationId);
    if (selected)
        return selected;
    selectedOperationId = ordered[0]?.operation.operationId ?? "";
    return ordered[0];
}
function getRouteStatus(routingConfig) {
    if (!routingConfig.product)
        return { label: "product missing", tone: "bad" };
    if (!routingConfig.route)
        return { label: "route missing", tone: "bad" };
    if (isLocalDraftRoute(routingConfig.route))
        return { label: "local route draft", tone: "warn" };
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
        "Quality gate": "质量门",
        Packaging: "包装",
        "Die casting": "压铸",
        "Die Casting": "压铸",
        "die-casting": "压铸",
        "die casting": "压铸",
        dieCasting: "压铸",
        machining: "机加工",
        assembly: "装配",
        qualityGate: "质量门",
        packaging: "包装",
        cleaning: "清洗",
        Cleaning: "清洗",
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
        "local route draft": "本地草稿 · 未正式发布",
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
function bottleneckCard(label, card) {
    return `<article class="metric ${card.tone}" data-current-route-bottleneck data-bottleneck-status="${card.status}"><p>${escapeHtml(label)}</p><strong>${escapeHtml(card.value)}</strong><span>${escapeHtml(card.detail)}</span></article>`;
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
setLocalStateErrorHandler(message => {
    localStoreError = locale === "zh"
        ? `本机数据库保存失败（${message}）；浏览器副本仍在，请勿清除站点数据。`
        : `Local database save failed (${message}); the browser copy remains. Do not clear site data.`;
    render(selectedProductId);
});
void bootstrapLocalState().catch(error => {
    localStoreError = locale === "zh"
        ? `本机数据库未连接（${error instanceof Error ? error.message : String(error)}）；当前仅使用浏览器数据。`
        : `Local database unavailable (${error instanceof Error ? error.message : String(error)}); using browser data only.`;
}).finally(init);
