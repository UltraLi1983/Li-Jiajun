import { selectCompleteRouteWeek } from "./current-route-bottleneck.js";
const FORMAL_RELEASE_CAUSES = new Set([
    "route_not_released",
    "process_master_not_released",
    "process_master_missing",
    "stage_bom_missing",
    "stage_bom_mismatch",
    "stage_bom_not_effective",
    "stage_material_disconnected",
    "wip_state_missing",
    "wip_state_mismatch",
]);
const STAGE_CAUSES = new Set([
    "stage_bom_missing",
    "stage_bom_mismatch",
    "stage_bom_not_effective",
    "stage_material_disconnected",
    "wip_state_missing",
    "wip_state_mismatch",
    "stage_reference_missing",
]);
export function isFormalReleaseCause(code) {
    return Boolean(code && FORMAL_RELEASE_CAUSES.has(code));
}
const STATION_LEVEL = new Set([
    "parameter_missing",
    "invalid_cycle_time",
    "invalid_pieces_per_cycle",
    "backup_blocked",
]);
const COPY = {
    product_missing: {
        zh: ["缺少产品", "产品主数据里没有这个产品"],
        en: ["Product missing", "This product is not in the product master"],
    },
    route_missing: {
        zh: ["缺少路线", "当前产品没有匹配的工艺路线"],
        en: ["Route missing", "This product has no matching route"],
    },
    route_not_released: {
        zh: ["路线未发布", "当前本地路线尚未发布"],
        en: ["Route not released", "This local route is not released"],
    },
    route_not_effective: {
        zh: ["路线未生效", "当前路线在观察日尚未生效"],
        en: ["Route not effective", "This route is not effective on the observation date"],
    },
    route_has_no_operations: {
        zh: ["路线没有工序", "当前路线还没有工序"],
        en: ["No operations", "This route has no operations"],
    },
    operation_missing: {
        zh: ["缺少工序", "当前路线还没有工序"],
        en: ["Operation missing", "This route has no operations"],
    },
    operation_duplicate: {
        zh: ["工序重复", "{operation}在当前路线中重复"],
        en: ["Duplicate operation", "{operation} is duplicated on this route"],
    },
    operation_sequence_invalid: {
        zh: ["工序顺序无效", "{operation}的顺序重复或无效"],
        en: ["Invalid sequence", "The sequence of {operation} is duplicated or invalid"],
    },
    process_master_missing: {
        zh: ["工艺主数据缺失", "{operation}尚未关联已建档工艺"],
        en: ["Process master missing", "{operation} has no filed process"],
    },
    process_master_not_released: {
        zh: ["工艺未发布", "{operation}的工艺主数据尚未发布"],
        en: ["Process not released", "Process master data for {operation} is not released"],
    },
    stage_bom_missing: {
        zh: ["阶段物料缺失", "{operation}尚未配置阶段物料 / WIP"],
        en: ["Stage material missing", "{operation} has no stage material / WIP reference"],
    },
    stage_bom_mismatch: {
        zh: ["阶段物料不匹配", "{operation}的阶段物料不属于当前路线"],
        en: ["Stage material mismatch", "Stage material for {operation} does not belong to this route"],
    },
    stage_bom_not_effective: {
        zh: ["阶段物料不在有效期", "{operation}的阶段物料未覆盖整个观察周"],
        en: ["Stage material not effective", "Stage material for {operation} does not cover the full observed week"],
    },
    stage_material_disconnected: {
        zh: ["前后工序物料不衔接", "{operation}的投入清单未包含前序工序产出"],
        en: ["Stage materials disconnected", "Inputs for {operation} do not include the predecessor output"],
    },
    wip_state_missing: {
        zh: ["WIP 状态缺失", "{operation}引用的 WIP 状态不存在"],
        en: ["WIP state missing", "The WIP state referenced by {operation} does not exist"],
    },
    wip_state_mismatch: {
        zh: ["WIP 状态不匹配", "{operation}的 WIP 状态不属于当前阶段物料"],
        en: ["WIP state mismatch", "The WIP state for {operation} does not belong to this stage"],
    },
    assignment_missing: {
        zh: ["未分配工站", "{operation}尚未分配工站"],
        en: ["Station not assigned", "{operation} has no station assignment"],
    },
    planning_allowed_assignment_missing: {
        zh: ["无可排产工站", "{operation}没有允许排产的工站"],
        en: ["No planning station", "{operation} has no planning-allowed station"],
    },
    parameter_missing: {
        zh: ["缺少工站参数", "{operation}在{station}还没有 CT / 每循环件数 / P / Q"],
        en: ["Station parameter missing", "{operation} on {station} has no CT / pieces per cycle / P / Q"],
    },
    invalid_cycle_time: {
        zh: ["节拍无效", "{station}的标准节拍必须大于 0"],
        en: ["Invalid cycle time", "Standard cycle time on {station} must be greater than 0"],
    },
    invalid_pieces_per_cycle: {
        zh: ["每循环件数无效", "{station}的每循环件数必须大于 0"],
        en: ["Invalid pieces per cycle", "Pieces per cycle on {station} must be greater than 0"],
    },
    batch_hu_policy_missing: {
        zh: ["缺少批量规则", "{operation}尚未配置批量/HU规则"],
        en: ["Batch rule missing", "{operation} has no batch / HU rule"],
    },
    backup_blocked: {
        zh: ["备用工站未放行", "{station}是备用工站，客户批准前不能排产"],
        en: ["Backup not released", "{station} is a backup station and cannot be planned before customer release"],
    },
    route_master_invalid: {
        zh: ["路线主数据无效", "当前路线的主数据校验未通过"],
        en: ["Route master data invalid", "Route master data did not pass validation"],
    },
};
export function resolveShareMinuteSupply(stationIds, weeksByStation, minutesByStationWeek) {
    const usableWeeks = Object.fromEntries(stationIds.map(stationId => [stationId,
        (weeksByStation[stationId] ?? []).filter(week => (minutesByStationWeek[stationId]?.[week] ?? 0) > 0),
    ]));
    const selection = selectCompleteRouteWeek(stationIds, usableWeeks);
    if (!selection.ok)
        return { basis: "unavailable", minutes: {} };
    const minutes = {};
    for (const stationId of new Set(stationIds)) {
        const value = minutesByStationWeek[stationId]?.[selection.weekStartDate];
        if (value === undefined || !(value > 0))
            return { basis: "unavailable", minutes: {} };
        minutes[stationId] = value;
    }
    return { basis: "weekLedger", weekStartDate: selection.weekStartDate, minutes };
}
export function completeWeekAvailableMinutes(days) {
    if (days.length !== 7 || days.some(day => day.stale
        || !Number.isFinite(day.bestCaseAvailableMinutes) || day.bestCaseAvailableMinutes < 0))
        return undefined;
    const total = days.reduce((sum, day) => sum + day.bestCaseAvailableMinutes, 0);
    return total > 0 ? total : undefined;
}
export function presentReadinessIssues(issues, catalog, locale) {
    const operationLabels = buildOperationLabels(catalog, locale);
    const stationLabels = buildStationLabels(catalog, locale);
    return issues.map(issue => {
        const cause = issue.causeCode ?? issue.code;
        const operation = operationCell(issue.operationId, operationLabels, locale);
        const station = stationCell(cause, issue.operationId, issue.stationId, stationLabels, locale);
        const [problemType, action] = sentence(cause, locale, operation.label, station.label);
        return {
            severity: issue.severity,
            problemType,
            operation,
            station,
            action,
            technical: {
                code: issue.code,
                ...(issue.causeCode ? { causeCode: issue.causeCode } : {}),
                ...(issue.subjectId ? { subjectId: issue.subjectId } : {}),
                productId: issue.productId,
                ...(issue.operationId ? { operationId: issue.operationId } : {}),
                ...(issue.stationId ? { stationId: issue.stationId } : {}),
                ...(issue.assignmentId ? { assignmentId: issue.assignmentId } : {}),
                message: issue.message,
            },
        };
    });
}
export function presentShareRows(evaluations, assignments, catalog, locale) {
    const operationLabels = buildOperationLabels(catalog, locale);
    const stationLabels = buildStationLabels(catalog, locale);
    const byKey = new Map(evaluations.map(item => [`${item.operationId}::${item.stationId}`, item]));
    return assignments.map(assignment => {
        const evaluation = byKey.get(`${assignment.operationId}::${assignment.stationId}`);
        const operation = operationCell(assignment.operationId, operationLabels, locale);
        const station = stationCell("parameter_missing", assignment.operationId, assignment.stationId, stationLabels, locale);
        const confirmed = evaluation?.requiredShareBasis === "weekLedger";
        const insufficient = locale === "zh" ? "排班依据不足" : "Schedule basis missing";
        const requested = evaluation?.requestedCapacityShare ?? assignment.plannedShare;
        const requestedLabel = requested === undefined
            ? (locale === "zh" ? "未设固定份额" : "No fixed share")
            : percent(requested);
        const requiredLabel = confirmed && evaluation?.requiredCapacityShare !== undefined
            ? percent(evaluation.requiredCapacityShare) : insufficient;
        const actualLabel = locale === "zh" ? "未接入生产实绩" : "Production actuals not connected";
        const risks = confirmed ? evaluation?.risks.filter(risk => risk.code === "required_exceeds_ceiling") ?? [] : [];
        const statusTone = !confirmed ? "warn" : risks.some(risk => risk.level === "critical") ? "bad"
            : risks.length ? "warn" : "good";
        const statusLabel = !confirmed
            ? insufficient
            : statusTone === "good"
                ? (locale === "zh" ? "未超份额" : "Within share")
                : statusTone === "warn"
                    ? (locale === "zh" ? "份额预警" : "Share warning")
                    : (locale === "zh" ? "份额超出" : "Share exceeded");
        const action = !confirmed
            ? (locale === "zh"
                ? "当前没有同一周周账，需求占用不能当成已确认风险"
                : "No shared week ledger, so required occupancy is not a confirmed risk")
            : shareAction(risks, evaluation?.requestedCapacityShare, evaluation?.requiredCapacityShare, undefined, locale);
        return {
            operation,
            station,
            requestedLabel,
            requiredLabel,
            actualLabel,
            statusLabel,
            statusTone,
            action,
            basis: confirmed ? "weekLedger" : "insufficient",
            technical: {
                code: evaluation?.requiredShareBasis ?? "unavailable",
                ...(evaluation?.operationId ? { operationId: evaluation.operationId } : { operationId: assignment.operationId }),
                ...(evaluation?.stationId ? { stationId: evaluation.stationId } : { stationId: assignment.stationId }),
                message: risks.map(risk => risk.message).join(" / "),
            },
        };
    });
}
export function presentBatchRows(checks, catalog, locale) {
    const operationLabels = buildOperationLabels(catalog, locale);
    return checks.map(check => {
        const operation = operationCell(check.operationId, operationLabels, locale);
        const problemType = locale === "zh" ? "批量/HU" : "Batch / HU";
        let action = locale === "zh" ? "计划件数符合批量规则" : "Planned quantity matches the batch rule";
        if (check.status === "needsApproval") {
            action = locale === "zh"
                ? `计划件数 ${check.quantity} 不是整批倍数，需要例外批准`
                : `Planned quantity ${check.quantity} is not a full batch multiple and needs exception approval`;
        }
        else if (check.status === "invalid" && check.quantity < check.minimumProcessHU) {
            action = locale === "zh"
                ? `计划件数 ${check.quantity} 低于最小批量 ${check.minimumProcessHU}`
                : `Planned quantity ${check.quantity} is below the minimum batch ${check.minimumProcessHU}`;
        }
        else if (check.status === "invalid") {
            action = locale === "zh"
                ? `计划件数 ${check.quantity} 必须按整批安排`
                : `Planned quantity ${check.quantity} must be a full batch`;
        }
        return {
            operation,
            problemType,
            action,
            technical: {
                code: check.status,
                operationId: check.operationId,
                subjectId: check.policyId,
                message: check.message,
            },
        };
    });
}
export function presentTrialSeparation(input) {
    const locale = input.locale;
    const zh = locale === "zh";
    const operationLabels = buildOperationLabels(input.catalog, locale);
    const sameWindowComplete = input.stationWindowBlockers.length > 0
        && input.stationWindowBlockers.every(blockers => blockers.length === 0);
    const formalItems = formalGateItems(input, operationLabels);
    const stageOperations = new Set(formalItems.filter(item => item.owner === "stageMaterial").map(item => item.operationId));
    for (const gap of input.gaps) {
        if (gap.code !== "stage_reference_missing")
            continue;
        if (gap.field && stageOperations.has(gap.field))
            continue;
        const operation = operationCell(gap.field, operationLabels, locale);
        formalItems.push({
            owner: "stageMaterial",
            ownerLabel: zh ? "阶段物料／WIP" : "Stage material / WIP",
            subject: operation.label,
            reason: sentence("stage_bom_missing", locale, operation.label, "")[1],
            routeId: input.routeId,
            ...(gap.field ? { operationId: gap.field } : {}),
            technical: {
                code: "stage_reference_missing",
                ...(gap.field ? { operationId: gap.field } : {}),
                message: gap.message,
            },
        });
        if (gap.field)
            stageOperations.add(gap.field);
    }
    formalItems.sort((left, right) => ownerRank(left.owner) - ownerRank(right.owner)
        || left.subject.localeCompare(right.subject, zh ? "zh" : "en"));
    const localGaps = input.gaps.filter(gap => gap.code !== "stage_reference_missing").map(gap => {
        const station = gap.code === "parameter_incomplete"
            ? input.catalog.stations.find(item => item.stationId === gap.field)
            : undefined;
        const operation = operationCell(station?.operationId ?? gap.field, operationLabels, locale);
        const subject = station?.name ? `${operation.label} · ${station.name}` : operation.label;
        const reason = gap.code === "parameter_incomplete"
            ? (zh ? `${subject}还要补 CT、每循环件数、P、Q` : `${subject} still needs CT, pieces per cycle, P and Q`)
            : gap.code === "station_missing"
                ? (zh ? `${operation.label}还没有工站分配` : `${operation.label} has no station assignment`)
                : (zh ? `${subject}：${gap.message}` : gap.message);
        return { code: gap.code, subject, reason };
    });
    return {
        sameWindowComplete,
        sameWindowLabel: sameWindowComplete ? (zh ? "已完成" : "Completed") : (zh ? "未完成" : "Not completed"),
        sameWindowNote: input.stationWindowBlockers.length === 0
            ? (zh ? "当前路线没有可排产工站，同窗结果还没有算出来。" : "This route has no planning-allowed station, so the same-window result is not available.")
            : sameWindowComplete
                ? (zh ? "各工站待补条件为「-」，表示本窗口没有缺录。" : "A dash in Missing inputs means this window has no missing record.")
                : (zh ? "本窗口还有缺录，写在上表待补条件里。" : "This window still has missing records. They stay in the Missing inputs column."),
        localTrialOpen: input.localFlowOpen,
        localTrialLabel: input.localFlowOpen ? (zh ? "仍可试算" : "Trial remains open") : (zh ? "未打开" : "Closed"),
        localTrialNote: input.localFlowOpen
            ? (zh ? "可以继续记录标准 SA 和 R&R。" : "Standard SA and R&R can continue.")
            : (zh ? "当前选择不是可试算的本地草稿路线。" : "The current selection is not a local draft that can be trialled."),
        formalSatisfied: input.formalReady,
        formalLabel: input.formalReady ? (zh ? "可通过" : "Ready") : (zh ? "门禁未满足" : "Gate not met"),
        formalItems: input.formalReady ? [] : formalItems,
        localGaps,
    };
}
function formalGateItems(input, operationLabels) {
    const zh = input.locale === "zh";
    return input.formalIssues.filter(issue => issue.severity === "error" && isFormalReleaseCause(issue.code)).map(issue => {
        const owner = gateOwner(issue.code);
        const operation = operationCell(issue.operationId, operationLabels, input.locale);
        const processName = issue.subjectId ? input.processNames?.[issue.subjectId] : undefined;
        const subject = owner === "draftRoute"
            ? input.routeId
            : owner === "draftProcess"
                ? `${operation.label}${processName ? ` · ${processName}` : ""}`
                : operation.label;
        const reason = owner === "draftRoute"
            ? (zh ? "当前路线仍是草稿，尚未正式发布" : "This route is still a draft and is not released")
            : owner === "draftProcess"
                ? (processName
                    ? (zh ? `${operation.label}引用的工艺「${processName}」仍是草稿` : `${operation.label} references draft process “${processName}”`)
                    : sentence(issue.code, input.locale, operation.label, "")[1])
                : sentence(issue.code, input.locale, operation.label, "")[1];
        return {
            owner,
            ownerLabel: ownerLabel(owner, input.locale),
            subject,
            reason,
            routeId: issue.routeId ?? input.routeId,
            ...(issue.operationId ? { operationId: issue.operationId } : {}),
            ...(issue.subjectId ? { subjectId: issue.subjectId } : {}),
            technical: {
                code: issue.code,
                ...(issue.subjectId ? { subjectId: issue.subjectId } : {}),
                ...(issue.operationId ? { operationId: issue.operationId } : {}),
                message: issue.message,
            },
        };
    });
}
function gateOwner(code) {
    if (code === "route_not_released")
        return "draftRoute";
    if (STAGE_CAUSES.has(code))
        return "stageMaterial";
    return "draftProcess";
}
function ownerRank(owner) {
    if (owner === "draftRoute")
        return 0;
    if (owner === "draftProcess")
        return 1;
    return 2;
}
function ownerLabel(owner, locale) {
    if (owner === "draftRoute")
        return locale === "zh" ? "草稿路线" : "Draft route";
    if (owner === "draftProcess")
        return locale === "zh" ? "草稿工艺" : "Draft process";
    return locale === "zh" ? "阶段物料／WIP" : "Stage material / WIP";
}
export function presentPreflightSummary(readiness, shares, batches) {
    return {
        blockers: unique([
            ...readiness.filter(row => row.severity === "error").map(row => row.action),
            ...batches.filter(row => row.technical.code === "invalid").map(row => row.action),
        ]),
        warnings: unique([
            ...readiness.filter(row => row.severity === "warning").map(row => row.action),
            ...shares.filter(row => row.basis === "insufficient" || row.statusTone !== "good").map(row => row.action),
            ...batches.filter(row => row.technical.code === "needsApproval").map(row => row.action),
        ]),
    };
}
function unique(lines) {
    return [...new Set(lines)];
}
function shareAction(risks, requested, required, actual, locale) {
    if (!risks.length) {
        return locale === "zh" ? "按当前周账，需求占用未超过排产份额" : "On the current week ledger, required occupancy stays within the planned share";
    }
    return risks.map(risk => {
        if (risk.code === "required_exceeds_ceiling") {
            return locale === "zh"
                ? `按当前周账，需求占用 ${percent(required)} 超过排产份额 ${percent(requested)}`
                : `On the current week ledger, required occupancy ${percent(required)} exceeds planned share ${percent(requested)}`;
        }
        if (risk.code === "actual_exceeds_required") {
            return locale === "zh"
                ? `按当前周账，实际占用 ${percent(actual)} 超过需求占用 ${percent(required)}`
                : `On the current week ledger, actual occupancy ${percent(actual)} exceeds required occupancy ${percent(required)}`;
        }
        return locale === "zh"
            ? `按当前周账，实际占用 ${percent(actual)} 超过排产份额 ${percent(requested)}`
            : `On the current week ledger, actual occupancy ${percent(actual)} exceeds planned share ${percent(requested)}`;
    }).join(locale === "zh" ? "；" : "; ");
}
function sentence(code, locale, operation, station) {
    const copy = COPY[code] ?? COPY.route_master_invalid;
    const pair = copy[locale];
    return [pair[0], pair[1].replaceAll("{operation}", operation).replaceAll("{station}", station)];
}
function operationCell(operationId, labels, locale) {
    if (!operationId)
        return { applicability: "named", label: locale === "zh" ? "整条路线" : "Whole route" };
    const label = labels.get(operationId);
    if (!label)
        return { applicability: "unmatched", label: locale === "zh" ? "当前路线未找到对应对象" : "Not on the current route" };
    return { applicability: "named", label };
}
function stationCell(code, operationId, stationId, labels, locale) {
    if (!STATION_LEVEL.has(code))
        return { applicability: "notApplicable", label: locale === "zh" ? "不适用" : "Not applicable" };
    if (!stationId)
        return { applicability: "missing", label: locale === "zh" ? "信息缺失" : "Missing" };
    const label = labels.get(`${operationId ?? ""}::${stationId}`);
    if (!label)
        return { applicability: "unmatched", label: locale === "zh" ? "当前路线未找到对应对象" : "Not on the current route" };
    return { applicability: "named", label };
}
function buildOperationLabels(catalog, locale) {
    const counts = new Map();
    const base = catalog.operations.map(operation => {
        const label = `OP${operation.sequence} ${operation.name}`.trim();
        counts.set(label, (counts.get(label) ?? 0) + 1);
        return { id: operation.operationId, label };
    });
    const seen = new Map();
    const labels = new Map();
    for (const item of base) {
        const index = (seen.get(item.label) ?? 0) + 1;
        seen.set(item.label, index);
        const suffix = locale === "zh" ? `同名 ${index}` : `same name ${index}`;
        labels.set(item.id, (counts.get(item.label) ?? 0) > 1 ? `${item.label} · ${suffix}` : item.label);
    }
    return labels;
}
function buildStationLabels(catalog, locale) {
    const unnamed = locale === "zh" ? "未命名工站" : "Unnamed station";
    const rows = catalog.stations.map(station => ({
        key: `${station.operationId}::${station.stationId}`,
        operationId: station.operationId,
        name: station.name.trim() || unnamed,
    }));
    const counts = new Map();
    for (const row of rows)
        counts.set(row.name, (counts.get(row.name) ?? 0) + 1);
    const seen = new Map();
    const labels = new Map();
    for (const row of rows) {
        const index = (seen.get(row.name) ?? 0) + 1;
        seen.set(row.name, index);
        if ((counts.get(row.name) ?? 0) <= 1) {
            labels.set(row.key, row.name);
            continue;
        }
        const operation = catalog.operations.find(item => item.operationId === row.operationId);
        const mark = operation ? `OP${operation.sequence}` : (locale === "zh" ? `同名 ${index}` : `same name ${index}`);
        const sameOperation = rows.filter(item => item.name === row.name && item.operationId === row.operationId).length > 1;
        labels.set(row.key, sameOperation ? `${row.name} · ${mark} · ${index}` : `${row.name} · ${mark}`);
    }
    return labels;
}
function percent(value) {
    if (value === undefined || !Number.isFinite(value))
        return "-";
    return `${(value * 100).toFixed(1)}%`;
}
