import type { TimelineEvent } from "../domain/types.js";
import type { RnrCoveredShift } from "./rnr-sample-archive.js";

export interface RnrShiftBreakdownRow {
  shift: RnrCoveredShift;
  plannedProductionMinutes: number;
  actualProductionMinutes: number;
  actualNonProductionMinutes: number;
  unrecordedMinutes: number;
  okQty: number | null;
  nokQty: number | null;
  quantityStatus: "known" | "crossShift" | "missing";
  unallocatedProductionEventIds: string[];
}

function overlapMinutes(start: number, end: number, shift: RnrCoveredShift): number {
  return Math.max(0, Math.min(end, shift.endMinute) - Math.max(start, shift.startMinute));
}

export function buildRnrShiftBreakdown(input: {
  shifts: RnrCoveredShift[];
  planned: TimelineEvent[];
  actual: Array<TimelineEvent & { okQty?: number; nokQty?: number }>;
}): RnrShiftBreakdownRow[] {
  return input.shifts.map(shift => {
    const plannedProductionMinutes = input.planned.filter(event => event.kind === "production")
      .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
    const actualProductionMinutes = input.actual.filter(event => event.kind === "production")
      .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
    const actualNonProductionMinutes = input.actual.filter(event => event.kind !== "production")
      .reduce((sum, event) => sum + overlapMinutes(event.startMinute, event.endMinute, shift), 0);
    const production = input.actual.filter(event => event.kind === "production"
      && overlapMinutes(event.startMinute, event.endMinute, shift) > 0);
    const unallocatedProductionEventIds = production.filter(event => event.startMinute < shift.startMinute
      || event.endMinute > shift.endMinute)
      .map(event => event.id);
    const missingQuantity = production.some(event => !Number.isFinite(event.okQty) || !Number.isFinite(event.nokQty));
    const quantityStatus = unallocatedProductionEventIds.length ? "crossShift" : missingQuantity ? "missing" : "known";
    const quantitiesKnown = quantityStatus === "known";
    return {
      shift,
      plannedProductionMinutes,
      actualProductionMinutes,
      actualNonProductionMinutes,
      unrecordedMinutes: Math.max(0, shift.endMinute - shift.startMinute - actualProductionMinutes - actualNonProductionMinutes),
      okQty: quantitiesKnown ? production.reduce((sum, event) => sum + (event.okQty ?? 0), 0) : null,
      nokQty: quantitiesKnown ? production.reduce((sum, event) => sum + (event.nokQty ?? 0), 0) : null,
      quantityStatus,
      unallocatedProductionEventIds,
    };
  });
}
