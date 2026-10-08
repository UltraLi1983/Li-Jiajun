import assert from "node:assert/strict";
import { it } from "node:test";
import { buildRnrBestActualPreview } from "../dist/engine/rnr-best-actual-preview.js";

const event = (id, kind, startMinute, endMinute, extra = {}) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "manual", ...extra,
});

it("uses the full production day for R&R SA without requiring off-shift actual records", () => {
  const result = buildRnrBestActualPreview({
    stationId: "OP10",
    planned: [event("planned-production", "production", 0, 570), event("planned-rest", "unscheduled", 570, 960)],
    actual: [event("actual-production", "production", 0, 570, { okQty: 570, nokQty: 0 }), event("actual-rest", "unscheduled", 570, 960)],
    windowStartMinute: 0,
    windowEndMinute: 1440,
    offShiftIntervals: [{ startMinute: 960, endMinute: 1440 }],
    standardCycleSec: 60,
    piecesPerCycle: 1,
  });
  assert.equal(result.complete, true);
  assert.equal(result.windowMinutes, 1440);
  assert.equal(result.plannedSa, 570 / 1440);
  assert.equal(result.actualSa, 570 / 1440);
  assert.equal(result.unrecordedMinutes, 0);
});
