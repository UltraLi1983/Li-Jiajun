import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { calculateRnrPaceSummary, reconcileRnrSpeedLoss } from "../dist/engine/rnr-reconciliation.js";

const observation = (id, duration, piecesPerCycle = 1) => ({
  id, productId: "A", operationId: "op-a-10", stationId: "OP10",
  startMinute: 0, endMinute: duration, okQty: 100, nokQty: 0,
  piecesPerCycle,
});

describe("R&R pace summary", () => {
  it("calculates a quantity-weighted full-run CT and segment deltas", () => {
    const result = calculateRnrPaceSummary([
      observation("fast", 40),
      observation("slow", 50),
    ]);
    assert.equal(result.averageCycleSec, 27);
    assert.equal(result.segments[0].averageCycleSec, 24);
    assert.equal(result.segments[0].deltaSec, -3);
    assert.equal(result.segments[0].deltaPercent, -3 / 27);
    assert.equal(result.segments[1].deltaSec, 3);
  });

  it("excludes empty production segments from the full-run average", () => {
    const result = calculateRnrPaceSummary([
      observation("valid", 40),
      { ...observation("empty", 20), okQty: 0 },
    ]);
    assert.equal(result.averageCycleSec, 24);
    assert.equal(result.segments[1].averageCycleSec, undefined);
  });
});

describe("R&R speed-loss reconciliation", () => {
  it("uses the fastest valid production segment when no cycle validation exists", () => {
    const result = reconcileRnrSpeedLoss([observation("fast", 40), observation("slow", 45)]);
    assert.equal(result.readyForCalibration, true);
    assert.equal(result.segments[0].referenceCycleSec, 24);
    assert.equal(result.segments[1].referenceSource, "fastest");
    assert.equal(result.inferredSaLossMinutes, 5);
    assert.equal(result.performanceLossMinutes, 0);
  });

  it("assigns all excess time to inferred SA without acceptable deviation", () => {
    const result = reconcileRnrSpeedLoss([observation("one", 45)], { verifiedStandardCycleSec: 24 });
    assert.equal(result.inferredSaLossMinutes, 5);
    assert.equal(result.performanceLossMinutes, 0);
  });

  it("assigns tolerance time to Performance and only the excess to inferred SA", () => {
    const result = reconcileRnrSpeedLoss([observation("one", 45)], {
      verifiedStandardCycleSec: 24, acceptableSlowDeviationPercent: 5,
    });
    assert.equal(result.performanceLossMinutes, 2);
    assert.equal(result.inferredSaLossMinutes, 3);
  });

  it("does not mix products, stations, operations or pieces-per-cycle reference groups", () => {
    const result = reconcileRnrSpeedLoss([
      observation("one-piece", 40),
      observation("two-piece-fast", 20, 2),
      observation("two-piece-slow", 25, 2),
    ]);
    assert.equal(result.segments[0].referenceCycleSec, 24);
    assert.equal(result.segments[1].referenceCycleSec, 24);
    assert.equal(result.segments[2].referenceCycleSec, 24);
    assert.equal(result.inferredSaLossMinutes, 5);
  });

  it("flags faster-than-verified output for human reconciliation", () => {
    const result = reconcileRnrSpeedLoss([observation("too-fast", 36)]);
    assert.equal(result.readyForCalibration, true);
    const checked = reconcileRnrSpeedLoss([observation("too-fast", 36)], { verifiedStandardCycleSec: 24 });
    assert.equal(checked.segments[0].issue, "faster_than_verified_standard");
    assert.equal(checked.readyForCalibration, false);
    assert.equal(checked.inferredSaLossMinutes, 0);
  });

  it("rejects invalid observations and tolerance outside 0-5%", () => {
    const invalid = reconcileRnrSpeedLoss([{ ...observation("empty", 40), okQty: 0 }]);
    assert.equal(invalid.readyForCalibration, false);
    assert.equal(invalid.segments[0].issue, "invalid_observation");
    assert.throws(() => reconcileRnrSpeedLoss([observation("one", 45)], {
      verifiedStandardCycleSec: 24, acceptableSlowDeviationPercent: 6,
    }), RangeError);
  });
});
