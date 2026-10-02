import { selectEffectiveParameter } from "./parameter-versioning.js";
export function calculateRequiredCapacityShare(scenario, input) {
    const product = findProduct(scenario, input.productId);
    const parameter = findParameter(scenario, input.operationId, input.stationId);
    const demandQty = input.demandQty ?? product.weeklyDemand;
    const availableMinutes = Math.max(input.availableMinutes, 0);
    if (availableMinutes <= 0) {
        throw new Error("availableMinutes must be greater than 0");
    }
    const performanceRate = Math.max(parameter.performanceRate, 0.0001);
    const qualityRate = Math.max(parameter.qualityRate, 0.0001);
    const piecesPerCycle = Math.max(parameter.piecesPerCycle, 0.0001);
    const requiredCycles = demandQty / piecesPerCycle / qualityRate;
    const requiredMinutes = requiredCycles * parameter.standardCycleSec / 60 / performanceRate;
    return {
        productId: input.productId,
        operationId: input.operationId,
        stationId: input.stationId,
        demandQty,
        requiredMinutes,
        availableMinutes,
        requiredCapacityShare: requiredMinutes / availableMinutes,
    };
}
export function findCapacityShareProfile(scenario, productId, operationId, stationId) {
    return (scenario.capacityShareProfiles ?? []).find(profile => profile.productId === productId
        && profile.operationId === operationId
        && profile.stationId === stationId);
}
function findProduct(scenario, productId) {
    const product = scenario.products?.find(item => item.productId === productId);
    if (!product)
        throw new Error(`${productId} does not exist in products`);
    return product;
}
function findParameter(scenario, operationId, stationId) {
    const parameter = selectEffectiveParameter(scenario.operationStationParameters ?? [], operationId, stationId);
    if (!parameter)
        throw new Error(`${operationId} on ${stationId} has no operation-station parameter`);
    return parameter;
}
export function evaluateCapacityShare(scenario, input) {
    const profile = findCapacityShareProfile(scenario, input.productId, input.operationId, input.stationId);
    const requestedCapacityShare = input.requestedCapacityShare ?? profile?.requestedCapacityShare ?? 1;
    const requiredCapacityShare = input.requiredCapacityShare ?? profile?.requiredCapacityShare;
    const actualCapacityShare = input.actualCapacityShare ?? profile?.actualCapacityShare;
    const warningThreshold = input.warningThreshold ?? 0.02;
    const criticalThreshold = input.criticalThreshold ?? 0.05;
    const risks = [];
    if (requiredCapacityShare !== undefined) {
        pushRiskIfNeeded(risks, "required_exceeds_ceiling", requiredCapacityShare - requestedCapacityShare, warningThreshold, criticalThreshold, `required share ${(requiredCapacityShare * 100).toFixed(1)}% exceeds capacity ceiling ${(requestedCapacityShare * 100).toFixed(1)}%`);
    }
    if (requiredCapacityShare !== undefined && actualCapacityShare !== undefined) {
        pushRiskIfNeeded(risks, "actual_exceeds_required", actualCapacityShare - requiredCapacityShare, warningThreshold, criticalThreshold, `actual share ${(actualCapacityShare * 100).toFixed(1)}% exceeds required share ${(requiredCapacityShare * 100).toFixed(1)}%`);
    }
    if (actualCapacityShare !== undefined) {
        pushRiskIfNeeded(risks, "actual_exceeds_ceiling", actualCapacityShare - requestedCapacityShare, warningThreshold, criticalThreshold, `actual share ${(actualCapacityShare * 100).toFixed(1)}% exceeds capacity ceiling ${(requestedCapacityShare * 100).toFixed(1)}%`);
    }
    const result = {
        productId: input.productId,
        operationId: input.operationId,
        stationId: input.stationId,
        risks,
        status: highestRiskLevel(risks),
    };
    result.requestedCapacityShare = requestedCapacityShare;
    if (requiredCapacityShare !== undefined)
        result.requiredCapacityShare = requiredCapacityShare;
    if (actualCapacityShare !== undefined)
        result.actualCapacityShare = actualCapacityShare;
    return result;
}
function pushRiskIfNeeded(risks, code, delta, warningThreshold, criticalThreshold, message) {
    if (delta <= warningThreshold)
        return;
    risks.push({
        code,
        level: delta >= criticalThreshold ? "critical" : "warning",
        delta,
        message,
    });
}
function highestRiskLevel(risks) {
    if (risks.some(risk => risk.level === "critical"))
        return "critical";
    if (risks.some(risk => risk.level === "warning"))
        return "warning";
    return "ok";
}
export function calculateActualCapacityShare(input) {
    const actualMinutes = Math.max(input.actualMinutes, 0);
    const availableMinutes = Math.max(input.availableMinutes, 0);
    if (availableMinutes <= 0) {
        throw new Error("availableMinutes must be greater than 0");
    }
    return {
        productId: input.productId,
        operationId: input.operationId,
        stationId: input.stationId,
        actualMinutes,
        availableMinutes,
        actualCapacityShare: actualMinutes / availableMinutes,
    };
}
