export interface RnrSpeedObservation {
  id: string;
  productId: string;
  operationId: string;
  stationId: string;
  startMinute: number;
  endMinute: number;
  okQty: number;
  nokQty: number;
  piecesPerCycle: number;
}

export interface RnrPaceSegmentResult {
  id: string;
  actualQty: number;
  elapsedMinutes: number;
  averageCycleSec?: number | undefined;
  deltaSec?: number | undefined;
  deltaPercent?: number | undefined;
}

export interface RnrPaceSummary {
  totalQty: number;
  totalProductionMinutes: number;
  averageCycleSec?: number | undefined;
  segments: RnrPaceSegmentResult[];
}

export function calculateRnrPaceSummary(observations: RnrSpeedObservation[]): RnrPaceSummary {
  const segments = observations.map(observation => {
    const actualQty = observation.okQty + observation.nokQty;
    const elapsedMinutes = Math.max(observation.endMinute - observation.startMinute, 0);
    const valid = isValidObservation(observation);
    return {
      id: observation.id,
      actualQty,
      elapsedMinutes,
      averageCycleSec: valid ? observedCycleSec(observation) : undefined,
    };
  });
  const validSegments = segments.filter(segment => segment.averageCycleSec !== undefined);
  const totalQty = validSegments.reduce((sum, segment) => sum + segment.actualQty, 0);
  const totalProductionMinutes = validSegments.reduce((sum, segment) => sum + segment.elapsedMinutes, 0);
  const totalCycles = validSegments.reduce((sum, segment) => (
    sum + segment.actualQty / (observations.find(item => item.id === segment.id)?.piecesPerCycle ?? 1)
  ), 0);
  const averageCycleSec = totalCycles > 0 ? totalProductionMinutes * 60 / totalCycles : undefined;
  return {
    totalQty,
    totalProductionMinutes,
    averageCycleSec,
    segments: segments.map(segment => ({
      ...segment,
      deltaSec: averageCycleSec === undefined || segment.averageCycleSec === undefined
        ? undefined : segment.averageCycleSec - averageCycleSec,
      deltaPercent: averageCycleSec === undefined || segment.averageCycleSec === undefined || averageCycleSec === 0
        ? undefined : (segment.averageCycleSec - averageCycleSec) / averageCycleSec,
    })),
  };
}

export interface RnrSpeedOptions {
  verifiedStandardCycleSec?: number;
  acceptableSlowDeviationPercent?: number;
}

export interface RnrSpeedSegmentResult {
  id: string;
  actualQty: number;
  observedCycleSec: number;
  referenceCycleSec?: number;
  referenceSource: "verified" | "fastest" | "missing";
  inferredSaLossMinutes: number;
  performanceLossMinutes: number;
  issue?: "invalid_observation" | "faster_than_verified_standard";
}

export interface RnrSpeedResult {
  segments: RnrSpeedSegmentResult[];
  inferredSaLossMinutes: number;
  performanceLossMinutes: number;
  readyForCalibration: boolean;
}

// Only production windows are passed here. Explicit stops already occupy separate
// timeline windows, so their minutes must never enter speed-loss reconciliation.
export function reconcileRnrSpeedLoss(
  observations: RnrSpeedObservation[],
  options: RnrSpeedOptions = {},
): RnrSpeedResult {
  const tolerance = options.acceptableSlowDeviationPercent ?? 0;
  if (!Number.isFinite(tolerance) || tolerance < 0 || tolerance > 5) {
    throw new RangeError("acceptableSlowDeviationPercent must be between 0 and 5");
  }
  const verified = options.verifiedStandardCycleSec;
  if (verified !== undefined && (!Number.isFinite(verified) || verified <= 0)) {
    throw new RangeError("verifiedStandardCycleSec must be positive");
  }

  const valid = observations.filter(isValidObservation);
  const fastestByContext = new Map<string, number>();
  for (const observation of valid) {
    const key = contextKey(observation);
    const observed = observedCycleSec(observation);
    fastestByContext.set(key, Math.min(fastestByContext.get(key) ?? Infinity, observed));
  }

  const segments: RnrSpeedSegmentResult[] = observations.map(observation => {
    const actualQty = observation.okQty + observation.nokQty;
    if (!isValidObservation(observation)) {
      return {
        id: observation.id, actualQty, observedCycleSec: 0,
        referenceSource: "missing", inferredSaLossMinutes: 0,
        performanceLossMinutes: 0, issue: "invalid_observation",
      };
    }
    const observed = observedCycleSec(observation);
    const reference = verified ?? fastestByContext.get(contextKey(observation));
    if (reference === undefined) {
      return {
        id: observation.id, actualQty, observedCycleSec: observed,
        referenceSource: "missing", inferredSaLossMinutes: 0,
        performanceLossMinutes: 0, issue: "invalid_observation",
      };
    }
    if (verified !== undefined && observed < verified - 1e-8) {
      return {
        id: observation.id, actualQty, observedCycleSec: observed,
        referenceCycleSec: reference, referenceSource: "verified",
        inferredSaLossMinutes: 0, performanceLossMinutes: 0,
        issue: "faster_than_verified_standard",
      };
    }
    const idealMinutes = actualQty * reference / (60 * observation.piecesPerCycle);
    const excessMinutes = Math.max(0, observation.endMinute - observation.startMinute - idealMinutes);
    const performanceLossMinutes = verified === undefined
      ? 0
      : Math.min(excessMinutes, idealMinutes * tolerance / 100);
    return {
      id: observation.id, actualQty, observedCycleSec: observed,
      referenceCycleSec: reference, referenceSource: verified === undefined ? "fastest" : "verified",
      inferredSaLossMinutes: Math.max(0, excessMinutes - performanceLossMinutes),
      performanceLossMinutes,
    };
  });

  return {
    segments,
    inferredSaLossMinutes: segments.reduce((sum, segment) => sum + segment.inferredSaLossMinutes, 0),
    performanceLossMinutes: segments.reduce((sum, segment) => sum + segment.performanceLossMinutes, 0),
    readyForCalibration: segments.length > 0 && segments.every(segment => segment.issue === undefined),
  };
}

function isValidObservation(observation: RnrSpeedObservation): boolean {
  return Number.isFinite(observation.startMinute)
    && Number.isFinite(observation.endMinute)
    && observation.endMinute > observation.startMinute
    && Number.isInteger(observation.okQty) && observation.okQty >= 0
    && Number.isInteger(observation.nokQty) && observation.nokQty >= 0
    && observation.okQty + observation.nokQty > 0
    && Number.isFinite(observation.piecesPerCycle) && observation.piecesPerCycle > 0;
}

function observedCycleSec(observation: RnrSpeedObservation): number {
  return (observation.endMinute - observation.startMinute) * 60
    * observation.piecesPerCycle / (observation.okQty + observation.nokQty);
}

function contextKey(observation: RnrSpeedObservation): string {
  return [observation.productId, observation.operationId, observation.stationId, observation.piecesPerCycle].join("::");
}
