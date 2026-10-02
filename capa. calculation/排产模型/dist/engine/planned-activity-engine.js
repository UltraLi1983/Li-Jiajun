export function expandPlannedActivityRules(scenario, input = {}) {
    const repetitions = Math.max(input.repetitions ?? 1, 1);
    return (scenario.plannedActivityRules ?? [])
        .filter(rule => isApprovedRule(rule))
        .filter(rule => input.stationId === undefined || rule.stationId === input.stationId)
        .filter(rule => input.operationId === undefined || rule.operationId === input.operationId || rule.operationId === undefined)
        .filter(rule => input.includeScheduleSource === true || rule.source === "rule")
        .flatMap(rule => expandRule(rule, repetitions));
}
function isApprovedRule(rule) {
    return rule.approvalStatus === "approved" || rule.approvalStatus === "effective" || rule.approvalStatus === "notRequired";
}
function expandRule(rule, repetitions) {
    if (rule.standardMinutes === undefined || rule.standardMinutes <= 0)
        return [];
    return Array.from({ length: rule.isRecurring ? repetitions : 1 }, () => ({
        kind: rule.activityKind,
        minutes: rule.standardMinutes ?? 0,
        source: rule.source === "rule" ? "template" : "schedule",
        note: rule.ruleId,
    }));
}
