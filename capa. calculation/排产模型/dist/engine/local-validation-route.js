import { createLocalBaselineParameter } from "./parameter-versioning.js";
import { validateProductRoutingMasterData } from "./routing-master-data-engine.js";
export const LOCAL_VALIDATION_SOURCE = "local-validation";
export const LOCAL_VALIDATION_SCHEMA_VERSION = 2;
const failure = (code, message, field) => ({
    issues: [{ code, message, ...(field ? { field } : {}) }],
});
export function isLocalDraftProcess(process) {
    return process.sourceSystem === LOCAL_VALIDATION_SOURCE && process.status === "draft";
}
export function isLocalDraftProcessType(processType) {
    return processType.sourceSystem === LOCAL_VALIDATION_SOURCE && processType.status === "draft";
}
export function processTypeFamilyOf(processType) {
    if (processType.family === "manufacturing" || processType.family === "quality")
        return processType.family;
    const id = processType.processTypeId.trim().toLowerCase();
    const name = processType.name.trim().toLowerCase();
    if (id === "qualitygate" || name === "质量门" || name === "quality gate")
        return "quality";
    return "manufacturing";
}
export function isLocalDraftRoute(route) {
    return route.sourceSystem === LOCAL_VALIDATION_SOURCE && route.status === "draft";
}
export function parseLocalValidationStore(raw) {
    if (!raw || typeof raw !== "object")
        return { ok: false, code: "unreadable" };
    const value = raw;
    if (value.schemaVersion !== 1 && value.schemaVersion !== 2)
        return { ok: false, code: "unsupported_schema" };
    if (!Array.isArray(value.processes) || !Array.isArray(value.routes))
        return { ok: false, code: "unreadable" };
    const store = {
        schemaVersion: LOCAL_VALIDATION_SCHEMA_VERSION,
        processes: value.processes,
        processTypes: Array.isArray(value.processTypes) ? value.processTypes : [],
        routes: value.routes,
        assignments: Array.isArray(value.assignments) ? value.assignments : [],
        stations: Array.isArray(value.stations) ? value.stations : [],
        stationGroups: Array.isArray(value.stationGroups) ? value.stationGroups : [],
        parameters: Array.isArray(value.parameters) ? value.parameters : [],
    };
    return value.schemaVersion === 1 ? { ok: true, store, migratedFrom: 1 } : { ok: true, store };
}
export function createLocalProcessType(scenario, input) {
    const name = input.name.trim();
    if (!name)
        return failure("missing_field", "process type name is required", "name");
    if (input.family !== "manufacturing" && input.family !== "quality") {
        return failure("missing_field", "process type family is required", "family");
    }
    const typeAliases = {
        machining: "machining", "机加工": "machining",
        assembly: "assembly", "装配": "assembly",
        "quality gate": "quality gate", "质量门": "quality gate",
        packaging: "packaging", "包装": "packaging",
        cleaning: "cleaning", "清洗": "cleaning",
        "die casting": "die casting", "压铸": "die casting",
    };
    const key = (value) => {
        const normalized = value.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
        return typeAliases[normalized] ?? normalized;
    };
    const existing = (scenario.processTypes ?? []).find(item => key(item.name) === key(name));
    if (existing)
        return failure("duplicate_process_type", `Process type already exists: ${existing.name}`, existing.processTypeId);
    const processTypeId = nextLocalId((scenario.processTypes ?? []).map(item => item.processTypeId), "local-type");
    const processType = {
        processTypeId,
        name,
        family: input.family,
        sourceSystem: LOCAL_VALIDATION_SOURCE,
        status: "draft",
    };
    const warnings = similarNameWarnings(name, (scenario.processTypes ?? []).map(item => ({ id: item.processTypeId, name: item.name })));
    scenario.processTypes = [...(scenario.processTypes ?? []), processType];
    return { scenario, processType, warnings };
}
export function createLocalStationGroup(scenario, input) {
    const trimmed = input.name.trim();
    if (!trimmed)
        return failure("missing_field", "station group name is required", "name");
    const process = scenario.processMasters?.find(item => item.processId === input.processId);
    if (!process || !isLocalDraftProcess(process)) {
        return failure("not_local_draft", "Select a local draft process before creating a station group", "processId");
    }
    const group = {
        stationGroupId: nextLocalId((scenario.stationGroups ?? []).map(item => item.stationGroupId), "local-group"),
        name: trimmed, stationIds: [],
    };
    scenario.stationGroups = [...(scenario.stationGroups ?? []), group];
    process.compatibleStationGroupIds = [...new Set([...(process.compatibleStationGroupIds ?? []), group.stationGroupId])];
    return { scenario, group };
}
export function createLocalProcess(scenario, input) {
    const name = input.name.trim();
    const processTypeId = input.processTypeId.trim();
    const description = input.description?.trim() ?? "";
    const businessCode = input.businessCode?.trim() ?? "";
    const compatibleStationGroupIds = [...new Set(input.compatibleStationGroupIds ?? [])];
    if (compatibleStationGroupIds.some(id => !scenario.stationGroups?.some(group => group.stationGroupId === id))) {
        return failure("station_incompatible", "Choose station groups from the station group master", "compatibleStationGroupIds");
    }
    if (!name)
        return failure("missing_field", "process name is required", "name");
    if (!processTypeId)
        return failure("missing_field", "process type is required", "processTypeId");
    if (!scenario.processTypes?.some(item => item.processTypeId === processTypeId)) {
        return failure("missing_process_type", `${processTypeId} is not in the process type list`, "processTypeId");
    }
    if (businessCode) {
        const clash = (scenario.processMasters ?? []).find(item => isLocalDraftProcess(item) && item.businessCode?.trim().toLocaleLowerCase() === businessCode.toLocaleLowerCase());
        if (clash)
            return failure("duplicate_business_code", `${businessCode} is already used by ${clash.processId}`, "businessCode");
    }
    const processId = nextLocalId((scenario.processMasters ?? []).map(item => item.processId), "local-process");
    const warnings = similarNameWarnings(name, (scenario.processMasters ?? []).map(item => ({ id: item.processId, name: item.name })));
    const process = {
        processId,
        name,
        processType: processTypeId,
        compatibleStationGroupIds,
        ...(description ? { description } : {}),
        ...(businessCode ? { businessCode } : {}),
        sourceSystem: LOCAL_VALIDATION_SOURCE,
        status: "draft",
        version: "local-1",
        createdAt: input.createdAt ?? new Date().toISOString(),
    };
    scenario.processMasters = [...(scenario.processMasters ?? []), process];
    return { scenario, process, warnings };
}
export function setLocalProcessStationGroups(scenario, processId, groupIds) {
    const process = scenario.processMasters?.find(item => item.processId === processId);
    if (!process || !isLocalDraftProcess(process))
        return failure("not_local_draft", "Only local draft processes can be edited", "processId");
    const unique = [...new Set(groupIds)];
    if (unique.some(id => !scenario.stationGroups?.some(group => group.stationGroupId === id))) {
        return failure("station_incompatible", "Choose station groups from the station group master", "compatibleStationGroupIds");
    }
    if (!unique.length && listProcessRouteReferences(scenario, processId).length) {
        return failure("process_group_unbound", "A process used by a route must keep at least one station group", "compatibleStationGroupIds");
    }
    const assigned = (scenario.operationStationAssignments ?? []).filter(item => (scenario.routes.find(route => route.routeId === item.routeId)?.operations.find(op => op.operationId === item.operationId)?.processId) === processId);
    if (assigned.some(item => !unique.includes(scenario.stations?.find(station => station.stationId === item.stationId)?.stationGroupId ?? ""))) {
        return failure("station_incompatible", "Existing station assignments must remain in a compatible group", "compatibleStationGroupIds");
    }
    process.compatibleStationGroupIds = unique;
    return { scenario, process };
}
export function stationCompatibleWithOperation(scenario, operation, station) {
    const process = scenario.processMasters?.find(item => item.processId === operation.processId)
        ?? scenario.processMasters?.find(item => item.processType === operation.processType && item.status === "released");
    if (!process)
        return false;
    const legacyGroupMatch = !!process.compatibleStationGroupIds?.includes(station.stationGroupId ?? "");
    const typeMatch = !!station.qualifiedProcessTypeIds?.includes(operation.processType);
    return (legacyGroupMatch || typeMatch)
        && (!station.qualifiedProcessTypeIds || typeMatch)
        && (!station.qualifiedProcessIds || station.qualifiedProcessIds.includes(process.processId));
}
export function listProcessRouteReferences(scenario, processId) {
    return scenario.routes.flatMap(route => route.operations
        .filter(operation => operation.processId === processId)
        .map(operation => ({
        routeId: route.routeId ?? route.productId,
        productId: route.productId,
        operationId: operation.operationId,
        sequence: operation.sequence,
        status: route.status ?? "released",
    })));
}
export function createLocalRouteCopy(scenario, sourceRouteId) {
    const source = scenario.routes.find(route => route.routeId === sourceRouteId);
    if (!source)
        return failure("source_route_missing", `${sourceRouteId} does not exist`, "sourceRouteId");
    if (isLocalDraftRoute(source))
        return failure("source_route_missing", "Copy a released sample route, not a local draft", "sourceRouteId");
    const routeId = nextRouteId(scenario, source.routeId ?? source.productId);
    const copied = source.operations.map(operation => ({ ...operation }));
    const idMap = new Map(copied.map(operation => [operation.operationId, `${routeId}--${operation.operationId}`]));
    const operations = rewireOperations(copied.map(operation => {
        const next = {
            ...operation,
            operationId: idMap.get(operation.operationId) ?? operation.operationId,
            predecessorOperationIds: (operation.predecessorOperationIds ?? []).map(id => idMap.get(id) ?? id),
            successorOperationIds: (operation.successorOperationIds ?? []).map(id => idMap.get(id) ?? id),
        };
        delete next.inputStageBomId;
        delete next.outputStageBomId;
        delete next.requiredOutputUnitsPerFinishedProduct;
        delete next.quantitySourceVersion;
        return next;
    }));
    const route = {
        routeId,
        productId: source.productId,
        version: "local-1",
        status: "draft",
        sourceSystem: LOCAL_VALIDATION_SOURCE,
        operations,
        ...(source.stationFlowPolicies?.length ? { stationFlowPolicies: source.stationFlowPolicies.map(policy => ({
                fromOperationId: idMap.get(policy.fromOperationId) ?? policy.fromOperationId,
                toOperationId: idMap.get(policy.toOperationId) ?? policy.toOperationId,
                allowedPairs: policy.allowedPairs.map(pair => ({ ...pair })),
            })) } : {}),
    };
    scenario.routes = [...scenario.routes, route];
    return { scenario, route };
}
export function groupProductRoutes(scenario, productId) {
    const routes = scenario.routes.filter(route => route.productId === productId);
    const drafts = routes.filter(isLocalDraftRoute).sort((left, right) => localRouteOrdinal(right.routeId) - localRouteOrdinal(left.routeId)
        || routes.indexOf(right) - routes.indexOf(left));
    const latestDraft = drafts[0];
    return {
        ...(latestDraft ? { latestDraft } : {}),
        historicalDrafts: drafts.slice(1),
        released: routes.filter(route => route.status === "released"),
    };
}
export function renameLocalOperation(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local draft`, "routeId");
    const operation = route.operations.find(item => item.operationId === input.operationId);
    if (!operation)
        return failure("route_not_found", `${input.operationId} is not on this route`, "operationId");
    const name = input.name.trim();
    if (!name || name.length > 80)
        return failure("invalid_name", "operation name must be 1–80 characters", "name");
    operation.name = name;
    return { scenario, operation };
}
export function setLocalStationFlowPolicy(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local draft`, "routeId");
    const policies = (route.stationFlowPolicies ?? []).filter(item => item.fromOperationId !== input.fromOperationId || item.toOperationId !== input.toOperationId);
    if (input.allowedPairs !== undefined) {
        const ordered = [...route.operations].sort((a, b) => a.sequence - b.sequence);
        const index = ordered.findIndex(item => item.operationId === input.fromOperationId);
        if (index < 0 || ordered[index + 1]?.operationId !== input.toOperationId) {
            return failure("invalid_station_flow", "Only adjacent route operations may be linked", "toOperationId");
        }
        if (!input.allowedPairs.length)
            return failure("invalid_station_flow", "Select at least one station link", "allowedPairs");
        const assigned = (operationId) => new Set((scenario.operationStationAssignments ?? [])
            .filter(item => item.routeId === input.routeId && item.operationId === operationId && item.planningAllowed)
            .map(item => item.stationId));
        const from = assigned(input.fromOperationId);
        const to = assigned(input.toOperationId);
        const unique = new Set();
        for (const pair of input.allowedPairs) {
            const key = JSON.stringify([pair.fromStationId, pair.toStationId]);
            if (!from.has(pair.fromStationId) || !to.has(pair.toStationId) || unique.has(key)) {
                return failure("invalid_station_flow", "Links must use distinct plannable stations on the adjacent operations", "allowedPairs");
            }
            unique.add(key);
        }
        policies.push({ fromOperationId: input.fromOperationId, toOperationId: input.toOperationId,
            allowedPairs: input.allowedPairs.map(pair => ({ ...pair })) });
    }
    route.stationFlowPolicies = policies;
    return { scenario, route };
}
export function insertLocalOperation(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local validation route`, "routeId");
    const operationId = input.operationId.trim();
    const name = input.name.trim();
    const processId = input.processId.trim();
    if (!operationId)
        return failure("missing_field", "operationId is required", "operationId");
    if (!name)
        return failure("missing_field", "operation name is required", "name");
    if (!processId)
        return failure("missing_field", "processId is required", "processId");
    if (!Number.isInteger(input.sequence) || input.sequence <= 0) {
        return failure("duplicate_sequence", "sequence must be a positive integer", "sequence");
    }
    if (scenario.routes.some(item => item.operations.some(operation => operation.operationId === operationId))) {
        return failure("duplicate_operation", `${operationId} already exists`, "operationId");
    }
    if (route.operations.some(operation => operation.sequence === input.sequence)) {
        return failure("duplicate_sequence", `sequence ${input.sequence} is already used`, "sequence");
    }
    const process = scenario.processMasters?.find(item => item.processId === processId);
    if (!process)
        return failure("missing_process", `${processId} is not in the process list`, "processId");
    const operation = {
        operationId,
        processId,
        sequence: input.sequence,
        name,
        processType: process.processType,
        ...(process.description ? { description: process.description } : {}),
    };
    route.operations = rewireOperations([...route.operations, operation]);
    return { scenario, operation };
}
export function reorderLocalOperations(scenario, routeId, orderedOperationIds) {
    const route = localRoute(scenario, routeId);
    if (!route)
        return failure("not_local_draft", `${routeId} is not a local validation route`, "routeId");
    const existingIds = new Set(route.operations.map(item => item.operationId));
    if (orderedOperationIds.length !== route.operations.length
        || new Set(orderedOperationIds).size !== orderedOperationIds.length
        || orderedOperationIds.some(id => !existingIds.has(id))) {
        return failure("invalid_order", "Order must contain each operation exactly once", "operationId");
    }
    const byId = new Map(route.operations.map(item => [item.operationId, item]));
    route.operations = rewireOperations(orderedOperationIds.map((id, index) => ({
        ...byId.get(id), sequence: (index + 1) * 10,
    })));
    return { scenario, route };
}
export function insertLocalOperationAt(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local validation route`, "routeId");
    if (!Number.isInteger(input.index) || input.index < 0 || input.index > route.operations.length) {
        return failure("invalid_order", "Insertion position is outside the route", "index");
    }
    const process = scenario.processMasters?.find(item => item.processId === input.processId);
    if (!process)
        return failure("missing_process", `${input.processId} is not in the process list`, "processId");
    const originalIds = [...route.operations].sort((a, b) => a.sequence - b.sequence).map(item => item.operationId);
    const operationId = nextLocalId(scenario.routes.flatMap(item => item.operations.map(operation => operation.operationId)), "local-op");
    const sequence = Math.max(0, ...route.operations.map(item => item.sequence)) + 10;
    const inserted = insertLocalOperation(scenario, {
        routeId: input.routeId, processId: process.processId, operationId, sequence, name: process.name,
    });
    if ("issues" in inserted)
        return inserted;
    originalIds.splice(input.index, 0, operationId);
    const reordered = reorderLocalOperations(scenario, input.routeId, originalIds);
    return "issues" in reordered ? reordered : { scenario, operation: inserted.operation };
}
export function removeLocalOperation(scenario, routeId, operationId) {
    const route = localRoute(scenario, routeId);
    if (!route)
        return failure("not_local_draft", `${routeId} is not a local validation route`, "routeId");
    if (!route.operations.some(operation => operation.operationId === operationId)) {
        return failure("route_not_found", `${operationId} is not on ${routeId}`, "operationId");
    }
    route.operations = rewireOperations(route.operations.filter(operation => operation.operationId !== operationId));
    scenario.operationStationAssignments = (scenario.operationStationAssignments ?? [])
        .filter(item => !(item.routeId === routeId && item.operationId === operationId));
    scenario.operationStationParameters = (scenario.operationStationParameters ?? [])
        .filter(item => item.operationId !== operationId);
    scenario.stageBoms = (scenario.stageBoms ?? []).filter(item => !(item.routeId === routeId && item.operationId === operationId));
    scenario.wipStates = (scenario.wipStates ?? []).filter(item => !(item.routeId === routeId && item.operationId === operationId));
    return { scenario };
}
export function createLocalStation(scenario, input) {
    const stationId = input.stationId.trim();
    const name = input.name.trim();
    if (!stationId)
        return failure("missing_field", "stationId is required", "stationId");
    if (!name)
        return failure("missing_field", "station name is required", "name");
    if (scenario.stations?.some(item => item.stationId === stationId)) {
        return failure("duplicate_station", `${stationId} already exists`, "stationId");
    }
    if (input.stationGroupId && !scenario.stationGroups?.some(group => group.stationGroupId === input.stationGroupId)) {
        return failure("station_incompatible", "Station group does not exist", "stationGroupId");
    }
    const existing = input.investmentStatus === "existing";
    const equipmentId = input.equipmentId?.trim();
    const sourceReference = input.sourceReference?.trim();
    if (existing && !equipmentId)
        return failure("missing_field", "Declared equipment code is required", "equipmentId");
    if (!existing && equipmentId)
        return failure("station_incompatible", "A planned resource cannot claim a physical equipment code", "equipmentId");
    if (equipmentId && scenario.stations?.some(item => item.equipmentId === equipmentId)) {
        return failure("duplicate_station", `${equipmentId} is already registered`, "equipmentId");
    }
    if (existing && !sourceReference)
        return failure("missing_field", "Resource source is required", "sourceReference");
    const qualifiedProcess = scenario.processMasters?.find(item => item.processId === input.qualifiedProcessId);
    if (input.qualifiedProcessId && !qualifiedProcess) {
        return failure("missing_process", "Qualified process does not exist", "qualifiedProcessId");
    }
    if (qualifiedProcess && input.stationGroupId && !qualifiedProcess.compatibleStationGroupIds?.includes(input.stationGroupId)) {
        return failure("station_incompatible", "Station group is not linked to the qualified process", "stationGroupId");
    }
    const qualifiedProcessTypeIds = [...new Set([...(input.qualifiedProcessTypeIds ?? []), ...(qualifiedProcess ? [qualifiedProcess.processType] : [])])];
    if (!qualifiedProcessTypeIds.length)
        return failure("missing_field", "Select at least one process type", "qualifiedProcessTypeIds");
    if (qualifiedProcessTypeIds.some(id => !scenario.processTypes?.some(type => type.processTypeId === id))) {
        return failure("missing_process_type", "A selected process type does not exist", "qualifiedProcessTypeIds");
    }
    if (existing && !input.qualificationConfirmed) {
        return failure("station_incompatible", "Confirm the declared resource and candidate process types", "qualificationConfirmed");
    }
    const station = {
        stationId, name, investmentStatus: existing ? "existing" : "plannedInvestment",
        ...(input.stationGroupId ? { stationGroupId: input.stationGroupId } : {}),
        ...(equipmentId ? { equipmentId } : {}),
        sourceSystem: LOCAL_VALIDATION_SOURCE,
        ...(sourceReference ? { sourceReference } : {}),
        identityVerificationStatus: "localDeclaration",
        qualifiedProcessTypeIds,
        ...(qualifiedProcess ? { qualifiedProcessIds: [qualifiedProcess.processId] } : {}),
    };
    scenario.stations = [...(scenario.stations ?? []), station];
    const group = scenario.stationGroups?.find(item => item.stationGroupId === input.stationGroupId);
    if (group)
        group.stationIds = [...new Set([...group.stationIds, stationId])];
    return { scenario, station };
}
export function assignLocalStation(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local validation route`, "routeId");
    const operation = route.operations.find(item => item.operationId === input.operationId);
    if (!operation) {
        return failure("route_not_found", `${input.operationId} is not on ${input.routeId}`, "operationId");
    }
    const station = scenario.stations?.find(item => item.stationId === input.stationId);
    if (!station)
        return failure("station_missing", `${input.stationId} is not in the station master`, "stationId");
    if (!stationCompatibleWithOperation(scenario, operation, station)) {
        return failure("station_incompatible", `${input.stationId} is not a candidate for this process type`, "stationId");
    }
    if ((scenario.operationStationAssignments ?? []).some(item => item.routeId === input.routeId && item.operationId === input.operationId && item.stationId === input.stationId)) {
        return failure("duplicate_assignment", `${input.stationId} is already assigned`, "stationId");
    }
    const backup = input.role === "backup";
    const future = station.investmentStatus !== "existing";
    const needsApproval = backup || input.customerApprovalRequired === true;
    const planningAllowed = !backup && !future && !needsApproval;
    const assignment = {
        assignmentId: `local-assign-${input.routeId}-${input.operationId}-${input.stationId}`,
        productId: route.productId,
        routeId: input.routeId,
        operationId: input.operationId,
        stationId: input.stationId,
        role: input.role,
        allocationMode: "forecastCalculated",
        customerApprovalRequired: needsApproval,
        approvalStatus: needsApproval ? "pending" : "notRequired",
        planningAllowed,
        ...(backup && input.backupCondition?.trim() ? { backupCondition: input.backupCondition.trim() } : {}),
        ...(!planningAllowed ? { planningBlockerReason: future ? "Planned investment station is not available for planning" : "Customer approval pending" } : {}),
    };
    scenario.operationStationAssignments = [...(scenario.operationStationAssignments ?? []), assignment];
    return { scenario, assignment };
}
export function saveLocalStationParameter(scenario, input) {
    const route = localRoute(scenario, input.routeId);
    if (!route)
        return failure("not_local_draft", `${input.routeId} is not a local validation route`, "routeId");
    const assignment = (scenario.operationStationAssignments ?? []).find(item => item.routeId === input.routeId && item.operationId === input.operationId && item.stationId === input.stationId);
    if (!assignment)
        return failure("station_missing", `${input.stationId} is not assigned to ${input.operationId}`, "stationId");
    if (!assignment.planningAllowed) {
        return failure(assignment.planningBlockerReason?.includes("investment") ? "investment_not_plannable" : "backup_not_plannable", assignment.planningBlockerReason ?? "This station cannot take a planning parameter", "stationId");
    }
    if (input.performanceRate === undefined || input.qualityRate === undefined) {
        return failure("parameter_incomplete", "P and Q must be entered", "performanceRate");
    }
    try {
        const parameter = createLocalBaselineParameter({
            operationId: input.operationId,
            stationId: input.stationId,
            standardCycleSec: input.standardCycleSec,
            piecesPerCycle: input.piecesPerCycle,
            performanceRate: input.performanceRate,
            qualityRate: input.qualityRate,
            parameterId: `local-baseline-${input.routeId}-${input.operationId}-${input.stationId}`,
            effectiveFrom: input.effectiveFrom,
        });
        const parameters = scenario.operationStationParameters ?? [];
        scenario.operationStationParameters = [
            ...parameters.filter(item => item.parameterId !== parameter.parameterId),
            parameter,
        ];
        return { scenario, parameter };
    }
    catch (error) {
        return failure("parameter_incomplete", error instanceof Error ? error.message : String(error), "standardCycleSec");
    }
}
export function assessLocalTrial(scenario, productId, routeId) {
    const formal = validateProductRoutingMasterData(scenario, productId, routeId);
    const route = scenario.routes.find(item => item.productId === productId && item.routeId === routeId);
    const gaps = [];
    if (!route || !isLocalDraftRoute(route)) {
        return { localFlowOpen: false, calculable: false, gaps, formalReady: formal.formalReady, formalIssues: formal.issues };
    }
    for (const operation of route.operations) {
        if (!operation.outputStageBomId && !operation.inputStageBomId) {
            gaps.push({ code: "stage_reference_missing", field: operation.operationId, message: `${operation.operationId} has no stage BOM or WIP reference` });
        }
        const assignments = (scenario.operationStationAssignments ?? []).filter(item => item.routeId === routeId && item.operationId === operation.operationId);
        if (!assignments.length) {
            gaps.push({ code: "station_missing", field: operation.operationId, message: `${operation.operationId} has no station assignment` });
            continue;
        }
        for (const assignment of assignments.filter(item => item.planningAllowed)) {
            const parameter = (scenario.operationStationParameters ?? []).some(item => item.operationId === assignment.operationId && item.stationId === assignment.stationId && item.parameterId.startsWith("local-baseline-"));
            const sampleParameter = (scenario.operationStationParameters ?? []).some(item => item.operationId === assignment.operationId && item.stationId === assignment.stationId);
            if (!parameter && !sampleParameter) {
                gaps.push({ code: "parameter_incomplete", field: assignment.stationId, message: `${operation.operationId} / ${assignment.stationId} has no CT, pieces per cycle, P or Q` });
            }
        }
    }
    const calculable = route.operations.some(operation => (scenario.operationStationAssignments ?? []).some(assignment => assignment.routeId === routeId && assignment.operationId === operation.operationId && assignment.planningAllowed
        && (scenario.operationStationParameters ?? []).some(item => item.operationId === operation.operationId && item.stationId === assignment.stationId)));
    return { localFlowOpen: true, calculable, gaps, formalReady: false, formalIssues: formal.issues };
}
export function extractLocalValidation(scenario) {
    const routes = scenario.routes.filter(isLocalDraftRoute);
    const routeIds = new Set(routes.map(route => route.routeId));
    const operationIds = new Set(routes.flatMap(route => route.operations.map(operation => operation.operationId)));
    return {
        schemaVersion: LOCAL_VALIDATION_SCHEMA_VERSION,
        processes: (scenario.processMasters ?? []).filter(isLocalDraftProcess),
        processTypes: (scenario.processTypes ?? []).filter(isLocalDraftProcessType),
        routes,
        assignments: (scenario.operationStationAssignments ?? []).filter(item => routeIds.has(item.routeId)),
        stations: (scenario.stations ?? []).filter(item => item.sourceSystem === LOCAL_VALIDATION_SOURCE
            || (item.investmentStatus === "plannedInvestment"
                && (scenario.operationStationAssignments ?? []).some(assignment => routeIds.has(assignment.routeId) && assignment.stationId === item.stationId))),
        stationGroups: (scenario.stationGroups ?? []).filter(item => item.stationGroupId.startsWith("local-group-")),
        parameters: (scenario.operationStationParameters ?? []).filter(item => operationIds.has(item.operationId) && item.parameterId.startsWith("local-baseline-")),
    };
}
export function applyLocalValidation(scenario, store) {
    if (store.schemaVersion !== 1 && store.schemaVersion !== LOCAL_VALIDATION_SCHEMA_VERSION)
        return scenario;
    const sampleProcessIds = new Set((scenario.processMasters ?? []).filter(item => !isLocalDraftProcess(item)).map(item => item.processId));
    const sampleTypeIds = new Set((scenario.processTypes ?? []).filter(item => !isLocalDraftProcessType(item)).map(item => item.processTypeId));
    const sampleRouteIds = new Set(scenario.routes.filter(item => !isLocalDraftRoute(item)).map(item => item.routeId));
    const sampleStationIds = new Set((scenario.stations ?? []).filter(item => item.investmentStatus === "existing").map(item => item.stationId));
    for (const group of store.stationGroups ?? []) {
        if (!group.stationGroupId.startsWith("local-group-") || scenario.stationGroups?.some(item => item.stationGroupId === group.stationGroupId))
            continue;
        scenario.stationGroups = [...(scenario.stationGroups ?? []), group];
    }
    for (const processType of store.processTypes ?? []) {
        if (!isLocalDraftProcessType(processType) || sampleTypeIds.has(processType.processTypeId))
            continue;
        if (!scenario.processTypes?.some(item => item.processTypeId === processType.processTypeId)) {
            scenario.processTypes = [...(scenario.processTypes ?? []), processType];
        }
    }
    for (const process of store.processes) {
        if (!isLocalDraftProcess(process) || sampleProcessIds.has(process.processId))
            continue;
        if (!scenario.processMasters?.some(item => item.processId === process.processId)) {
            scenario.processMasters = [...(scenario.processMasters ?? []), process];
        }
    }
    for (const route of store.routes) {
        if (!isLocalDraftRoute(route) || sampleRouteIds.has(route.routeId))
            continue;
        if (!scenario.routes.some(item => item.routeId === route.routeId))
            scenario.routes = [...scenario.routes, route];
    }
    for (const station of store.stations) {
        if (sampleStationIds.has(station.stationId) || (station.sourceSystem !== LOCAL_VALIDATION_SOURCE && station.investmentStatus !== "plannedInvestment"))
            continue;
        if (!scenario.stations?.some(item => item.stationId === station.stationId)) {
            scenario.stations = [...(scenario.stations ?? []), station];
        }
        const group = scenario.stationGroups?.find(item => item.stationGroupId === station.stationGroupId);
        if (group)
            group.stationIds = [...new Set([...group.stationIds, station.stationId])];
    }
    for (const assignment of store.assignments) {
        if (sampleRouteIds.has(assignment.routeId))
            continue;
        if (!(scenario.operationStationAssignments ?? []).some(item => item.assignmentId === assignment.assignmentId)) {
            scenario.operationStationAssignments = [...(scenario.operationStationAssignments ?? []), assignment];
        }
    }
    for (const parameter of store.parameters) {
        if (!parameter.parameterId.startsWith("local-baseline-"))
            continue;
        if (!(scenario.operationStationParameters ?? []).some(item => item.parameterId === parameter.parameterId)) {
            scenario.operationStationParameters = [...(scenario.operationStationParameters ?? []), parameter];
        }
    }
    return scenario;
}
export function clearLocalValidation(scenario) {
    const routeIds = new Set(scenario.routes.filter(isLocalDraftRoute).map(route => route.routeId));
    const operationIds = new Set(scenario.routes.filter(isLocalDraftRoute).flatMap(route => route.operations.map(operation => operation.operationId)));
    scenario.routes = scenario.routes.filter(item => !isLocalDraftRoute(item));
    scenario.operationStationAssignments = (scenario.operationStationAssignments ?? []).filter(item => !routeIds.has(item.routeId));
    scenario.operationStationParameters = (scenario.operationStationParameters ?? [])
        .filter(item => !(operationIds.has(item.operationId) && item.parameterId.startsWith("local-baseline-")));
    scenario.stageBoms = (scenario.stageBoms ?? []).filter(item => !routeIds.has(item.routeId));
    scenario.wipStates = (scenario.wipStates ?? []).filter(item => !routeIds.has(item.routeId));
    return scenario;
}
export function rewireOperations(operations) {
    const ordered = [...operations].sort((a, b) => a.sequence - b.sequence);
    return ordered.map((operation, index) => {
        const previous = ordered[index - 1];
        const next = ordered[index + 1];
        return {
            ...operation,
            ...(previous ? { predecessorOperationIds: [previous.operationId] } : { predecessorOperationIds: [] }),
            ...(next ? { successorOperationIds: [next.operationId] } : { successorOperationIds: [] }),
        };
    });
}
function localRoute(scenario, routeId) {
    const route = scenario.routes.find(item => item.routeId === routeId);
    return route && isLocalDraftRoute(route) ? route : undefined;
}
function nextRouteId(scenario, sourceRouteId) {
    const prefix = `local-${sourceRouteId}`;
    const indices = scenario.routes
        .map(route => route.routeId?.startsWith(`${prefix}-`) ? Number(route.routeId.slice(prefix.length + 1)) : 0)
        .filter(index => Number.isSafeInteger(index) && index > 0);
    return `${prefix}-${Math.max(0, ...indices) + 1}`;
}
function localRouteOrdinal(routeId) {
    const match = routeId?.match(/-(\d+)$/);
    return match ? Number(match[1]) : 0;
}
function nextLocalId(existing, prefix) {
    let index = 1;
    while (existing.includes(`${prefix}-${index}`))
        index += 1;
    return `${prefix}-${index}`;
}
function normalizeName(value) {
    return value.trim().toLocaleLowerCase().replace(/\s+/g, "");
}
function editDistance(left, right) {
    const a = Array.from(left);
    const b = Array.from(right);
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
        let previous = row[0] ?? 0;
        row[0] = i;
        for (let j = 1; j <= b.length; j += 1) {
            const current = row[j] ?? 0;
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            row[j] = Math.min((row[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, previous + cost);
            previous = current;
        }
    }
    return row[b.length] ?? 0;
}
function namesSimilar(left, right) {
    const a = normalizeName(left);
    const b = normalizeName(right);
    if (!a || !b)
        return false;
    if (a === b)
        return true;
    const longest = Math.max(Array.from(a).length, Array.from(b).length);
    const limit = longest >= 4 ? 2 : 1;
    return editDistance(a, b) <= limit;
}
function similarNameWarnings(name, existing) {
    return existing
        .filter(item => namesSimilar(item.name, name))
        .map(item => ({ code: "similar_name", field: item.id, message: `${name} is similar to ${item.name} (${item.id})` }));
}
