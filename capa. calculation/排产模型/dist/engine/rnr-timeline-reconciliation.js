const abnormalKinds = new Set([
    "equipmentFailure", "toolingIssue", "logisticsWaiting", "qualityHold", "laborIssue",
]);
export function reconcileRnrTimeline(input) {
    const { stationId, startMinute, endMinute } = input;
    if (!Number.isFinite(startMinute) || !Number.isFinite(endMinute) || endMinute <= startMinute) {
        throw new RangeError("R&R observation window must have a positive duration");
    }
    const planned = validateTrack(input.planned, stationId, startMinute, endMinute, "planned");
    const actual = validateTrack(input.actual, stationId, startMinute, endMinute, "actual");
    const boundaries = [...new Set([
            startMinute, endMinute,
            ...planned.flatMap(event => [event.startMinute, event.endMinute]),
            ...actual.flatMap(event => [event.startMinute, event.endMinute]),
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
        const plannedKind = plannedEvent?.kind ?? "unrecorded";
        const actualKind = actualEvent?.kind ?? "unrecorded";
        const minutes = to - from;
        if (plannedKind === "production")
            plannedProductionMinutes += minutes;
        if (actualKind === "production")
            actualProductionMinutes += minutes;
        if (actualEvent && abnormalKinds.has(actualEvent.kind))
            explicitAbnormalMinutes += minutes;
        if (!actualEvent)
            unrecordedMinutes += minutes;
        if (!plannedEvent)
            plannedGapMinutes += minutes;
        const status = !plannedEvent ? "plannedGap"
            : !actualEvent ? "unrecorded"
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
