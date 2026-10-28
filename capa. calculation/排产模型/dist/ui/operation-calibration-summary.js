export function summarizeOperationCycleChecks(stations) {
    const covered = stations.filter(station => station.plannedCycleSec !== undefined
        && Number.isFinite(station.plannedCycleSec) && station.plannedCycleSec > 0 && station.validSeconds.length > 0);
    const validCount = covered.reduce((sum, station) => sum + station.validSeconds.length, 0);
    const complete = stations.length > 0 && covered.length === stations.length;
    const plannedMeanSec = complete
        ? covered.reduce((sum, station) => sum + station.plannedCycleSec * station.validSeconds.length, 0) / validCount
        : undefined;
    const observedMeanSec = complete
        ? covered.reduce((sum, station) => sum + station.validSeconds.reduce((total, seconds) => total + seconds, 0), 0) / validCount
        : undefined;
    return {
        ...(plannedMeanSec === undefined ? {} : { plannedMeanSec }),
        ...(observedMeanSec === undefined ? {} : { observedMeanSec, deltaSec: observedMeanSec - plannedMeanSec }),
        stationCount: stations.length,
        coveredStationCount: covered.length,
        recordedCount: stations.reduce((sum, station) => sum + station.recordedCount, 0),
        validCount: stations.reduce((sum, station) => sum + station.validSeconds.length, 0),
        excludedCount: stations.reduce((sum, station) => sum + station.excludedCount, 0),
    };
}
export function summarizeOperationRequiredShare(stations) {
    if (!stations.length || stations.some(station => !Number.isFinite(station.allocationWeight)
        || station.allocationWeight <= 0 || station.availableMinutes === undefined
        || !Number.isFinite(station.availableMinutes) || station.availableMinutes <= 0
        || station.requiredShare === undefined || !Number.isFinite(station.requiredShare)
        || station.requiredShare < 0))
        return undefined;
    if (stations.every(station => station.requiredShare === 0))
        return 0;
    if (stations.some(station => station.requiredShare === 0))
        return undefined;
    // Each station share is the full demand divided by that station's weekly capacity.
    return 1 / stations.reduce((capacity, station) => capacity + station.allocationWeight / station.requiredShare, 0);
}
