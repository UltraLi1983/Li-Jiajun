import { validateTimelineEvents } from "./timeline-engine.js";
const DAY_MINUTES = 1440;
export function buildStandardSaSampleSlots(config) {
    const shifts = standardSaShiftIntervals(config);
    return shifts.flatMap((shift, index) => {
        const losses = [
            { kind: "break", startMinute: shift.startMinute + 150, endMinute: shift.startMinute + 180 },
        ];
        if (config.shiftMinutes === 720) {
            losses.push({ kind: "break", startMinute: shift.startMinute + 510, endMinute: shift.startMinute + 540 });
        }
        if (index === config.shiftsPerDay - 1) {
            losses.push({ kind: "setup", startMinute: shift.endMinute - 90, endMinute: shift.endMinute });
        }
        const slots = [];
        let cursor = shift.startMinute;
        for (const loss of losses.sort((a, b) => a.startMinute - b.startMinute)) {
            if (cursor < loss.startMinute)
                slots.push({ kind: "production", startMinute: cursor, endMinute: loss.startMinute });
            slots.push(loss);
            cursor = loss.endMinute;
        }
        if (cursor < shift.endMinute)
            slots.push({ kind: "production", startMinute: cursor, endMinute: shift.endMinute });
        return slots;
    });
}
export function findStandardSaDayGaps(events, config) {
    const gaps = [];
    for (const shift of standardSaShiftIntervals(config)) {
        let cursor = shift.startMinute;
        const shiftEvents = events.filter(event => event.startMinute < shift.endMinute && event.endMinute > shift.startMinute)
            .sort((a, b) => a.startMinute - b.startMinute);
        for (const event of shiftEvents) {
            if (event.startMinute > cursor)
                gaps.push({ startMinute: cursor, endMinute: event.startMinute });
            cursor = Math.max(cursor, event.endMinute);
        }
        if (cursor < shift.endMinute)
            gaps.push({ startMinute: cursor, endMinute: shift.endMinute });
    }
    return gaps;
}
export function standardSaShiftIntervals(config) {
    if (!Number.isInteger(config.startMinute) || config.startMinute < 0
        || ![1, 2].includes(config.dayCount) || ![480, 720].includes(config.shiftMinutes)
        || !Number.isInteger(config.shiftsPerDay) || config.shiftsPerDay < 1
        || config.shiftsPerDay * config.shiftMinutes > DAY_MINUTES)
        return [];
    return Array.from({ length: config.dayCount * config.shiftsPerDay }, (_, index) => {
        const day = Math.floor(index / config.shiftsPerDay);
        const shift = index % config.shiftsPerDay;
        const startMinute = config.startMinute + day * DAY_MINUTES + shift * config.shiftMinutes;
        return { startMinute, endMinute: startMinute + config.shiftMinutes };
    });
}
export function standardSaOffShiftIntervals(config) {
    const shifts = standardSaShiftIntervals(config);
    if (!shifts.length)
        return [];
    const off = [];
    let cursor = config.startMinute;
    for (const shift of shifts) {
        if (shift.startMinute > cursor)
            off.push({ startMinute: cursor, endMinute: shift.startMinute });
        cursor = shift.endMinute;
    }
    const endMinute = config.startMinute + config.dayCount * DAY_MINUTES;
    if (cursor < endMinute)
        off.push({ startMinute: cursor, endMinute });
    return off;
}
export function reconcileAutoFilledGaps(events, config) {
    const shifts = standardSaShiftIntervals(config);
    if (!shifts.length)
        return events;
    return events.flatMap(event => {
        const legacyAutoGap = event.autoFilled !== false && event.kind === "unscheduled"
            && event.source === "manual" && event.label === "未排产"
            && /^planned-unscheduled-\d{13}-\d+$/.test(event.id);
        if (event.kind !== "unscheduled" || (event.autoFilled !== true && !legacyAutoGap))
            return [event];
        return shifts.flatMap((shift, index) => {
            const startMinute = Math.max(event.startMinute, shift.startMinute);
            const endMinute = Math.min(event.endMinute, shift.endMinute);
            if (startMinute >= endMinute)
                return [];
            if (startMinute === event.startMinute && endMinute === event.endMinute)
                return [event];
            return [{ ...event, id: `${event.id}-shift-${index}`, startMinute, endMinute, autoFilled: true }];
        });
    });
}
export function validateStandardSaDay(events, config) {
    const shifts = standardSaShiftIntervals(config);
    if (!shifts.length)
        return ["invalid_config"];
    const issues = [];
    const normalized = events.map(event => ({
        ...event, startMinute: event.startMinute - config.startMinute, endMinute: event.endMinute - config.startMinute,
    }));
    for (const issue of validateTimelineEvents(normalized, config.dayCount * DAY_MINUTES)) {
        if (issue.code === "invalid_boundary" && !issues.includes("invalid_boundary"))
            issues.push("invalid_boundary");
        if (issue.code === "overlap" && !issues.includes("overlap"))
            issues.push("overlap");
        if (issue.code === "outside_horizon" && !issues.includes("outside_shift"))
            issues.push("outside_shift");
    }
    for (const event of events) {
        let coveredUntil = event.startMinute;
        for (const shift of shifts) {
            if (shift.startMinute > coveredUntil)
                break;
            if (shift.endMinute > coveredUntil)
                coveredUntil = shift.endMinute;
            if (coveredUntil >= event.endMinute)
                break;
        }
        if (coveredUntil < event.endMinute && !issues.includes("outside_shift"))
            issues.push("outside_shift");
    }
    if (findStandardSaDayGaps(events, config).length)
        issues.push("gap");
    return issues;
}
export function summarizeStandardSaDay(events, config) {
    const shifts = standardSaShiftIntervals(config);
    if (!shifts.length)
        throw new RangeError("Invalid standard SA day configuration");
    const horizonMinutes = config.dayCount * DAY_MINUTES;
    const scheduledMinutes = shifts.length * config.shiftMinutes;
    const total = (kind) => events.filter(event => event.kind === kind)
        .reduce((sum, event) => sum + Math.max(0, event.endMinute - event.startMinute), 0);
    const productionMinutes = total("production");
    const breakMinutes = total("break");
    const denominatorWithoutBreaks = scheduledMinutes - breakMinutes;
    return {
        horizonMinutes,
        scheduledMinutes,
        nonScheduledMinutes: horizonMinutes - scheduledMinutes,
        productionMinutes,
        setupMinutes: total("setup"),
        breakMinutes,
        plannedStopMinutes: total("maintenance") + total("plannedStop"),
        unscheduledMinutes: total("unscheduled"),
        bestCaseAvailableMinutes: productionMinutes,
        bestCaseSaWithBreaks: productionMinutes / horizonMinutes,
        bestCaseSaWithoutBreaks: denominatorWithoutBreaks > 0 ? productionMinutes / denominatorWithoutBreaks : 0,
    };
}
