import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";
export function buildRnrBestActualPreview(input) {
    if (!input.planned.length || !Number.isFinite(input.standardCycleSec) || input.standardCycleSec <= 0
        || !Number.isFinite(input.piecesPerCycle) || input.piecesPerCycle <= 0) {
        throw new RangeError("A planned window, positive standard CT and pieces per cycle are required");
    }
    const inferredSaLossMinutes = input.inferredSaLossMinutes ?? 0;
    if (!Number.isFinite(inferredSaLossMinutes) || inferredSaLossMinutes < 0) {
        throw new RangeError("Inferred SA loss must be nonnegative");
    }
    const startMinute = input.windowStartMinute ?? Math.min(...input.planned.map(event => event.startMinute));
    const endMinute = input.windowEndMinute ?? Math.max(...input.planned.map(event => event.endMinute));
    const timeline = reconcileRnrTimeline({
        stationId: input.stationId, startMinute, endMinute,
        planned: input.planned, actual: input.actual,
        ...(input.offShiftIntervals ? { offShiftIntervals: input.offShiftIntervals } : {}),
    });
    const production = input.actual.filter(event => event.kind === "production");
    if (production.some(event => !Number.isInteger(event.okQty) || !Number.isInteger(event.nokQty)
        || (event.okQty ?? -1) < 0 || (event.nokQty ?? -1) < 0)) {
        throw new RangeError("Every actual production interval needs nonnegative OK and NOK counts");
    }
    const unitsPerMinute = 60 * input.piecesPerCycle / input.standardCycleSec;
    if (inferredSaLossMinutes > timeline.actualProductionMinutes) {
        throw new RangeError("Inferred SA loss exceeds actual production time");
    }
    const plannedQualityRate = input.plannedQualityRate ?? 1;
    const publishedPerformanceRate = input.publishedPerformanceRate ?? 1;
    const acceptedUnplannedMinutes = input.acceptedUnplannedMinutes ?? 0;
    if (!Number.isFinite(plannedQualityRate) || plannedQualityRate <= 0 || plannedQualityRate > 1
        || !Number.isFinite(publishedPerformanceRate) || publishedPerformanceRate <= 0 || publishedPerformanceRate > 1) {
        throw new RangeError("Published P and Q must be greater than 0 and at most 100%");
    }
    if (!Number.isFinite(acceptedUnplannedMinutes) || acceptedUnplannedMinutes < 0) {
        throw new RangeError("Accepted unplanned minutes must be nonnegative");
    }
    const bestCaseIdealUnits = timeline.plannedProductionMinutes * unitsPerMinute;
    const bestCaseOkUnits = bestCaseIdealUnits;
    const bestCaseNokUnits = 0;
    const actualIdealUnits = timeline.actualProductionMinutes * unitsPerMinute;
    const actualGrossUnits = production.reduce((sum, event) => sum + (event.okQty ?? 0) + (event.nokQty ?? 0), 0);
    const actualGoodUnits = production.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
    const actualCycleSec = actualGrossUnits > 0
        ? timeline.actualProductionMinutes * 60 * input.piecesPerCycle / actualGrossUnits
        : undefined;
    const actualQualityRate = actualGrossUnits > 0 ? actualGoodUnits / actualGrossUnits : undefined;
    const actualPerformanceRate = actualCycleSec !== undefined && actualCycleSec > 0
        ? Math.min(1, input.standardCycleSec / actualCycleSec) : undefined;
    const mostLikelyProductionMinutes = Math.max(0, timeline.plannedProductionMinutes - acceptedUnplannedMinutes);
    const mostLikelyGoodUnits = mostLikelyProductionMinutes * unitsPerMinute * publishedPerformanceRate * plannedQualityRate;
    return {
        complete: timeline.complete,
        windowMinutes: timeline.windowMinutes,
        plannedProductionMinutes: timeline.plannedProductionMinutes,
        actualProductionMinutes: timeline.actualProductionMinutes,
        plannedSa: timeline.plannedProductionMinutes / timeline.windowMinutes,
        actualSa: (timeline.actualProductionMinutes - inferredSaLossMinutes) / timeline.windowMinutes,
        actualRecordedSa: timeline.actualProductionMinutes / timeline.windowMinutes,
        standardCycleSec: input.standardCycleSec,
        bestCaseIdealUnits,
        plannedQualityRate,
        bestCaseOkUnits,
        bestCaseNokUnits,
        actualIdealUnits,
        actualGrossUnits,
        actualGoodUnits,
        ...(actualCycleSec === undefined ? {} : { actualCycleSec }),
        ...(actualQualityRate === undefined ? {} : { actualQualityRate }),
        ...(actualPerformanceRate === undefined ? {} : { actualPerformanceRate }),
        acceptedUnplannedMinutes,
        mostLikelyProductionMinutes,
        mostLikelySa: mostLikelyProductionMinutes / timeline.windowMinutes,
        publishedPerformanceRate,
        mostLikelyGoodUnits,
        timeGapUnits: bestCaseIdealUnits - actualIdealUnits + inferredSaLossMinutes * unitsPerMinute,
        recordedTimeGapUnits: bestCaseIdealUnits - actualIdealUnits,
        inferredSaGapUnits: inferredSaLossMinutes * unitsPerMinute,
        paceGapUnits: actualIdealUnits - actualGrossUnits - inferredSaLossMinutes * unitsPerMinute,
        qualityGapUnits: actualGrossUnits - actualGoodUnits,
        totalGapUnits: bestCaseIdealUnits - actualGoodUnits,
        unrecordedMinutes: timeline.unrecordedMinutes,
    };
}
