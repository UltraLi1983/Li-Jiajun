import assert from "node:assert/strict";
import { it } from "node:test";
import { summarizeOperationOutput } from "../dist/ui/operation-output-summary.js";

const preview = (best, actual) => ({
  complete: true, bestCaseIdealUnits: best, actualGrossUnits: actual + 2,
  bestCaseOkUnits: best, actualGoodUnits: actual, bestCaseNokUnits: 0,
  qualityGapUnits: 2, totalGapUnits: best - actual, timeGapUnits: 5,
  inferredSaGapUnits: 1, paceGapUnits: best - actual - 7,
  mostLikelyGoodUnits: best - 3,
});

it("sums station output units without averaging rates or CT", () => {
  const result = summarizeOperationOutput([
    { stationId: "A", windowStartMinute: 0, windowEndMinute: 1440, preview: preview(100, 90) },
    { stationId: "B", windowStartMinute: 0, windowEndMinute: 1440, preview: preview(70, 60) },
  ]);
  assert.equal(result.bestCaseIdealUnits, 170);
  assert.equal(result.actualGoodUnits, 150);
  assert.equal(result.totalGapUnits, 20);
  assert.equal(result.mostLikelyGoodUnits, 164);
  assert.equal("standardCycleSec" in result, false);
});

it("withholds an operation total when one station is incomplete or windows differ", () => {
  const station = { stationId: "A", windowStartMinute: 0, windowEndMinute: 1440, preview: preview(100, 90) };
  assert.equal(summarizeOperationOutput([station, { stationId: "B", windowStartMinute: 0, windowEndMinute: 1440 }]), undefined);
  assert.equal(summarizeOperationOutput([station, { stationId: "B", windowStartMinute: 60, windowEndMinute: 1500, preview: preview(70, 60) }]), undefined);
});
