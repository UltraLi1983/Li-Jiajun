export const RNR_VALIDATION_FIXTURE_ID = "rnr-validation-op10-24h-v1";
export const RNR_VALIDATION_ANCHOR_MINUTE = 480;
export const RNR_VALIDATION_WINDOW_MINUTES = 1440;
export function placeFixtureActualsOnWindow(events, windowStartMinute) {
    if (!Number.isFinite(windowStartMinute))
        throw new RangeError("Validation sample window start is invalid");
    const delta = windowStartMinute - RNR_VALIDATION_ANCHOR_MINUTE;
    return events.map(event => ({
        ...event,
        startMinute: event.startMinute + delta,
        endMinute: event.endMinute + delta,
    }));
}
// A relative 24-hour observation window; the UI anchors minute zero to today's date.
export function createRnrValidationFixture(productId, stationId, standardCycleSec = 24, piecesPerCycle = 1) {
    if (!Number.isFinite(standardCycleSec) || standardCycleSec <= 0
        || !Number.isSafeInteger(piecesPerCycle) || piecesPerCycle <= 0) {
        throw new RangeError("Validation fixture requires a positive CT and whole pieces per cycle");
    }
    const outputScale = 24 / standardCycleSec * piecesPerCycle;
    const fixturePrefix = stationId === "OP10" ? "validation" : `validation-${stationId.toLowerCase()}`;
    const planned = [
        ["production", 480, 660], ["break", 660, 690], ["production", 690, 1020],
        ["break", 1020, 1050], ["production", 1050, 1140], ["setup", 1140, 1200],
        ["production", 1200, 1500], ["break", 1500, 1530], ["production", 1530, 1920],
    ];
    const actual = [
        ["production", 480, 660, 446, 4], ["break", 660, 700, 0, 0],
        ["production", 700, 1020, 792, 8], ["break", 1020, 1050, 0, 0],
        ["production", 1050, 1140, 223, 2], ["setup", 1140, 1220, 0, 0],
        ["production", 1220, 1320, 237, 3], ["equipmentFailure", 1320, 1350, 0, 0],
        ["production", 1350, 1500, 371, 4], ["break", 1500, 1530, 0, 0],
        ["production", 1530, 1920, 966, 9],
    ];
    return {
        id: stationId === "OP10" && standardCycleSec === 24 && piecesPerCycle === 1
            ? RNR_VALIDATION_FIXTURE_ID
            : `rnr-validation-${stationId.toLowerCase()}-ct${standardCycleSec}-p${piecesPerCycle}-24h-v1`,
        planned: planned.map(([kind, startMinute, endMinute], index) => ({
            id: `${fixturePrefix}-plan-${index + 1}`, productId, stationId, kind,
            startMinute, endMinute, source: "template", label: `Validation ${kind}`,
        })),
        actual: actual.map(([kind, startMinute, endMinute, okQty, nokQty], index) => ({
            id: `${fixturePrefix}-actual-${index + 1}`, productId, stationId, kind,
            startMinute, endMinute, source: "runRate", label: `Validation ${kind}`,
            ...(kind === "production" ? (() => {
                const total = Math.floor((okQty + nokQty) * outputScale);
                const rejects = Math.min(total, Math.round(nokQty * outputScale));
                return { okQty: total - rejects, nokQty: rejects, piecesPerCycle };
            })() : {}),
            ...(kind === "equipmentFailure" ? { evidenceSource: "Validation fixture: equipment alarm", isEstimated: false } : {}),
        })),
        cycleSamplesSec: Array(20).fill(standardCycleSec),
        standardCycleSec,
        piecesPerCycle,
    };
}
