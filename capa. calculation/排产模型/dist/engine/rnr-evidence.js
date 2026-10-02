import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";
const abnormalCategories = new Set([
    "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue",
]);
export function buildRnrEvidence(input) {
    const timeline = reconcileRnrTimeline(input);
    const blockers = [];
    const notices = [];
    if (timeline.unrecordedMinutes > 0)
        blockers.push({ code: "unrecorded_time" });
    if (timeline.plannedGapMinutes > 0)
        blockers.push({ code: "planned_gap" });
    const production = input.actual.filter(event => event.kind === "production");
    if (!production.length)
        blockers.push({ code: "no_production" });
    const speedById = new Map(input.speed.segments.map(segment => [segment.id, segment]));
    const inferred = [];
    for (const event of production) {
        const segment = speedById.get(event.id);
        if (!segment || segment.issue === "invalid_observation") {
            blockers.push({ code: "invalid_observation", sourceEventId: event.id });
            continue;
        }
        if (segment.issue === "faster_than_verified_standard") {
            blockers.push({ code: "faster_than_verified_standard", sourceEventId: event.id });
            continue;
        }
        if (segment.inferredSaLossMinutes > 0) {
            inferred.push({
                findingId: `finding-${event.id}`, sourceProductionEventId: event.id,
                productId: input.productId, operationId: input.operationId, stationId: input.stationId,
                startMinute: event.startMinute, endMinute: event.endMinute,
                estimatedMinutes: segment.inferredSaLossMinutes,
                evidenceSource: "outputInference", status: "suspected",
            });
        }
    }
    if (inferred.length)
        notices.push({ code: "unexplained_inferred_loss" });
    const explicit = input.actual
        .filter(event => abnormalCategories.has(event.kind))
        .map(event => {
        const evidenceSource = event.evidenceSource?.trim() ?? "";
        if (!evidenceSource)
            notices.push({ code: "missing_evidence_source", sourceEventId: event.id });
        return {
            evidenceId: `evidence-${event.id}`, sourceEventId: event.id,
            productId: input.productId, operationId: input.operationId, stationId: input.stationId,
            category: event.kind,
            startMinute: event.startMinute, endMinute: event.endMinute,
            minutes: event.endMinute - event.startMinute,
            evidenceSource, isEstimated: event.isEstimated ?? false,
            ...(event.note ? { note: event.note } : {}),
        };
    });
    return {
        explicit, inferred,
        explicitMinutes: explicit.reduce((sum, item) => sum + item.minutes, 0),
        inferredMinutes: inferred.reduce((sum, item) => sum + item.estimatedMinutes, 0),
        blockers, notices, readyForCalculation: blockers.length === 0,
    };
}
