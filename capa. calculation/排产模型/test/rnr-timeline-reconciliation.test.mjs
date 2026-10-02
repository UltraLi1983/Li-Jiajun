import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reconcileRnrTimeline } from "../dist/engine/rnr-timeline-reconciliation.js";

const event = (id, kind, startMinute, endMinute) => ({
  id, kind, startMinute, endMinute, stationId: "OP10", source: "manual",
});
const planned = [
  event("planned-production-1", "production", 0, 120),
  event("planned-break", "break", 120, 150),
  event("planned-production-2", "production", 150, 240),
];

describe("R&R planned/actual timeline reconciliation", () => {
  it("separates changed activity and explicit abnormal loss without inventing missing time", () => {
    const actual = [
      event("actual-production-1", "production", 0, 115),
      event("actual-break", "break", 115, 145),
      event("actual-production-2", "production", 145, 200),
      event("actual-failure", "equipmentFailure", 200, 215),
      event("actual-production-3", "production", 215, 240),
    ];
    const result = reconcileRnrTimeline({ stationId: "OP10", startMinute: 0, endMinute: 240, planned, actual });
    assert.equal(result.complete, true);
    assert.equal(result.plannedProductionMinutes, 210);
    assert.equal(result.actualProductionMinutes, 195);
    assert.equal(result.explicitAbnormalMinutes, 15);
    assert.equal(result.unrecordedMinutes, 0);
    assert.deepEqual(result.rows.filter(row => row.status === "changed").map(row => [row.startMinute, row.endMinute]), [[115, 120], [145, 150], [200, 215]]);
    assert.equal(result.rows.find(row => row.startMinute === 200)?.actualEventId, "actual-failure");
  });

  it("keeps an uncovered actual interval as unrecorded", () => {
    const result = reconcileRnrTimeline({
      stationId: "OP10", startMinute: 0, endMinute: 240, planned,
      actual: [event("actual-production", "production", 0, 120)],
    });
    assert.equal(result.complete, false);
    assert.equal(result.unrecordedMinutes, 120);
    assert.equal(result.explicitAbnormalMinutes, 0);
    assert.equal(result.rows.find(row => row.startMinute === 120)?.status, "unrecorded");
  });

  it("rejects overlap or out-of-window records before comparison", () => {
    assert.throws(() => reconcileRnrTimeline({
      stationId: "OP10", startMinute: 0, endMinute: 240, planned,
      actual: [event("a", "production", 0, 80), event("b", "break", 70, 100)],
    }), /overlap/);
    assert.throws(() => reconcileRnrTimeline({
      stationId: "OP10", startMinute: 0, endMinute: 240, planned,
      actual: [event("a", "production", 0, 250)],
    }), /outside/);
  });
});
