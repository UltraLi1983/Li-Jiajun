import { isLocalDraftRoute, stationCompatibleWithOperation } from "./local-validation-route.js";
const failure = (code, message, field) => ({
    issues: [{ code, message, ...(field ? { field } : {}) }],
});
export function localRouteReviewState(scenario, routeId) {
    const route = scenario.routes.find(item => item.routeId === routeId);
    if (!route || !isLocalDraftRoute(route) || !route.reviewRequest)
        return "none";
    return route.reviewRequest.fingerprint === routeReviewFingerprint(scenario, route) ? "pending" : "stale";
}
export function submitLocalRouteForReview(scenario, routeId, submittedAt) {
    const route = scenario.routes.find(item => item.routeId === routeId);
    if (!route || !isLocalDraftRoute(route))
        return failure("not_local_draft", "Only a local draft route can be submitted for review", "routeId");
    if (!Number.isFinite(Date.parse(submittedAt)))
        return failure("missing_field", "A valid submission time is required", "submittedAt");
    if (!route.operations.length)
        return failure("missing_field", "Add at least one operation before review", "operations");
    const operationIds = new Set();
    const sequences = new Set();
    for (const operation of route.operations) {
        if (!Number.isSafeInteger(operation.sequence) || operation.sequence <= 0 || sequences.has(operation.sequence) || operationIds.has(operation.operationId)) {
            return failure("invalid_order", `Invalid or duplicate operation sequence: ${operation.operationId}`, "operations");
        }
        operationIds.add(operation.operationId);
        sequences.add(operation.sequence);
        if (!scenario.processMasters?.some(item => item.processId === operation.processId)) {
            return failure("missing_process", `${operation.operationId} has no registered process`, operation.operationId);
        }
        const assignments = (scenario.operationStationAssignments ?? []).filter(item => item.routeId === routeId && item.operationId === operation.operationId);
        if (!assignments.length)
            return failure("station_missing", `${operation.operationId} has no assigned station`, operation.operationId);
        for (const assignment of assignments) {
            if (assignment.productId !== route.productId) {
                return failure("invalid_order", `${assignment.assignmentId} belongs to another product`, assignment.assignmentId);
            }
            const station = scenario.stations?.find(item => item.stationId === assignment.stationId);
            if (!station)
                return failure("station_missing", `${assignment.stationId} is not registered`, assignment.stationId);
            if (!stationCompatibleWithOperation(scenario, operation, station)) {
                return failure("station_incompatible", `${assignment.stationId} is not compatible with ${operation.operationId}`, assignment.stationId);
            }
        }
    }
    route.reviewRequest = { submittedAt, fingerprint: routeReviewFingerprint(scenario, route) };
    return { scenario, route };
}
function routeReviewFingerprint(scenario, route) {
    const operations = route.operations.map(item => item.operationId);
    const processIds = new Set(route.operations.map(item => item.processId));
    const processes = (scenario.processMasters ?? []).filter(item => processIds.has(item.processId));
    const processTypeIds = new Set(processes.map(item => item.processType));
    const assignments = (scenario.operationStationAssignments ?? []).filter(item => item.routeId === route.routeId && operations.includes(item.operationId));
    const stationIds = new Set(assignments.map(item => item.stationId));
    return JSON.stringify({
        route: { ...route, reviewRequest: undefined },
        processes: processes.sort((a, b) => a.processId.localeCompare(b.processId)),
        processTypes: (scenario.processTypes ?? []).filter(item => processTypeIds.has(item.processTypeId)).sort((a, b) => a.processTypeId.localeCompare(b.processTypeId)),
        assignments: [...assignments].sort((a, b) => a.assignmentId.localeCompare(b.assignmentId)),
        stations: (scenario.stations ?? []).filter(item => stationIds.has(item.stationId)).sort((a, b) => a.stationId.localeCompare(b.stationId)),
    });
}
