import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRnrBestActualPreview, buildRnrEvidence, createRnrValidationFixture,
  placeFixtureActualsOnWindow, reconcileRnrSpeedLoss, reconcileRnrTimeline, RNR_VALIDATION_FIXTURE_ID,
} from "../dist/index.js";

describe("temporary R&R validation fixture", () => {
  const fixture = createRnrValidationFixture("A-Housing", "OP10");

  it("moves actual records onto the current standard window without changing their durations", () => {
    const placed = placeFixtureActualsOnWindow(fixture.actual, 510);
    assert.equal(placed[0].startMinute, 510);
    assert.equal(placed.at(-1).endMinute, 1950);
    assert.deepEqual(placed.map(event => event.endMinute - event.startMinute), fixture.actual.map(event => event.endMinute - event.startMinute));
    assert.equal(placeFixtureActualsOnWindow(fixture.actual, 480)[0].startMinute, 480);
  });

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
      publishedPerformanceRate: 0.9,
      acceptedUnplannedMinutes: 30,
      inferredSaLossMinutes: 4,
    });
    assert.equal(preview.complete, true);
    assert.equal(preview.standardCycleSec, 24);
    assert.equal(preview.bestCaseIdealUnits, 3225);
    assert.equal(preview.plannedQualityRate, 0.98);
    assert.equal(preview.bestCaseOkUnits, 3225);
    assert.equal(preview.bestCaseNokUnits, 0);
    assert.equal(preview.mostLikelyProductionMinutes, 1260);
    assert.equal(preview.mostLikelySa, 1260 / 1440);
    assert.equal(preview.mostLikelyGoodUnits, 1260 * 60 / 24 * 0.9 * 0.98);
    assert.equal(preview.publishedPerformanceRate, 0.9);
    assert.ok(Math.abs((preview.actualPerformanceRate ?? 0) - Math.min(1, 24 / preview.actualCycleSec)) < 1e-9);
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

  it("generates an independent OP10B sample at the station's effective CT", () => {
    const parallel = createRnrValidationFixture("A-Housing", "OP10B", 25, 1);
    assert.notEqual(parallel.id, fixture.id);
    assert.equal(parallel.standardCycleSec, 25);
    assert.equal(parallel.cycleSamplesSec.length, 20);
    assert.ok(parallel.cycleSamplesSec.every(value => value === 25));
    assert.ok(parallel.planned.every(item => item.stationId === "OP10B"));
    assert.ok(parallel.actual.every(item => item.stationId === "OP10B"));
    assert.ok(parallel.actual.every(item => !fixture.actual.some(original => original.id === item.id)));
    assert.equal(reconcileRnrTimeline({
      stationId: "OP10B", startMinute: 480, endMinute: 1920,
      planned: parallel.planned, actual: parallel.actual,
    }).complete, true);
    const speed = reconcileRnrSpeedLoss(parallel.actual.filter(item => item.kind === "production").map(item => ({
      id: item.id, productId: "A-Housing", operationId: "op-a-10", stationId: "OP10B",
      startMinute: item.startMinute, endMinute: item.endMinute,
      okQty: item.okQty, nokQty: item.nokQty, piecesPerCycle: item.piecesPerCycle,
    })), { verifiedStandardCycleSec: 25 });
    assert.ok(speed.segments.every(item => item.status !== "faster_than_verified_standard"));
    assert.equal(buildRnrEvidence({
      productId: "A-Housing", operationId: "op-a-10", stationId: "OP10B",
      startMinute: 480, endMinute: 1920,
      planned: parallel.planned, actual: parallel.actual, speed,
    }).readyForCalculation, true);
  });

  it("generates a complete die-casting sample at CT 300s", () => {
    const casting = createRnrValidationFixture("A-Housing", "OP10A", 300, 1);
    assert.equal(casting.standardCycleSec, 300);
    assert.ok(casting.cycleSamplesSec.every(value => value === 300));
    assert.ok(casting.actual.filter(event => event.kind === "production").every(event => (event.okQty ?? 0) > 0));
    assert.equal(reconcileRnrTimeline({
      stationId: "OP10A", startMinute: 480, endMinute: 1920,
      planned: casting.planned, actual: casting.actual,
    }).complete, true);
  });

  it("generates a complete OP20 assembly sample without changing machining evidence", () => {
    const assembly = createRnrValidationFixture("A-Housing", "OP20", 15, 1);
    assert.notEqual(assembly.id, fixture.id);
    assert.equal(assembly.standardCycleSec, 15);
    assert.equal(assembly.cycleSamplesSec.length, 20);
    assert.ok(assembly.cycleSamplesSec.every(value => value === 15));
    assert.ok(assembly.planned.every(item => item.stationId === "OP20"));
    assert.ok(assembly.actual.every(item => item.stationId === "OP20"));
    assert.ok(assembly.actual.every(item => !fixture.actual.some(original => original.id === item.id)));
    assert.equal(reconcileRnrTimeline({
      stationId: "OP20", startMinute: 480, endMinute: 1920,
      planned: assembly.planned, actual: assembly.actual,
    }).complete, true);
    const speed = reconcileRnrSpeedLoss(assembly.actual.filter(item => item.kind === "production").map(item => ({
      id: item.id, productId: "A-Housing", operationId: "op-a-20", stationId: "OP20",
      startMinute: item.startMinute, endMinute: item.endMinute,
      okQty: item.okQty, nokQty: item.nokQty, piecesPerCycle: item.piecesPerCycle,
    })), { verifiedStandardCycleSec: 15 });
    assert.ok(speed.segments.every(item => item.status !== "faster_than_verified_standard"));
    assert.equal(buildRnrEvidence({
      productId: "A-Housing", operationId: "op-a-20", stationId: "OP20",
      startMinute: 480, endMinute: 1920,
      planned: assembly.planned, actual: assembly.actual, speed,
    }).readyForCalculation, true);
    assert.equal(fixture.standardCycleSec, 24);
    assert.equal(fixture.actual[0].stationId, "OP10");
  });
});
