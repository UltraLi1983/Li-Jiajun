export function mergeStatusIntervals(rows, status) {
    const merged = [];
    for (const row of rows) {
        const matches = status === "unrecorded" ? row.actualKind === "unrecorded"
            : status === "plannedGap" ? row.plannedKind === "unrecorded"
                : row.status === status;
        if (!matches)
            continue;
        const last = merged[merged.length - 1];
        if (last && last.endMinute === row.startMinute)
            last.endMinute = row.endMinute;
        else
            merged.push({ startMinute: row.startMinute, endMinute: row.endMinute });
    }
    return merged;
}
export function formatCoverageClock(minute) {
    const minuteInDay = ((Math.trunc(minute) % 1440) + 1440) % 1440;
    const hour = Math.floor(minuteInDay / 60);
    const min = minuteInDay % 60;
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
export function formatCoverageSummary(intervals, locale, kind) {
    const details = intervals.map(interval => {
        const minutes = interval.endMinute - interval.startMinute;
        const span = `${formatCoverageClock(interval.startMinute)}–${formatCoverageClock(interval.endMinute)}`;
        if (kind === "unrecorded") {
            return locale === "zh"
                ? `实际未记录：${span}（${minutes} 分钟）`
                : `Actual not recorded: ${span} (${minutes} min)`;
        }
        return locale === "zh"
            ? `计划空档：${span}（${minutes} 分钟）`
            : `Planned gap: ${span} (${minutes} min)`;
    });
    if (details.length <= 1)
        return { summary: details[0] ?? "", details };
    const total = intervals.reduce((sum, interval) => sum + interval.endMinute - interval.startMinute, 0);
    const summary = kind === "unrecorded"
        ? (locale === "zh" ? `实际未记录 ${intervals.length} 段，共 ${total} 分钟` : `Actual not recorded: ${intervals.length} gaps, ${total} min`)
        : (locale === "zh" ? `计划空档 ${intervals.length} 段，共 ${total} 分钟` : `Planned gaps: ${intervals.length}, ${total} min`);
    return { summary, details };
}
const abnormalKinds = new Set([
    "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue",
]);
export function reconcileRnrTimeline(input) {
    const { stationId, startMinute, endMinute } = input;
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
        throw new RangeError("R&R observation window must have a positive duration");
    }
    if (input.offShiftIntervals?.some(interval => !Number.isFinite(interval.startMinute)
        || !Number.isFinite(interval.endMinute) || interval.startMinute < startMinute
        || interval.endMinute > endMinute || interval.endMinute <= interval.startMinute)) {
        throw new RangeError("Off-shift intervals must be inside the R&R observation window");
    }
    const planned = validateTrack(input.planned, stationId, startMinute, endMinute, "planned");
    const actual = validateTrack(input.actual, stationId, startMinute, endMinute, "actual");
    const boundaries = [...new Set([
            startMinute, endMinute,
            ...planned.flatMap(event => [event.startMinute, event.endMinute]),
            ...actual.flatMap(event => [event.startMinute, event.endMinute]),
            ...(input.offShiftIntervals ?? []).flatMap(interval => [interval.startMinute, interval.endMinute]),
        ])].sort((a, b) => a - b);
    const rows = [];
    let plannedProductionMinutes = 0;
    let actualProductionMinutes = 0;
    let explicitAbnormalMinutes = 0;
    let unrecordedMinutes = 0;
    let plannedGapMinutes = 0;
    for (let index = 0; index < boundaries.length - 1; index += 1) {
        const from = boundaries[index];
        const to = boundaries[index + 1];
        const plannedEvent = planned.find(event => event.startMinute <= from && event.endMinute >= to);
        const actualEvent = actual.find(event => event.startMinute <= from && event.endMinute >= to);
        const offShift = input.offShiftIntervals?.some(interval => interval.startMinute <= from && interval.endMinute >= to) ?? false;
        const plannedKind = plannedEvent?.kind ?? (offShift ? "offShift" : "unrecorded");
        const actualKind = actualEvent?.kind ?? (offShift ? "offShift" : "unrecorded");
        const minutes = to - from;
        if (plannedKind === "production")
            plannedProductionMinutes += minutes;
        if (actualKind === "production")
            actualProductionMinutes += minutes;
        if (actualEvent && abnormalKinds.has(actualEvent.kind))
            explicitAbnormalMinutes += minutes;
        if (!actualEvent && !offShift)
            unrecordedMinutes += minutes;
        if (!plannedEvent && !offShift)
            plannedGapMinutes += minutes;
        const status = !plannedEvent && !offShift ? "plannedGap"
            : !actualEvent && !offShift ? "unrecorded"
                : plannedKind === actualKind ? "matched" : "changed";
        rows.push({
            startMinute: from,
            endMinute: to,
            plannedKind,
            actualKind,
            ...(plannedEvent ? { plannedEventId: plannedEvent.id } : {}),
            ...(actualEvent ? { actualEventId: actualEvent.id } : {}),
            status,
        });
    }
    return {
        rows,
        windowMinutes: endMinute - startMinute,
        plannedProductionMinutes,
        actualProductionMinutes,
        explicitAbnormalMinutes,
        unrecordedMinutes,
        plannedGapMinutes,
        complete: unrecordedMinutes === 0 && plannedGapMinutes === 0,
    };
}
function validateTrack(events, stationId, startMinute, endMinute, track) {
    const ordered = [...events].sort((a, b) => a.startMinute - b.startMinute || a.endMinute - b.endMinute);
    for (let index = 0; index < ordered.length; index += 1) {
        const event = ordered[index];
        if (event.stationId !== stationId)
            throw new RangeError(`${track} event ${event.id} belongs to another station`);
        if (!Number.isFinite(event.startMinute) || !Number.isFinite(event.endMinute)
            || event.endMinute <= event.startMinute || event.startMinute < startMinute || event.endMinute > endMinute) {
            throw new RangeError(`${track} event ${event.id} is outside the observation window or has invalid time`);
        }
        if (index > 0 && ordered[index - 1].endMinute > event.startMinute) {
            throw new RangeError(`${track} events overlap at ${event.id}`);
        }
    }
    return ordered;
}
