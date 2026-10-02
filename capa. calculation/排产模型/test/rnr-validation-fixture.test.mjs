import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRnrBestActualPreview, buildRnrEvidence, createRnrValidationFixture,
  reconcileRnrSpeedLoss, reconcileRnrTimeline, RNR_VALIDATION_FIXTURE_ID,
} from "../dist/index.js";

describe("temporary R&R validation fixture", () => {
  const fixture = createRnrValidationFixture("A-Housing", "OP10");

  it("provides a repeatable complete 24-hour planned and actual window", () => {
    assert.equal(fixture.id, RNR_VALIDATION_FIXTURE_ID);
    assert.equal(fixture.planned[0].startMinute, 480);
    assert.equal(fixture.planned.at(-1).endMinute, 1920);
    const timeline = reconcileRnrTimeline({
      stationId: "OP10", startMinute: 480, endMinute: 1920,
      planned: fixture.planned, actual: fixture.actual,
    });
    assert.equal(timeline.complete, true);
    assert.equal(timeline.plannedProductionMinutes, 1290);
    assert.equal(timeline.actualProductionMinutes, 1230);
    assert.equal(timeline.explicitAbnormalMinutes, 30);
    assert.deepEqual(createRnrValidationFixture("A-Housing", "OP10"), fixture);
  });

  it("explains the Best case to actual-good gap without double counting", () => {
    const preview = buildRnrBestActualPreview({
      stationId: "OP10", planned: fixture.planned, actual: fixture.actual,
      standardCycleSec: fixture.standardCycleSec, piecesPerCycle: fixture.piecesPerCycle,
      plannedQualityRate: 0.98,
      inferredSaLossMinutes: 4,
    });
    assert.equal(preview.complete, true);
    assert.equal(preview.standardCycleSec, 24);
    assert.equal(preview.bestCaseIdealUnits, 3225);
    assert.equal(preview.plannedQualityRate, 0.98);
    assert.equal(preview.bestCaseOkUnits, 3160.5);
    assert.equal(preview.bestCaseNokUnits, 64.5);
    assert.equal(preview.actualGrossUnits, 3065);
    assert.equal(preview.actualGoodUnits, 3035);
    assert.equal(Math.round(preview.actualCycleSec * 10) / 10, 24.1);
    assert.equal(Math.round(preview.actualQualityRate * 10000) / 10000, 0.9902);
    assert.equal(preview.recordedTimeGapUnits, 150);
    assert.equal(preview.inferredSaGapUnits, 10);
    assert.equal(preview.timeGapUnits, 160);
    assert.equal(preview.paceGapUnits, 0);
    assert.equal(preview.qualityGapUnits, 30);
    assert.equal(preview.totalGapUnits, 190);
    assert.equal(preview.plannedSa, 1290 / 1440);
    assert.equal(preview.actualSa, 1226 / 1440);
    assert.equal(preview.timeGapUnits + preview.paceGapUnits + preview.qualityGapUnits, preview.totalGapUnits);
  });

  it("counts extra actual break time once through Actual SA", () => {
    const planned = [
      { id: "plan-prod", kind: "production", stationId: "OP10", startMinute: 0, endMinute: 60, source: "standard" },
      { id: "plan-break", kind: "break", stationId: "OP10", startMinute: 60, endMinute: 70, source: "standard" },
    ];
    const actual = [
      { id: "actual-prod", kind: "production", stationId: "OP10", startMinute: 0, endMinute: 50, source: "runRate", okQty: 50, nokQty: 0 },
      { id: "actual-break", kind: "break", stationId: "OP10", startMinute: 50, endMinute: 70, source: "runRate" },
    ];
    const preview = buildRnrBestActualPreview({
      stationId: "OP10", planned, actual, standardCycleSec: 60, piecesPerCycle: 1,
    });
    assert.equal(preview.complete, true);
    assert.equal(preview.timeGapUnits, 10);
    assert.equal(preview.paceGapUnits, 0);
    assert.equal(preview.qualityGapUnits, 0);
    assert.equal(preview.totalGapUnits, 10);
    assert.equal(preview.timeGapUnits + preview.paceGapUnits + preview.qualityGapUnits, preview.totalGapUnits);
  });

  it("keeps an unknown cause visible without blocking SA calculation", () => {
    const speed = reconcileRnrSpeedLoss(fixture.actual.filter(item => item.kind === "production").map(item => ({
      id: item.id, productId: "A-Housing", operationId: "op-a-10", stationId: "OP10",
      startMinute: item.startMinute, endMinute: item.endMinute,
      okQty: item.okQty, nokQty: item.nokQty, piecesPerCycle: item.piecesPerCycle,
    })), { verifiedStandardCycleSec: 24 });
    const evidence = buildRnrEvidence({
      productId: "A-Housing", operationId: "op-a-10", stationId: "OP10",
      startMinute: 480, endMinute: 1920,
      planned: fixture.planned, actual: fixture.actual, speed,
    });
    assert.equal(speed.inferredSaLossMinutes, 4);
    assert.equal(evidence.explicitMinutes, 30);
    assert.equal(evidence.readyForCalculation, true);
    assert.ok(evidence.notices.some(item => item.code === "unexplained_inferred_loss"));
  });

  it("does not claim a comparable result while actual time is missing", () => {
    const preview = buildRnrBestActualPreview({
      stationId: "OP10", planned: fixture.planned, actual: fixture.actual.slice(0, -1),
      standardCycleSec: 24, piecesPerCycle: 1,
    });
    assert.equal(preview.complete, false);
    assert.equal(preview.unrecordedMinutes, 390);
  });
});
