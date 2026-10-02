import type { TimelineEvent } from "../domain/types.js";
import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";

export interface PreviewActualEvent extends TimelineEvent {
  okQty?: number;
  nokQty?: number;
}

export interface RnrBestActualPreviewInput {
  stationId: string;
  planned: TimelineEvent[];
  actual: PreviewActualEvent[];
  standardCycleSec: number;
  piecesPerCycle: number;
  plannedQualityRate?: number;
  inferredSaLossMinutes?: number;
}

export interface RnrBestActualPreview {
  complete: boolean;
  windowMinutes: number;
  plannedProductionMinutes: number;
  actualProductionMinutes: number;
  plannedSa: number;
  actualSa: number;
  actualRecordedSa: number;
  standardCycleSec: number;
  bestCaseIdealUnits: number;
  plannedQualityRate: number;
  bestCaseOkUnits: number;
  bestCaseNokUnits: number;
  actualIdealUnits: number;
  actualGrossUnits: number;
  actualGoodUnits: number;
  actualCycleSec?: number;
  actualQualityRate?: number;
  timeGapUnits: number;
  recordedTimeGapUnits: number;
  inferredSaGapUnits: number;
  paceGapUnits: number;
  qualityGapUnits: number;
  totalGapUnits: number;
  unrecordedMinutes: number;
}

export function buildRnrBestActualPreview(input: RnrBestActualPreviewInput): RnrBestActualPreview {
  if (!input.planned.length || !Number.isFinite(input.standardCycleSec) || input.standardCycleSec <= 0
    || !Number.isFinite(input.piecesPerCycle) || input.piecesPerCycle <= 0) {
    throw new RangeError("A planned window, positive standard CT and pieces per cycle are required");
  }
  const inferredSaLossMinutes = input.inferredSaLossMinutes ?? 0;
  if (!Number.isFinite(inferredSaLossMinutes) || inferredSaLossMinutes < 0) {
    throw new RangeError("Inferred SA loss must be nonnegative");
  }
  const startMinute = Math.min(...input.planned.map(event => event.startMinute));
  const endMinute = Math.max(...input.planned.map(event => event.endMinute));
  const timeline = reconcileRnrTimeline({
    stationId: input.stationId, startMinute, endMinute,
    planned: input.planned, actual: input.actual,
  });
  const production = input.actual.filter(event => event.kind === "production");
  if (production.some(event => !Number.isInteger(event.okQty) || !Number.isInteger(event.nokQty)
    || (event.okQty ?? -1) < 0 || (event.nokQty ?? -1) < 0)) {
    throw new RangeError("Every actual production interval needs nonnegative OK and NOK counts");
  }
  const unitsPerMinute = 60 * input.piecesPerCycle / input.standardCycleSec;
  if (inferredSaLossMinutes > timeline.actualProductionMinutes) {
    throw new RangeError("Inferred SA loss exceeds actual production time");
  }
  const plannedQualityRate = input.plannedQualityRate ?? 1;
  if (!Number.isFinite(plannedQualityRate) || plannedQualityRate < 0 || plannedQualityRate > 1) {
    throw new RangeError("Planned quality rate must be between 0 and 1");
  }
  const bestCaseIdealUnits = timeline.plannedProductionMinutes * unitsPerMinute;
  const bestCaseOkUnits = bestCaseIdealUnits * plannedQualityRate;
  const bestCaseNokUnits = bestCaseIdealUnits - bestCaseOkUnits;
  const actualIdealUnits = timeline.actualProductionMinutes * unitsPerMinute;
  const actualGrossUnits = production.reduce((sum, event) => sum + (event.okQty ?? 0) + (event.nokQty ?? 0), 0);
  const actualGoodUnits = production.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
  const actualCycleSec = actualGrossUnits > 0
    ? timeline.actualProductionMinutes * 60 * input.piecesPerCycle / actualGrossUnits
    : undefined;
  const actualQualityRate = actualGrossUnits > 0 ? actualGoodUnits / actualGrossUnits : undefined;
  return {
    complete: timeline.complete,
    windowMinutes: timeline.windowMinutes,
    plannedProductionMinutes: timeline.plannedProductionMinutes,
    actualProductionMinutes: timeline.actualProductionMinutes,
    plannedSa: timeline.plannedProductionMinutes / timeline.windowMinutes,
    actualSa: (timeline.actualProductionMinutes - inferredSaLossMinutes) / timeline.windowMinutes,
    actualRecordedSa: timeline.actualProductionMinutes / timeline.windowMinutes,
    standardCycleSec: input.standardCycleSec,
    bestCaseIdealUnits,
    plannedQualityRate,
    bestCaseOkUnits,
    bestCaseNokUnits,
    actualIdealUnits,
    actualGrossUnits,
    actualGoodUnits,
    ...(actualCycleSec === undefined ? {} : { actualCycleSec }),
    ...(actualQualityRate === undefined ? {} : { actualQualityRate }),
    timeGapUnits: bestCaseIdealUnits - actualIdealUnits + inferredSaLossMinutes * unitsPerMinute,
    recordedTimeGapUnits: bestCaseIdealUnits - actualIdealUnits,
    inferredSaGapUnits: inferredSaLossMinutes * unitsPerMinute,
    paceGapUnits: actualIdealUnits - actualGrossUnits - inferredSaLossMinutes * unitsPerMinute,
    qualityGapUnits: actualGrossUnits - actualGoodUnits,
    totalGapUnits: bestCaseIdealUnits - actualGoodUnits,
    unrecordedMinutes: timeline.unrecordedMinutes,
  };
}
