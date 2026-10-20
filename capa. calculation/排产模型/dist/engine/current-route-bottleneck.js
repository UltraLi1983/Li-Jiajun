/** A week counts only when every planning-allowed station on this route has that week's ledger. */
export function selectCompleteRouteWeek(stationIds, weeksByStation) {
    const ids = [...new Set(stationIds)];
    if (!ids.length)
        return { ok: false, code: "no_planning_station", missingStationIds: [], weekStartDates: [] };
    const missing = ids.filter(id => (weeksByStation[id]?.length ?? 0) === 0);
    if (missing.length)
        return { ok: false, code: "incomplete_week", missingStationIds: missing, weekStartDates: [] };
    let shared = [...new Set(weeksByStation[ids[0]] ?? [])];
    for (const id of ids.slice(1)) {
        const weeks = new Set(weeksByStation[id] ?? []);
        shared = shared.filter(week => weeks.has(week));
    }
    shared.sort();
    if (!shared.length)
        return { ok: false, code: "incomplete_week", missingStationIds: ids, weekStartDates: [] };
    if (shared.length > 1)
        return { ok: false, code: "ambiguous_week", missingStationIds: [], weekStartDates: shared };
    return { ok: true, weekStartDate: shared[0] };
}
export function describeCurrentRouteBottleneck(input) {
    const base = {
        routeId: input.routeId,
        routeVersion: input.routeVersion?.trim() || input.routeId,
        weekStartDate: input.selection.ok ? input.selection.weekStartDate : "",
        operationId: "",
        operationName: "",
        stations: [],
        reasons: [],
    };
    if (!input.selection.ok) {
        return { ...base, status: "unavailable", reasons: [selectionReason(input.selection)] };
    }
    const plan = input.plan;
    if (!plan || plan.routeId !== input.routeId || plan.weekStartDate !== input.selection.weekStartDate) {
        return { ...base, status: "unavailable", reasons: ["路线或周与当前选择不一致"] };
    }
    if (!plan.calculable || plan.mostLikelyPieces === undefined || (!plan.planBottleneckOperationId && !plan.flowLimited)) {
        return {
            ...base,
            status: "unavailable",
            reasons: plan.reasons.length ? [...plan.reasons] : ["当前路线这一周无法计算"],
        };
    }
    if (plan.flowLimited) {
        return { ...base, status: "calculated", operationId: "route-flow", operationName: "工站流转约束",
            mostLikelyPieces: plan.mostLikelyPieces,
            ...(plan.demandQty === undefined ? {} : { demandQty: plan.demandQty }),
            ...(plan.planMargin === undefined ? {} : { pieceGap: plan.planMargin }) };
    }
    const operationId = plan.planBottleneckOperationId;
    const known = input.operations.find(item => item.operationId === operationId);
    const stations = plan.stations
        .filter(item => item.included && item.operationId === operationId)
        .map(item => {
        const named = known?.stations.find(station => station.stationId === item.stationId);
        return { stationId: item.stationId, name: named?.name || item.stationId };
    });
    return {
        ...base,
        status: "calculated",
        operationId,
        operationName: known?.name || operationId,
        stations,
        mostLikelyPieces: plan.mostLikelyPieces,
        ...(plan.demandQty === undefined ? {} : { demandQty: plan.demandQty }),
        ...(plan.planMargin === undefined ? {} : { pieceGap: plan.planMargin }),
    };
}
export function presentCurrentRouteBottleneck(view, locale) {
    const route = `${view.routeId} · ${view.routeVersion}`;
    const week = view.weekStartDate ? ` · ${view.weekStartDate}` : "";
    if (view.status !== "calculated" || view.mostLikelyPieces === undefined) {
        const reason = view.reasons.join(locale === "zh" ? "；" : "; ")
            || (locale === "zh" ? "无法计算" : "Cannot calculate");
        return {
            status: "unavailable",
            value: locale === "zh" ? "无法计算" : "Cannot calculate",
            detail: `${route}${week} · ${reason} · ${locale === "zh" ? "来源：当前路线同一周周账" : "Source: this route's single shared week ledger"}`,
            tone: "warn",
        };
    }
    const stationText = view.operationId === "route-flow" ? (locale === "zh" ? "仅按已连线组合" : "linked pairs only") : view.stations.length
        ? view.stations.map(item => `${item.name} · ${item.stationId}`).join(locale === "zh" ? "、" : ", ")
        : (locale === "zh" ? "工站未标明" : "Station not identified");
    const pieces = locale === "zh"
        ? `Most likely ${view.mostLikelyPieces} 件`
        : `Most likely ${view.mostLikelyPieces} pcs`;
    let gap = locale === "zh"
        ? "未给出这一周的成品需求，不算件数差额"
        : "No finished-goods demand for this week, so there is no piece gap";
    let tone = "neutral";
    if (view.pieceGap !== undefined && view.demandQty !== undefined) {
        const abs = Math.abs(view.pieceGap);
        if (view.pieceGap === 0) {
            gap = locale === "zh"
                ? `与产品周需求 ${view.demandQty} 件持平`
                : `level with the product weekly demand of ${view.demandQty}`;
        }
        else {
            gap = locale === "zh"
                ? (view.pieceGap < 0
                    ? `比产品周需求 ${view.demandQty} 件少 ${abs} 件`
                    : `比产品周需求 ${view.demandQty} 件多 ${abs} 件`)
                : (view.pieceGap < 0
                    ? `${abs} pcs below the product weekly demand of ${view.demandQty}`
                    : `${abs} pcs above the product weekly demand of ${view.demandQty}`);
        }
        tone = view.pieceGap < 0 ? "bad" : "good";
    }
    return {
        status: "calculated",
        value: view.operationId === "route-flow" ? `${locale === "zh" ? "工站流转约束" : "Station-flow constraint"} / ${stationText}`
            : `${view.operationName} · ${view.operationId} / ${stationText}`,
        detail: `${route}${week} · ${pieces} · ${gap} · ${locale === "zh" ? "来源：当前路线同一周周账的成品件数" : "Source: finished-piece count from this route's shared week ledger"}`,
        tone,
    };
}
export function listRouteReportGaps(positions, locale, plan) {
    const stations = positions.filter(position => position.stationId);
    const gaps = positions.filter(position => !position.stationId).map(position => gap(position, "no_planning_station", locale));
    const selection = selectCompleteRouteWeek(stations.map(position => position.stationId), Object.fromEntries(stations.map(position => [position.stationId, position.weeks])));
    if (!selection.ok && selection.code === "ambiguous_week") {
        gaps.push(...stations.map(position => gap(position, "ambiguous_week", locale, selection.weekStartDates)));
    }
    else if (!selection.ok && selection.code === "incomplete_week") {
        const missing = new Set(selection.missingStationIds);
        const uncovered = stations.filter(position => missing.has(position.stationId));
        const overlapped = uncovered.length < stations.length;
        gaps.push(...uncovered.map(position => gap(position, position.weeks.length ? "week_mismatch" : position.generated ? "ledger_not_calculable" : "ledger_not_generated", locale)));
        if (!overlapped && uncovered.every(position => position.weeks.length > 0)) {
            return gaps;
        }
    }
    if (selection.ok && plan && !plan.calculable) {
        const seen = new Set(gaps.map(item => `${item.operationId}::${item.stationId}`));
        for (const station of plan.stations) {
            if (station.included || !station.reason)
                continue;
            const position = stations.find(item => item.operationId === station.operationId && item.stationId === station.stationId);
            const key = `${station.operationId}::${station.stationId}`;
            if (!position || seen.has(key))
                continue;
            seen.add(key);
            gaps.push({ ...gap(position, "plan_blocked", locale), detail: station.reason });
        }
        for (const operation of plan.operations) {
            if (!operation.quantityIssue)
                continue;
            const position = positions.find(item => item.operationId === operation.operationId);
            if (!position)
                continue;
            gaps.push({
                ...gap({ ...position, stationId: "", stationName: "" }, "plan_blocked", locale),
                detail: locale === "zh"
                    ? `${position.operationName}：${operation.quantityIssue}`
                    : `${position.operationName}: ${operation.quantityIssue}`,
            });
        }
    }
    return gaps;
}
export function routeReportGapBadge(code, locale) {
    const zh = {
        ledger_not_generated: "未生成周账",
        ledger_not_calculable: "周账不可计算",
        week_mismatch: "周次不一致",
        ambiguous_week: "多周无法选定",
        no_planning_station: "无可排产工站",
        plan_blocked: "报告被挡住",
    };
    const en = {
        ledger_not_generated: "Ledger not generated",
        ledger_not_calculable: "Ledger not calculable",
        week_mismatch: "Weeks differ",
        ambiguous_week: "Several weeks",
        no_planning_station: "No planning station",
        plan_blocked: "Report blocked",
    };
    return locale === "zh" ? zh[code] : en[code];
}
function gap(position, code, locale, ambiguousWeeks = []) {
    const weeks = [...position.weeks];
    const place = position.stationId
        ? `${position.operationName} / ${position.stationName} · ${position.stationId}`
        : position.operationName;
    const date = position.draftWeekStart || (locale === "zh" ? "未填" : "blank");
    const detail = {
        ledger_not_generated: locale === "zh"
            ? `${place}：整周起始日期是 ${date}，当前路线还没有生成周账。日期对齐不会进入报告。`
            : `${place}: week start is ${date}, and this route has no generated ledger. A matching date does not enter the report.`,
        ledger_not_calculable: locale === "zh"
            ? `${place}：已要求生成周账，但这一周没有可计算的结果。`
            : `${place}: ledger generation was requested, but this week has no calculable result.`,
        week_mismatch: locale === "zh"
            ? `${place}：已有周账 ${weeks.join("、") || "无"}，和其它可排产工站不是同一周。`
            : `${place}: ledger weeks ${weeks.join(", ") || "none"} do not match the other planning stations.`,
        ambiguous_week: locale === "zh"
            ? `${place}：${ambiguousWeeks.join("、")} 都有完整周账，报告不选定其中一周。`
            : `${place}: complete ledgers exist for ${ambiguousWeeks.join(", ")}, so the report does not pick one.`,
        no_planning_station: locale === "zh"
            ? `${place}：没有可排产工站，路线报告不能计入这道工序。`
            : `${place}: no planning-allowed station, so the route report cannot include this operation.`,
        plan_blocked: locale === "zh" ? `${place}：当前路线报告还不能使用这里。` : `${place}: the route report cannot use this position yet.`,
    }[code];
    return {
        operationId: position.operationId,
        operationName: position.operationName,
        stationId: position.stationId,
        stationName: position.stationName,
        code,
        weeks,
        draftWeekStart: position.draftWeekStart,
        detail,
    };
}
function selectionReason(selection) {
    if (selection.code === "no_planning_station")
        return "没有可排产工站";
    if (selection.code === "ambiguous_week") {
        return `${selection.weekStartDates.join("、")} 都有完整周账，顶部不选定其中一周`;
    }
    const missing = selection.missingStationIds.length ? `：${selection.missingStationIds.join("、")}` : "";
    return `缺少覆盖全部可排产工站的同一周周账${missing}`;
}
