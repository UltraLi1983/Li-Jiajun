import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { summarizeOperationCycleChecks, summarizeOperationRequiredShare } from "../dist/ui/operation-calibration-summary.js";

describe("operation calibration summaries", () => {
  it("weights planned and observed cycle by valid sample counts without changing station CT", () => {
    const result = summarizeOperationCycleChecks([
      { plannedCycleSec: 30, validSeconds: [30, 31], recordedCount: 3, excludedCount: 1 },
      { plannedCycleSec: 35, validSeconds: [36], recordedCount: 1, excludedCount: 0 },
    ]);
    assert.equal(result.plannedMeanSec, 95 / 3);
    assert.equal(result.observedMeanSec, 97 / 3);
    assert.ok(Math.abs(result.deltaSec - 2 / 3) < 1e-12);
    assert.deepEqual([result.recordedCount, result.validCount, result.excludedCount], [4, 3, 1]);
  });

  it("does not hide an unmeasured station in the operation cycle diagnosis", () => {
    const result = summarizeOperationCycleChecks([
      { plannedCycleSec: 30, validSeconds: [31], recordedCount: 1, excludedCount: 0 },
      { plannedCycleSec: 35, validSeconds: [], recordedCount: 0, excludedCount: 0 },
    ]);
    assert.equal(result.coveredStationCount, 1);
    assert.equal(result.plannedMeanSec, undefined);
    assert.equal(result.observedMeanSec, undefined);
  });

  it("normalizes 70/30 allocations and requires every station's same-week ledger", () => {
    const required = summarizeOperationRequiredShare([
      { allocationWeight: 0.7, availableMinutes: 1000, requiredShare: 0.115 },
      { allocationWeight: 0.3, availableMinutes: 1000, requiredShare: 0.137 },
    ]);
    assert.ok(Math.abs(required - 1 / (0.7 / 0.115 + 0.3 / 0.137)) < 1e-12);
    assert.equal(summarizeOperationRequiredShare([
      { allocationWeight: 1, availableMinutes: 1000, requiredShare: 0.5 },
      { allocationWeight: 1, availableMinutes: 1000, requiredShare: 0.5 },
    ]), 0.25);
    assert.equal(summarizeOperationRequiredShare([
      { allocationWeight: 0.7, availableMinutes: 1000, requiredShare: 0.115 },
      { allocationWeight: 0.3, requiredShare: 0.137 },
    ]), undefined);
  });
});
