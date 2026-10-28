import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatCoverageSummary, mergeStatusIntervals, reconcileRnrTimeline } from "../dist/engine/rnr-timeline-reconciliation.js";

const event = (id, kind, startMinute, endMinute) => ({
  id, kind, startMinute, endMinute, stationId: "OP20A", source: "manual",
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
    const result = reconcileRnrTimeline({ stationId: "OP20A", startMinute: 0, endMinute: 240, planned, actual });
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
      stationId: "OP20A", startMinute: 0, endMinute: 240, planned,
      actual: [event("actual-production", "production", 0, 120)],
    });
    assert.equal(result.complete, false);
    assert.equal(result.unrecordedMinutes, 120);
    assert.equal(result.explicitAbnormalMinutes, 0);
    assert.equal(result.rows.find(row => row.startMinute === 120)?.status, "unrecorded");
  });

  it("excludes off-shift time from missing records while keeping overtime visible", () => {
    const input = {
      stationId: "OP20A", startMinute: 0, endMinute: 1440,
      planned: [event("planned", "production", 0, 960)],
      offShiftIntervals: [{ startMinute: 960, endMinute: 1440 }],
    };
    const complete = reconcileRnrTimeline({ ...input, actual: [event("actual", "production", 0, 960)] });
    assert.equal(complete.windowMinutes, 1440);
    assert.equal(complete.unrecordedMinutes, 0);
    assert.equal(complete.plannedGapMinutes, 0);
    assert.equal(complete.complete, true);
    assert.equal(complete.rows.at(-1)?.plannedKind, "offShift");
    assert.equal(complete.rows.at(-1)?.actualKind, "offShift");

    const incomplete = reconcileRnrTimeline({ ...input, actual: [event("actual", "production", 0, 900)] });
    assert.equal(incomplete.unrecordedMinutes, 60);
    assert.equal(incomplete.complete, false);

    const overtime = reconcileRnrTimeline({ ...input, actual: [event("actual", "production", 0, 1020)] });
    assert.equal(overtime.actualProductionMinutes, 1020);
    assert.equal(overtime.rows.find(row => row.startMinute === 960)?.status, "changed");
  });

  it("names a middle blank without treating equal minutes or a different state as coverage", () => {
    const middle = reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 0, endMinute: 180, planned: [event("plan", "production", 0, 180)],
      actual: [event("a", "production", 0, 60), event("b", "production", 90, 180)],
    });
    assert.deepEqual(mergeStatusIntervals(middle.rows, "unrecorded"), [{ startMinute: 60, endMinute: 90 }]);
    assert.equal(formatCoverageSummary(mergeStatusIntervals(middle.rows, "unrecorded"), "zh", "unrecorded").summary, "实际未记录：01:00–01:30（30 分钟）");
    assert.equal(middle.rows.some(row => row.status === "changed"), false);

    const shifted = reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 630, endMinute: 810,
      planned: [event("plan-1", "production", 630, 690), event("plan-2", "production", 750, 810)],
      actual: [event("actual", "production", 690, 810)],
    });
    assert.equal(shifted.plannedProductionMinutes, shifted.actualProductionMinutes);
    assert.deepEqual(mergeStatusIntervals(shifted.rows, "unrecorded"), [{ startMinute: 630, endMinute: 690 }]);
    assert.deepEqual(mergeStatusIntervals(shifted.rows, "plannedGap"), [{ startMinute: 690, endMinute: 750 }]);
    const summary = formatCoverageSummary(mergeStatusIntervals(shifted.rows, "unrecorded"), "zh", "unrecorded");
    assert.equal(summary.summary, "实际未记录：10:30–11:30（60 分钟）");
    assert.equal(formatCoverageSummary(mergeStatusIntervals(shifted.rows, "plannedGap"), "zh", "plannedGap").summary.includes("计划空档"), true);

    const changed = reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 0, endMinute: 60,
      planned: [event("plan", "production", 0, 60)],
      actual: [event("break", "break", 0, 60)],
    });
    assert.equal(changed.unrecordedMinutes, 0);
    assert.equal(changed.plannedGapMinutes, 0);
    assert.equal(mergeStatusIntervals(changed.rows, "unrecorded").length, 0);
    assert.equal(changed.rows.some(row => row.status === "changed"), true);
  });

  it("reports the same on-shift interval as both planned and actual missing", () => {
    const result = reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 1380, endMinute: 1560,
      planned: [event("plan-1", "production", 1380, 1410), event("plan-2", "production", 1470, 1500)],
      actual: [event("actual-1", "production", 1380, 1410), event("actual-2", "production", 1470, 1500)],
      offShiftIntervals: [{ startMinute: 1500, endMinute: 1560 }],
    });
    assert.equal(result.unrecordedMinutes, 60);
    assert.equal(result.plannedGapMinutes, 60);
    assert.deepEqual(mergeStatusIntervals(result.rows, "unrecorded"), [{ startMinute: 1410, endMinute: 1470 }]);
    assert.deepEqual(mergeStatusIntervals(result.rows, "plannedGap"), [{ startMinute: 1410, endMinute: 1470 }]);
    assert.equal(result.rows.find(row => row.startMinute === 1410)?.status, "plannedGap");
  });

  it("rejects overlap or out-of-window records before comparison", () => {
    assert.throws(() => reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 0, endMinute: 240, planned,
      actual: [event("a", "production", 0, 80), event("b", "break", 70, 100)],
    }), /overlap/);
    assert.throws(() => reconcileRnrTimeline({
      stationId: "OP20A", startMinute: 0, endMinute: 240, planned,
      actual: [event("a", "production", 0, 250)],
    }), /outside/);
  });
});
