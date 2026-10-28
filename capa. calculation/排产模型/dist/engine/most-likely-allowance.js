import { summarizeLedger } from "./week-minute-ledger.js";
const ABNORMAL_KINDS = new Set(["equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue"]);
export const PLANNED_LOSS_KINDS = ["break", "setup", "maintenance", "plannedStop"];
export function lossPlanSignature(planned) {
    return JSON.stringify(planned.map(item => [item.kind, item.startMinute, item.endMinute]));
}
export function plannedActionShortfalls(planned, actual) {
    return PLANNED_LOSS_KINDS.flatMap(kind => {
        const plannedMinutes = planned.filter(event => event.kind === kind)
            .reduce((sum, event) => sum + Math.max(0, event.endMinute - event.startMinute), 0);
        const actualMinutes = actual.filter(event => event.kind === kind)
            .reduce((sum, event) => sum + Math.max(0, event.endMinute - event.startMinute), 0);
        return plannedMinutes > actualMinutes
            ? [{ kind, plannedMinutes, actualMinutes, savedMinutes: plannedMinutes - actualMinutes }] : [];
    });
}
// The signature covers both calendars, so edits or deletion revoke an earlier review.
export function plannedTimingShifts(planned, actual) {
    const merge = (events) => {
        const merged = [];
        for (const event of [...events].sort((a, b) => a.startMinute - b.startMinute)) {
            if (event.endMinute <= event.startMinute)
                continue;
            const last = merged.at(-1);
            if (last && event.startMinute <= last.endMinute)
                last.endMinute = Math.max(last.endMinute, event.endMinute);
            else
                merged.push({ startMinute: event.startMinute, endMinute: event.endMinute });
        }
        return merged;
    };
    return PLANNED_LOSS_KINDS.flatMap(kind => {
        const plannedKind = merge(planned.filter(event => event.kind === kind));
        const actualEvents = actual.filter(event => event.kind === kind);
        const actualKind = merge(actualEvents);
        const plannedMinutes = plannedKind.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
        const actualMinutes = actualKind.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
        if (!plannedMinutes || plannedMinutes !== actualMinutes)
            return [];
        const shared = actualKind.reduce((sum, event) => sum + plannedKind.reduce((part, interval) => part + overlapMinutes(event, interval), 0), 0);
        const displacedMinutes = actualMinutes - shared;
        if (!displacedMinutes)
            return [];
        const signature = JSON.stringify({ kind, planned: plannedKind, actual: actualKind });
        return [{ kind, minutes: plannedMinutes, displacedMinutes, signature,
                confirmed: actualEvents.every(event => event.timingShiftConfirmed === true && event.timingShiftSignature === signature) }];
    });
}
export function observeShiftAllowance(input) {
    const actual = input.actual.filter(event => event.stationId === input.stationId && event.endMinute > event.startMinute);
    const observed = input.shifts.flatMap((shift, index) => actual.some(event => overlaps(event, shift)) ? [{ shift, number: index + 1 }] : []);
    if (!observed.length)
        return undefined;
    const planned = input.planned ?? [];
    const planSignature = lossPlanSignature(planned);
    const production = planned.filter(event => event.kind === "production");
    const sourceProductionMinutes = production.reduce((sum, event) => sum + observed.reduce((shiftSum, item) => shiftSum + overlapMinutes(event, item.shift), 0), 0);
    let pendingLossMinutes = 0;
    const sources = actual.flatMap(event => {
        if (!ABNORMAL_KINDS.has(event.kind))
            return [];
        const shiftNumbers = observed.flatMap(item => overlaps(event, item.shift) ? [item.number] : []);
        const minutes = production.length
            ? production.reduce((sum, interval) => sum + overlapMinutes(event, interval), 0)
            : observed.reduce((sum, item) => sum + overlapMinutes(event, item.shift), 0);
        if (!shiftNumbers.length || minutes <= 0)
            return [];
        if (event.mlLossConfirmed !== true || event.mlLossPlanSignature !== planSignature) {
            pendingLossMinutes += minutes;
            return [];
        }
        const recoverableMinutes = event.recoverableConfirmed === true
            ? Math.min(minutes, Math.max(0, event.recoverableMinutes ?? 0)) : 0;
        return [{
                category: event.kind,
                stationId: input.stationId,
                shiftNumbers,
                minutes,
                recoverableMinutes,
                planningMinutes: minutes - recoverableMinutes,
                source: event.evidenceSource?.trim() || "",
                estimated: Boolean(event.isEstimated),
            }];
    });
    let plannedOverrunMinutes = 0;
    for (const kind of PLANNED_LOSS_KINDS) {
        const plannedKind = planned.filter(event => event.kind === kind);
        const actualKind = actual.filter(event => event.kind === kind);
        const plannedMinutes = plannedKind.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
        const actualMinutes = actualKind.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
        const intrusion = actualKind.reduce((sum, event) => sum + production.reduce((part, interval) => part + overlapMinutes(event, interval), 0), 0);
        const overrun = Math.min(Math.max(0, actualMinutes - plannedMinutes), intrusion);
        if (overrun <= 0)
            continue;
        if (actualKind.every(event => event.mlLossConfirmed === true && event.mlLossPlanSignature === planSignature)) {
            plannedOverrunMinutes += overrun;
            sources.push({ category: `${kind}Overrun`, stationId: input.stationId,
                shiftNumbers: observed.flatMap(item => actualKind.some(event => overlaps(event, item.shift)) ? [item.number] : []),
                minutes: overrun, recoverableMinutes: 0, planningMinutes: overrun,
                source: actualKind.map(event => event.evidenceSource?.trim()).filter(Boolean).join("; "),
                estimated: actualKind.some(event => Boolean(event.isEstimated)) });
        }
        else
            pendingLossMinutes += overrun;
    }
    const observedUnplannedMinutes = sources.reduce((sum, source) => sum + source.minutes, 0);
    const recoverableMinutes = sources.reduce((sum, source) => sum + source.recoverableMinutes, 0);
    const planningUnplannedMinutes = observedUnplannedMinutes - recoverableMinutes;
    return {
        // Stable days keep the existing confirmed-abnormal allowance. Projecting an
        // overrun when the stable-day plan has no corresponding action needs a rule.
        perShiftMinutes: (planningUnplannedMinutes - plannedOverrunMinutes) / observed.length,
        observedUnplannedMinutes,
        recoverableMinutes,
        planningUnplannedMinutes,
        observedShiftCount: observed.length,
        sourceProductionMinutes,
        plannedOverrunMinutes,
        projectedLossRate: sourceProductionMinutes > 0 ? Math.min(1, planningUnplannedMinutes / sourceProductionMinutes) : 0,
        pendingLossMinutes,
        sources,
    };
}
export function projectedMostLikelyMinutes(day, shiftCount, allowance) {
    if (!day.workingDay || day.stale)
        return 0;
    if (!allowance)
        return day.productionMinutes;
    const stableActionMinutes = {
        breakOverrun: day.breakMinutes,
        setupOverrun: day.setupMinutes,
        maintenanceOverrun: day.maintenanceMinutes,
        plannedStopOverrun: day.plannedStopMinutes,
    };
    const eligibleLoss = day.origin === "manualMinutes"
        ? allowance.sources.reduce((sum, source) => sum +
            (source.category.endsWith("Overrun") && !((stableActionMinutes[source.category] ?? 0) > 0) ? 0 : source.planningMinutes), 0)
        : allowance.planningUnplannedMinutes;
    const loss = allowance.sourceProductionMinutes > 0
        ? day.productionMinutes * Math.min(1, eligibleLoss / allowance.sourceProductionMinutes)
        : allowance.perShiftMinutes * Math.max(0, shiftCount);
    return Math.max(0, day.productionMinutes - loss);
}
export function ledgerShiftCount(day, manualShifts, sourceShifts) {
    if (!day.workingDay || day.stale || day.mode === "occupied")
        return 0;
    if (day.origin === "manualMinutes")
        return manualShifts;
    if (day.origin === "sourceCopy")
        return sourceShifts;
    return 0;
}
export function summarizeMostLikely(days, shiftCounts, perShiftMinutes, weekCount) {
    const adjusted = days.map((day, index) => {
        const production = typeof perShiftMinutes === "number"
            ? day.workingDay && !day.stale ? Math.max(0, day.productionMinutes - Math.max(0, perShiftMinutes) * Math.max(0, shiftCounts[index] ?? 0)) : day.productionMinutes
            : projectedMostLikelyMinutes(day, shiftCounts[index] ?? 0, perShiftMinutes);
        return { ...day, productionMinutes: production, bestCaseAvailableMinutes: production };
    });
    return summarizeLedger(adjusted, weekCount);
}
export function mostLikelyMonthProduction(weekProduction, weekCount, setupAllowanceMinutes) {
    return Math.max(0, weekProduction * weekCount - Math.max(0, setupAllowanceMinutes));
}
function overlaps(event, shift) {
    return event.endMinute > shift.startMinute && event.startMinute < shift.endMinute;
}
function overlapMinutes(event, shift) {
    return Math.max(0, Math.min(event.endMinute, shift.endMinute) - Math.max(event.startMinute, shift.startMinute));
}
