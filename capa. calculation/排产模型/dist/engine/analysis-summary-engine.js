import { checkBatchHUCompliance } from "./batch-hu-engine.js";
import { calculateCapacityScenario } from "./capacity-engine.js";
import { calculateRequiredCapacityShare, evaluateCapacityShare, findCapacityShareProfile, } from "./capacity-share-engine.js";
import { checkProductReadiness } from "./readiness-engine.js";
export function runCapacityAnalysisPreflight(scenario, input) {
    const readiness = checkProductReadiness(scenario, input.productId);
    const capacityResults = calculateCapacityScenario(scenario);
    const shareEvaluations = evaluatePlanningAllowedShares(scenario, input);
    const batchChecks = checkPlannedBatchQuantities(scenario, input);
    const blockers = [
        ...readiness.issues.filter(issue => issue.severity === "error").map(issue => issue.message),
        ...batchChecks.filter(check => check.status === "invalid").map(check => check.message),
    ];
    const warnings = [
        ...readiness.issues.filter(issue => issue.severity === "warning").map(issue => issue.message),
        ...shareEvaluations.flatMap(evaluation => evaluation.risks.map(risk => risk.message)),
        ...batchChecks.filter(check => check.status === "needsApproval").map(check => check.message),
    ];
    return {
        productId: input.productId,
        ready: readiness.ready && blockers.length === 0,
        readiness,
        capacityResults,
        shareEvaluations,
        batchChecks,
        blockers,
        warnings,
    };
}
function evaluatePlanningAllowedShares(scenario, input) {
    const evaluations = [];
    const evaluatedKeys = new Set();
    const assignments = (scenario.operationStationAssignments ?? []).filter(assignment => assignment.productId === input.productId && assignment.planningAllowed);
    for (const assignment of assignments) {
        const key = buildShareKey(input.productId, assignment.operationId, assignment.stationId);
        const availableMinutes = input.availableMinutesByStation?.[assignment.stationId];
        const profile = findCapacityShareProfile(scenario, input.productId, assignment.operationId, assignment.stationId);
        if (availableMinutes !== undefined && availableMinutes > 0) {
            const required = calculateRequiredCapacityShare(scenario, {
                productId: input.productId,
                operationId: assignment.operationId,
                stationId: assignment.stationId,
                availableMinutes,
            });
            const evaluationInput = {
                productId: input.productId,
                operationId: assignment.operationId,
                stationId: assignment.stationId,
                requiredCapacityShare: required.requiredCapacityShare,
            };
            evaluationInput.requestedCapacityShare = assignment.plannedShare ?? profile?.requestedCapacityShare ?? 1;
            if (profile?.actualCapacityShare !== undefined) {
                evaluationInput.actualCapacityShare = profile.actualCapacityShare;
            }
            evaluations.push(evaluateCapacityShare(scenario, evaluationInput));
            evaluatedKeys.add(key);
            continue;
        }
        if (profile) {
            evaluations.push(evaluateCapacityShare(scenario, {
                productId: input.productId,
                operationId: assignment.operationId,
                stationId: assignment.stationId,
                requestedCapacityShare: assignment.plannedShare ?? profile.requestedCapacityShare ?? 1,
            }));
            evaluatedKeys.add(key);
        }
    }
    for (const profile of scenario.capacityShareProfiles ?? []) {
        if (profile.productId !== input.productId)
            continue;
        const key = buildShareKey(profile.productId, profile.operationId, profile.stationId);
        if (evaluatedKeys.has(key))
            continue;
        evaluations.push(evaluateCapacityShare(scenario, {
            productId: profile.productId,
            operationId: profile.operationId,
            stationId: profile.stationId,
        }));
        evaluatedKeys.add(key);
    }
    return evaluations;
}
function checkPlannedBatchQuantities(scenario, input) {
    const checks = [];
    for (const [operationId, quantity] of Object.entries(input.plannedQuantityByOperation ?? {})) {
        checks.push(checkBatchHUCompliance(scenario, {
            productId: input.productId,
            operationId,
            quantity,
        }));
    }
    return checks;
}
function buildShareKey(productId, operationId, stationId) {
    return `${productId}::${operationId}::${stationId}`;
}
