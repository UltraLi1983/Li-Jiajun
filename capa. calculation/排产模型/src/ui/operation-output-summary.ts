import type { RnrBestActualPreview } from "../engine/rnr-best-actual-preview.js";

export interface StationOutputPreview {
  stationId: string;
  windowStartMinute: number;
  windowEndMinute: number;
  preview?: RnrBestActualPreview;
}

export const OPERATION_OUTPUT_FIELDS = [
  "bestCaseIdealUnits", "actualGrossUnits", "bestCaseOkUnits", "actualGoodUnits",
  "bestCaseNokUnits", "qualityGapUnits", "totalGapUnits", "timeGapUnits",
  "inferredSaGapUnits", "paceGapUnits", "mostLikelyGoodUnits",
] as const;

export type OperationOutputField = typeof OPERATION_OUTPUT_FIELDS[number];
export type OperationOutputTotals = Record<OperationOutputField, number>;

export function summarizeOperationOutput(stations: readonly StationOutputPreview[]): OperationOutputTotals | undefined {
  const first = stations[0];
  if (!first || stations.some(item => !item.preview?.complete
    || item.windowStartMinute !== first.windowStartMinute
    || item.windowEndMinute !== first.windowEndMinute)) return undefined;
  return Object.fromEntries(OPERATION_OUTPUT_FIELDS.map(field => [field,
    stations.reduce((sum, item) => sum + item.preview![field], 0),
  ])) as OperationOutputTotals;
}
