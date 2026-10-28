import { calculateRouteWindowCapacity } from "../engine/route-window-capacity.js";
export function routeWindowKey(window) {
    return `${window.startMinute}:${window.endMinute}`;
}
export function stationPlanKey(productId, stationId) {
    return `${productId}::${stationId}`;
}
export function stationActualKey(productId, operationId, stationId) {
    return `${productId}::${operationId}::${stationId}`;
}
export function listRouteOperations(operations) {
    return [...operations]
        .sort((left, right) => left.sequence - right.sequence || left.operationId.localeCompare(right.operationId))
        .map(operation => ({
        operationId: operation.operationId,
        label: `OP${operation.sequence} ${operation.name}`,
    }));
}
export function nextStationId(currentStationId, stationIds) {
    if (currentStationId && stationIds.includes(currentStationId))
        return currentStationId;
    return stationIds[0] ?? "";
}
export function collectRouteWindowCandidates(stations) {
    const grouped = new Map();
    for (const station of stations) {
        const window = station.standardWindow;
        if (!window || !Number.isFinite(window.startMinute) || !Number.isFinite(window.endMinute) || window.endMinute <= window.startMinute)
            continue;
        const key = routeWindowKey(window);
        const existing = grouped.get(key);
        if (existing) {
            if (!existing.stationIds.includes(station.stationId))
                existing.stationIds.push(station.stationId);
        }
        else {
            grouped.set(key, { startMinute: window.startMinute, endMinute: window.endMinute, stationIds: [station.stationId] });
        }
    }
    return [...grouped.values()];
}
export function resolveRouteObservationWindow(memory, candidates) {
    if (memory?.explicit) {
        const match = candidates.find(candidate => routeWindowKey(candidate) === memory.key);
        if (match)
            return { candidates, selected: match, memory, needsExplicitChoice: false };
        return { candidates, memory, needsExplicitChoice: candidates.length > 0 };
    }
    if (candidates.length === 1) {
        const only = candidates[0];
        const key = routeWindowKey(only);
        return { candidates, selected: only, memory: { key, explicit: false }, needsExplicitChoice: false };
    }
    return { candidates, needsExplicitChoice: candidates.length > 1, ...(memory ? { memory } : {}) };
}
function navigationBlocker(station, selected) {
    if (!selected)
        return "route_window_unselected";
    if (!station.standardWindow)
        return "standard_window_missing";
    if (routeWindowKey(station.standardWindow) !== routeWindowKey(selected))
        return "window_mismatch";
    return undefined;
}
function blockedRow(station, blockers) {
    return {
        operationId: station.operationId,
        stationId: station.stationId,
        shareCeiling: station.shareCeiling ?? 1,
        blockers,
        ...(station.standardWindow ? { standardWindow: station.standardWindow } : {}),
    };
}
function operationShell(operationIds, stations) {
    return operationIds.map(operationId => ({
        operationId,
        stationCount: stations.filter(station => station.operationId === operationId).length,
    }));
}
export function buildRouteWindowCapacityView(input) {
    const resolution = resolveRouteObservationWindow(input.memory, collectRouteWindowCandidates(input.stations));
    const selected = resolution.selected;
    const view = {
        candidates: resolution.candidates,
        needsExplicitChoice: resolution.needsExplicitChoice,
        stations: input.stations.map(station => blockedRow(station, [navigationBlocker(station, selected) ?? "route_window_unselected"])),
        operations: operationShell(input.operationIds, input.stations),
        ...(resolution.selected ? { selected: resolution.selected } : {}),
        ...(resolution.memory ? { memory: resolution.memory } : {}),
        ...(input.demandQty !== undefined ? { demandQty: input.demandQty } : {}),
    };
    if (!selected)
        return view;
    const engineStations = input.stations.map(station => {
        const blocked = navigationBlocker(station, selected) !== undefined;
        return {
            productId: station.productId,
            operationId: station.operationId,
            stationId: station.stationId,
            ...(station.shareCeiling !== undefined ? { shareCeiling: station.shareCeiling } : {}),
            ...(!blocked && station.parameter ? { parameter: station.parameter } : {}),
            planned: blocked ? [] : station.planned,
            actual: blocked ? [] : station.actual,
            ...(!blocked && station.speedOptions ? { speedOptions: station.speedOptions } : {}),
            ...(!blocked && station.offShiftIntervals ? { offShiftIntervals: station.offShiftIntervals } : {}),
        };
    });
    try {
        const result = calculateRouteWindowCapacity({
            startMinute: selected.startMinute,
            endMinute: selected.endMinute,
            stations: engineStations,
            operationIds: input.operationIds,
            ...(input.operationUnitsPerProduct ? { operationUnitsPerProduct: input.operationUnitsPerProduct } : {}),
            ...(input.stationFlowPolicies ? { stationFlowPolicies: input.stationFlowPolicies } : {}),
            ...(input.demandQty !== undefined ? { demandQty: input.demandQty } : {}),
        });
        const byKey = new Map(result.stations.map(station => [`${station.operationId}::${station.stationId}`, station]));
        view.stations = input.stations.map(station => {
            const blocked = navigationBlocker(station, selected);
            if (blocked)
                return blockedRow(station, [blocked]);
            const engineRow = byKey.get(`${station.operationId}::${station.stationId}`);
            if (!engineRow)
                return blockedRow(station, ["planned_window_missing"]);
            return {
                operationId: engineRow.operationId,
                stationId: engineRow.stationId,
                shareCeiling: engineRow.shareCeiling,
                blockers: engineRow.blockers,
                ...(station.standardWindow ? { standardWindow: station.standardWindow } : {}),
                ...(engineRow.plannedProductionMinutes === undefined ? {} : { plannedProductionMinutes: engineRow.plannedProductionMinutes }),
                ...(engineRow.actualProductionMinutes === undefined ? {} : { actualProductionMinutes: engineRow.actualProductionMinutes }),
                ...(engineRow.actualSa === undefined ? {} : { actualSa: engineRow.actualSa }),
                ...(engineRow.bestGoodCapacity === undefined ? {} : { bestGoodCapacity: engineRow.bestGoodCapacity }),
                ...(engineRow.actualGoodOutput === undefined ? {} : { actualGoodOutput: engineRow.actualGoodOutput }),
                ...(engineRow.unrecordedIntervals ? { unrecordedIntervals: engineRow.unrecordedIntervals } : {}),
                ...(engineRow.plannedGapIntervals ? { plannedGapIntervals: engineRow.plannedGapIntervals } : {}),
            };
        });
        view.operations = result.operations;
        if (result.bestGoodCapacity !== undefined)
            view.bestGoodCapacity = result.bestGoodCapacity;
        if (result.actualGoodOutput !== undefined)
            view.actualGoodOutput = result.actualGoodOutput;
        if (result.bestGap !== undefined)
            view.bestGap = result.bestGap;
        if (result.actualGap !== undefined)
            view.actualGap = result.actualGap;
        if (result.bestBottleneckOperationId !== undefined)
            view.bestBottleneckOperationId = result.bestBottleneckOperationId;
        if (result.actualBottleneckOperationId !== undefined)
            view.actualBottleneckOperationId = result.actualBottleneckOperationId;
        if (result.flowIssue)
            view.flowIssue = result.flowIssue;
        return view;
    }
    catch (error) {
        return {
            ...view,
            error: error instanceof Error ? error.message : String(error),
            stations: input.stations.map(station => blockedRow(station, [navigationBlocker(station, selected) ?? "timeline_invalid"])),
        };
    }
}
