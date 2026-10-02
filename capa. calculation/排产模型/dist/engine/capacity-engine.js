import { aggregateStationCalendars } from "./calendar-sa.js";
import { calculateRequiredMinutesByStation } from "./required-minutes.js";
export function calculateCapacityScenario(scenario) {
    const stationIds = [...new Set(scenario.calendars.map(calendar => calendar.stationId))];
    const requiredByStation = calculateRequiredMinutesByStation(scenario.orders, scenario.routes, scenario.runRateObservations ?? [], scenario.mode === "runRate");
    return stationIds.map(stationId => {
        const calendars = scenario.calendars.filter(calendar => calendar.stationId === stationId);
        const aggregate = aggregateStationCalendars(calendars);
        const requiredMinutes = requiredByStation.get(stationId) ?? 0;
        const bufferedRequiredMinutes = requiredMinutes * (1 + scenario.capacityBufferRate);
        const activeAvailable = scenario.mode === "runRate"
            ? aggregate.realAvailableMinutes
            : aggregate.plannedAvailableMinutes;
        const gapMinutes = activeAvailable - bufferedRequiredMinutes;
        const status = gapMinutes >= 0 ? "ok" : "short";
        return {
            stationId,
            scheduledMinutes: aggregate.scheduledMinutes,
            plannedSA: aggregate.plannedSA,
            realSA: aggregate.realSA,
            plannedAvailableMinutes: aggregate.plannedAvailableMinutes,
            runRateAvailableMinutes: aggregate.realAvailableMinutes,
            requiredMinutes,
            bufferedRequiredMinutes,
            gapMinutes,
            status,
            riskFlags: buildRiskFlags(aggregate.realSA, aggregate.plannedSA, gapMinutes),
        };
    }).sort((a, b) => a.gapMinutes - b.gapMinutes);
}
function buildRiskFlags(realSA, plannedSA, gapMinutes) {
    const flags = [];
    if (gapMinutes < 0)
        flags.push("capacity_shortage");
    if (plannedSA - realSA > 0.05)
        flags.push("observed_loss_above_plan");
    return flags;
}
