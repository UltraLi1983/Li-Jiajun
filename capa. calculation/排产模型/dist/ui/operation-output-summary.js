export const OPERATION_OUTPUT_FIELDS = [
    "bestCaseIdealUnits", "actualGrossUnits", "bestCaseOkUnits", "actualGoodUnits",
    "bestCaseNokUnits", "qualityGapUnits", "totalGapUnits", "timeGapUnits",
    "inferredSaGapUnits", "paceGapUnits", "mostLikelyGoodUnits",
];
export function summarizeOperationOutput(stations) {
    const first = stations[0];
    if (!first || stations.some(item => !item.preview?.complete
        || item.windowStartMinute !== first.windowStartMinute
        || item.windowEndMinute !== first.windowEndMinute))
        return undefined;
    return Object.fromEntries(OPERATION_OUTPUT_FIELDS.map(field => [field,
        stations.reduce((sum, item) => sum + item.preview[field], 0),
    ]));
}
