const plannedLossKinds = new Set(["setup", "break", "maintenance", "plannedStop"]);
const realOnlyLossKinds = new Set([
    "equipmentFailure",
    "toolingIssue",
    "logisticsWaiting",
    "qualityHold",
    "laborIssue",
]);
export function sumEventMinutes(events, kinds) {
    return events.reduce((sum, event) => sum + (kinds.has(event.kind) ? event.minutes : 0), 0);
}
export function calculatePlannedSA(calendar) {
    if (calendar.scheduledMinutes <= 0)
        return 0;
    const plannedLoss = sumEventMinutes(calendar.events, plannedLossKinds);
    return clampRate((calendar.scheduledMinutes - plannedLoss) / calendar.scheduledMinutes);
}
export function calculateRealSA(calendar) {
    if (calendar.scheduledMinutes <= 0)
        return 0;
    const plannedLoss = sumEventMinutes(calendar.events, plannedLossKinds);
    const realOnlyLoss = sumEventMinutes(calendar.events, realOnlyLossKinds);
    return clampRate((calendar.scheduledMinutes - plannedLoss - realOnlyLoss) / calendar.scheduledMinutes);
}
export function aggregateStationCalendars(calendars) {
    const scheduledMinutes = calendars.reduce((sum, day) => sum + day.scheduledMinutes, 0);
    const plannedAvailableMinutes = calendars.reduce((sum, day) => sum + day.scheduledMinutes * calculatePlannedSA(day) * day.projectShare, 0);
    const realAvailableMinutes = calendars.reduce((sum, day) => sum + day.scheduledMinutes * calculateRealSA(day) * day.projectShare, 0);
    return {
        scheduledMinutes,
        plannedAvailableMinutes,
        realAvailableMinutes,
        plannedSA: scheduledMinutes > 0 ? plannedAvailableMinutes / scheduledMinutes : 0,
        realSA: scheduledMinutes > 0 ? realAvailableMinutes / scheduledMinutes : 0,
    };
}
function clampRate(value) {
    return Math.max(0, Math.min(1, value));
}
