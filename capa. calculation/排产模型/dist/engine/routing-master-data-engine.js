export function validateProductRoutingMasterData(scenario, productId, routeId, options = {}) {
    const issues = [];
    const route = scenario.routes.find(item => item.productId === productId && (!routeId || item.routeId === routeId));
    const requireReleased = options.requireReleased ?? true;
    if (!route) {
        return {
            valid: false,
            formalReady: false,
            issues: [{ severity: "error", code: "route_missing", message: `${productId} has no matching product route` }],
        };
    }
    if (requireReleased && route.status !== "released") {
        issues.push({ severity: "error", code: "route_not_released", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} is not released` });
    }
    if (isOutsideEffectivePeriod(route, options.asOfDate, options.throughDate)) {
        issues.push({ severity: "error", code: "route_not_effective", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} is not effective for ${options.asOfDate ?? "-"} to ${options.throughDate ?? options.asOfDate ?? "-"}` });
    }
    if (!route.operations.length) {
        issues.push({ severity: "error", code: "route_has_no_operations", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} has no operations` });
    }
    validateOperationSequence(route, issues);
    for (const operation of route.operations)
        validateOperationReferences(scenario, route, operation, issues, options.asOfDate, options.throughDate);
    validateStageMaterialFlow(scenario, route, issues);
    return {
        valid: !issues.some(issue => issue.severity === "error"),
        formalReady: !issues.some(issue => issue.severity === "error"),
        route,
        issues,
    };
}
function validateOperationSequence(route, issues) {
    const seenIds = new Set();
    const seenSequences = new Set();
    for (const operation of route.operations) {
        if (seenIds.has(operation.operationId)) {
            issues.push({ severity: "error", code: "operation_duplicate", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} is duplicated in route` });
        }
        if (seenSequences.has(operation.sequence)) {
            issues.push({ severity: "error", code: "operation_sequence_invalid", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `operation sequence ${operation.sequence} is duplicated` });
        }
        if (!Number.isInteger(operation.sequence) || operation.sequence <= 0) {
            issues.push({ severity: "error", code: "operation_sequence_invalid", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} has an invalid operation sequence` });
        }
        seenIds.add(operation.operationId);
        seenSequences.add(operation.sequence);
    }
}
function validateOperationReferences(scenario, route, operation, issues, asOfDate, throughDate) {
    if (!operation.processId) {
        issues.push({ severity: "error", code: "process_master_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} has no ProcessMaster reference` });
    }
    else {
        const process = scenario.processMasters?.find(item => item.processId === operation.processId);
        if (!process) {
            issues.push({ severity: "error", code: "process_master_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: operation.processId, message: `${operation.operationId} references missing ProcessMaster ${operation.processId}` });
        }
        else if (process.status !== "released") {
            issues.push({ severity: "error", code: "process_master_not_released", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: operation.processId, message: `${operation.operationId} references ProcessMaster ${operation.processId}, which is not released` });
        }
    }
    const predecessors = routePredecessors(route, operation);
    if (operation.inputStageBomId && predecessors.length
        && !predecessors.some(item => item.outputStageBomId === operation.inputStageBomId)) {
        issues.push({
            severity: "error", code: "stage_bom_mismatch", routeId: route.routeId ?? route.productId,
            operationId: operation.operationId, subjectId: operation.inputStageBomId,
            message: `${operation.operationId} input Stage BOM ${operation.inputStageBomId} is not the current output Stage BOM of its route predecessor`,
        });
    }
    if (!operation.outputStageBomId) {
        issues.push({ severity: "error", code: "stage_bom_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} has no output Stage BOM reference` });
    }
    const stageBomReferences = [
        { stageBomId: operation.inputStageBomId, expectedOperationIds: predecessors.map(item => item.operationId) },
        { stageBomId: operation.outputStageBomId, expectedOperationIds: [operation.operationId] },
    ];
    for (const { stageBomId, expectedOperationIds } of stageBomReferences) {
        if (!stageBomId)
            continue;
        const stageBom = scenario.stageBoms?.find(item => item.stageBomId === stageBomId);
        if (!stageBom) {
            issues.push({ severity: "error", code: "stage_bom_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: stageBomId, message: `${operation.operationId} references missing Stage BOM ${stageBomId}` });
            continue;
        }
        if (stageBom.productId !== route.productId || stageBom.routeId !== route.routeId || !expectedOperationIds.includes(stageBom.operationId)) {
            issues.push({ severity: "error", code: "stage_bom_mismatch", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: stageBomId, message: `Stage BOM ${stageBomId} does not belong to the expected ${route.productId}/${route.routeId}/${expectedOperationIds.join(" or ") || "predecessor stage"}` });
        }
        if (isOutsideEffectivePeriod(stageBom, asOfDate, throughDate)) {
            issues.push({ severity: "error", code: "stage_bom_not_effective", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: stageBomId, message: `Stage BOM ${stageBomId} is not effective for ${asOfDate ?? "-"} to ${throughDate ?? asOfDate ?? "-"}` });
        }
        const wipState = scenario.wipStates?.find(item => item.wipStateId === stageBom.wipStateId);
        if (!wipState) {
            issues.push({ severity: "error", code: "wip_state_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: stageBom.wipStateId, message: `Stage BOM ${stageBomId} references missing WIP state ${stageBom.wipStateId}` });
        }
        else if (wipState.productId !== route.productId || wipState.routeId !== route.routeId || wipState.operationId !== stageBom.operationId) {
            issues.push({ severity: "error", code: "wip_state_mismatch", routeId: route.routeId ?? route.productId, operationId: operation.operationId, subjectId: wipState.wipStateId, message: `WIP state ${wipState.wipStateId} does not belong to Stage BOM ${stageBomId}` });
        }
    }
}
function routePredecessors(route, operation) {
    const ids = new Set([
        ...(operation.predecessorOperationIds ?? []),
        ...route.operations.filter(item => item.successorOperationIds?.includes(operation.operationId)).map(item => item.operationId),
    ]);
    return route.operations.filter(item => ids.has(item.operationId));
}
function validateStageMaterialFlow(scenario, route, issues) {
    for (const operation of route.operations) {
        const target = scenario.stageBoms?.find(item => item.stageBomId === operation.outputStageBomId);
        if (!target || target.productId !== route.productId || target.routeId !== route.routeId || target.operationId !== operation.operationId)
            continue;
        for (const predecessor of routePredecessors(route, operation)) {
            const source = scenario.stageBoms?.find(item => item.stageBomId === predecessor.outputStageBomId);
            if (!source || source.productId !== route.productId || source.routeId !== route.routeId || source.operationId !== predecessor.operationId)
                continue;
            if (!source.outputItem.trim() || !target.inputItems?.includes(source.outputItem)) {
                issues.push({
                    severity: "error", code: "stage_material_disconnected", routeId: route.routeId ?? route.productId,
                    operationId: operation.operationId,
                    ...(predecessor.outputStageBomId ? { subjectId: predecessor.outputStageBomId } : {}),
                    message: `${operation.operationId} input materials do not include ${predecessor.operationId} output ${source.outputItem || "(empty)"}`,
                });
            }
        }
    }
}
function isOutsideEffectivePeriod(item, asOfDate, throughDate) {
    if ((!asOfDate && !throughDate) || (!item.effectiveFrom && !item.effectiveTo))
        return false;
    if (item.effectiveFrom && asOfDate && asOfDate < item.effectiveFrom)
        return true;
    if (item.effectiveFrom && throughDate && throughDate < item.effectiveFrom)
        return true;
    if (item.effectiveTo && asOfDate && asOfDate > item.effectiveTo)
        return true;
    if (item.effectiveTo && throughDate && throughDate > item.effectiveTo)
        return true;
    return false;
}
