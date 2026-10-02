import type { TimelineEvent } from "../domain/types.js";

export const RNR_VALIDATION_FIXTURE_ID = "rnr-validation-op10-24h-v1";

export interface FixtureActualEvent extends TimelineEvent {
  okQty?: number;
  nokQty?: number;
  piecesPerCycle?: number;
  evidenceSource?: string;
  isEstimated?: boolean;
}

export interface RnrValidationFixture {
  id: string;
  planned: TimelineEvent[];
  actual: FixtureActualEvent[];
  cycleSamplesSec: number[];
  standardCycleSec: number;
  piecesPerCycle: number;
}

// A relative 24-hour observation window; the UI anchors minute zero to today's date.
export function createRnrValidationFixture(productId: string, stationId: string): RnrValidationFixture {
  const planned = [
    ["production", 480, 660], ["break", 660, 690], ["production", 690, 1020],
    ["break", 1020, 1050], ["production", 1050, 1140], ["setup", 1140, 1200],
    ["production", 1200, 1500], ["break", 1500, 1530], ["production", 1530, 1920],
  ] as const;
  const actual = [
    ["production", 480, 660, 446, 4], ["break", 660, 700, 0, 0],
    ["production", 700, 1020, 792, 8], ["break", 1020, 1050, 0, 0],
    ["production", 1050, 1140, 223, 2], ["setup", 1140, 1220, 0, 0],
    ["production", 1220, 1320, 237, 3], ["equipmentFailure", 1320, 1350, 0, 0],
    ["production", 1350, 1500, 371, 4], ["break", 1500, 1530, 0, 0],
    ["production", 1530, 1920, 966, 9],
  ] as const;
  return {
    id: RNR_VALIDATION_FIXTURE_ID,
    planned: planned.map(([kind, startMinute, endMinute], index) => ({
      id: `validation-plan-${index + 1}`, productId, stationId, kind,
      startMinute, endMinute, source: "template", label: `Validation ${kind}`,
    })),
    actual: actual.map(([kind, startMinute, endMinute, okQty, nokQty], index) => ({
      id: `validation-actual-${index + 1}`, productId, stationId, kind,
      startMinute, endMinute, source: "runRate", label: `Validation ${kind}`,
      ...(kind === "production" ? { okQty, nokQty, piecesPerCycle: 1 } : {}),
      ...(kind === "equipmentFailure" ? { evidenceSource: "Validation fixture: equipment alarm", isEstimated: false } : {}),
    })),
    cycleSamplesSec: Array(20).fill(24) as number[],
    standardCycleSec: 24,
    piecesPerCycle: 1,
  };
}
