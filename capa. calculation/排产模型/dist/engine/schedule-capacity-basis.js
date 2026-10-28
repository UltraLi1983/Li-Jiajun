import { selectEffectiveParameter } from "./parameter-versioning.js";
import { buildFutureScheduleTimeline } from "./future-schedule-timeline.js";
import { floorGoodPieces, goodPieces, theoreticalPieces } from "./week-month-capacity.js";
function scheduleDateAt(windowStartAt, minute) {
    const offset = windowStartAt.match(/([+-])(\d{2}):(\d{2})$/);
    const offsetMinutes = offset ? (offset[1] === "+" ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3])) : 0;
    return new Date(Date.parse(windowStartAt) + (minute + offsetMinutes) * 60_000).toISOString().slice(0, 10);
}
export function buildScheduleCapacityBases(input) {
    const timeline = buildFutureScheduleTimeline(input.schedule);
    if (timeline.status === "conflict")
        return { bases: [], issues: timeline.issues };
    const weekStart = Date.parse(`${input.weekStartDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.weekStartDate) || !Number.isFinite(weekStart)
        || new Date(weekStart).toISOString().slice(0, 10) !== input.weekStartDate || new Date(weekStart).getUTCDay() !== 1) {
        return { bases: [], issues: ["valid Monday week start is required"] };
    }
    const weekEndDate = new Date(weekStart + 6 * 86_400_000).toISOString().slice(0, 10);
    if (input.unplannedMinutesPerShift === undefined || !Number.isFinite(input.unplannedMinutesPerShift)
        || input.unplannedMinutesPerShift < 0) {
        return { bases: [], issues: ["same-week unplanned allowance is missing"] };
    }
    const issues = [];
    const productionByTask = new Map(input.schedule.tasks.map(task => [task.id, 0]));
    const reservedByTask = new Map(input.schedule.tasks.map(task => [task.id, 0]));
    for (const shift of input.schedule.shifts) {
        const production = timeline.segments.filter(segment => segment.kind === "production" && segment.sourceId
            && segment.startMinute < shift.endMinute && segment.endMinute > shift.startMinute);
        const shiftMinutes = production.reduce((sum, segment) => sum + Math.min(segment.endMinute, shift.endMinute)
            - Math.max(segment.startMinute, shift.startMinute), 0);
        const reserve = Math.min(shiftMinutes, input.unplannedMinutesPerShift);
        for (const segment of production) {
            const minutes = Math.min(segment.endMinute, shift.endMinute) - Math.max(segment.startMinute, shift.startMinute);
            const taskId = segment.sourceId;
            productionByTask.set(taskId, (productionByTask.get(taskId) ?? 0) + minutes);
            reservedByTask.set(taskId, (reservedByTask.get(taskId) ?? 0) + (shiftMinutes ? reserve * minutes / shiftMinutes : 0));
        }
    }
    const bases = input.schedule.tasks.flatMap(task => {
        const startDate = scheduleDateAt(input.schedule.windowStartAt, task.startMinute);
        const endDate = scheduleDateAt(input.schedule.windowStartAt, task.endMinute - 1 / 60_000);
        if (startDate < input.weekStartDate || endDate > weekEndDate) {
            issues.push(`${task.id}: task crosses the capacity ledger week`);
            return [];
        }
        const startParameter = selectEffectiveParameter(input.parameters, input.operationId, input.schedule.stationId, startDate);
        const endParameter = selectEffectiveParameter(input.parameters, input.operationId, input.schedule.stationId, endDate);
        if (!startParameter || !endParameter || startParameter.parameterId !== endParameter.parameterId) {
            issues.push(`${task.id}: effective parameter missing or changes within task`);
            return [];
        }
        const parameter = startParameter;
        if (!parameter.parameterId || !Number.isFinite(parameter.standardCycleSec) || parameter.standardCycleSec <= 0
            || !Number.isSafeInteger(parameter.piecesPerCycle) || parameter.piecesPerCycle <= 0
            || !Number.isFinite(parameter.performanceRate) || parameter.performanceRate <= 0 || parameter.performanceRate > 1
            || !Number.isFinite(parameter.qualityRate) || parameter.qualityRate <= 0 || parameter.qualityRate > 1) {
            issues.push(`${task.id}: effective CT/P/Q is invalid`);
            return [];
        }
        const bestMinutes = productionByTask.get(task.id) ?? 0;
        const mostLikelyMinutes = Math.max(0, bestMinutes - (reservedByTask.get(task.id) ?? 0));
        return [{ taskId: task.id, stationId: input.schedule.stationId, productId: task.productId,
                startMinute: task.startMinute, endMinute: task.endMinute, parameterVersion: parameter.parameterId,
                bestCasePieces: floorGoodPieces(theoreticalPieces(bestMinutes, parameter)),
                mostLikelyPieces: floorGoodPieces(goodPieces(mostLikelyMinutes, parameter)) }];
    });
    return { bases, issues };
}
