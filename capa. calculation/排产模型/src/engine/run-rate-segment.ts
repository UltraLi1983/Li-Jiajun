import type { ProductionSegmentCalculation, ProductionSegmentRecord } from "../domain/types.js";

export function calculateProductionSegment(segment: ProductionSegmentRecord): ProductionSegmentCalculation {
  const elapsedMinutes = Math.max(0, segment.endMinute - segment.startMinute);
  const actualQty = Math.max(0, segment.okQty + segment.nokQty);
  const piecesPerCycle = Math.max(segment.piecesPerCycle, 0.0001);
  const standardCycleSec = Math.max(segment.standardCycleSec, 0.0001);
  const observedCycleSec = actualQty > 0
    ? elapsedMinutes * 60 * piecesPerCycle / actualQty
    : Number.POSITIVE_INFINITY;
  const expectedQtyAtStandard = elapsedMinutes * 60 / standardCycleSec * piecesPerCycle;
  const missingQty = Math.max(0, expectedQtyAtStandard - actualQty);
  const hiddenLossMinutes = missingQty * standardCycleSec / 60 / piecesPerCycle;
  const performanceRate = Number.isFinite(observedCycleSec)
    ? standardCycleSec / observedCycleSec
    : 0;

  return {
    elapsedMinutes,
    actualQty,
    observedCycleSec,
    expectedQtyAtStandard,
    missingQty,
    hiddenLossMinutes,
    performanceRate,
  };
}

export function isProductionSegmentStable(calculation: ProductionSegmentCalculation, minimumPerformanceRate = 0.94): boolean {
  return calculation.performanceRate >= minimumPerformanceRate;
}
