import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { publishParameterVersion } from "../dist/engine/parameter-versioning.js";
import { buildPeriodCapacity, floorGoodPieces, goodPieces } from "../dist/engine/week-month-capacity.js";

const base = {
  parameterId: "param-a", operationId: "op-a-10", stationId: "OP10",
  standardCycleSec: 24, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1,
  parameterSource: "engineeringEstimate", approvalStatus: "approved", effectiveFrom: "2026-10-01",
};

const day = (date, best, most = best, workingDay = true) => ({
  date, workingDay, stale: false, bestCaseProductionMinutes: best, mostLikelyProductionMinutes: most,
});

describe("week and month station capacity", () => {
  it("matches the hand calculation and multiplies P and Q once", () => {
    assert.equal(goodPieces(700, base), 700 * 60 / 24);
    const rated = { ...base, performanceRate: 0.9, qualityRate: 0.95 };
    assert.equal(goodPieces(700, rated), 1750 * 0.9 * 0.95);
    const result = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [rated],
      days: [day("2026-10-14", 700, 670), day("2026-10-15", 0, 0, false)],
    });
    assert.equal(result.calculable, true);
    assert.equal(result.days[1].status, "off");
    assert.equal(result.bestCaseGoodPieces, floorGoodPieces(1496.25));
    assert.equal(result.mostLikelyGoodPieces, floorGoodPieces(670 * 60 / 24 * 0.9 * 0.95));
    assert.ok(result.mostLikelyGoodPieces <= result.bestCaseGoodPieces);
  });

  it("floors the summed raw pieces instead of summing daily floors", () => {
    const parameter = { ...base, standardCycleSec: 60, piecesPerCycle: 1 };
    const result = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [parameter],
      days: [day("2026-10-14", 1.9), day("2026-10-15", 1.9)],
    });
    assert.equal(floorGoodPieces(goodPieces(1.9, parameter)), 1);
    assert.equal(result.bestCaseGoodPieces, 3);
  });

  it("uses the version effective on each production date and ignores another station", () => {
    const next = { ...base, parameterId: "param-b", standardCycleSec: 12, effectiveFrom: "2026-10-15", supersedesParameterId: "param-a" };
    const other = { ...base, parameterId: "param-c", stationId: "OP10B", standardCycleSec: 10 };
    const result = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base, next, other],
      days: [day("2026-10-14", 60), day("2026-10-15", 60)],
    });
    assert.deepEqual(result.days.map(item => item.parameterId), ["param-a", "param-b"]);
    assert.equal(result.days[0].bestCaseGoodRaw, 150);
    assert.equal(result.days[1].bestCaseGoodRaw, 300);
    assert.equal(result.bestCaseGoodPieces, 450);
    const future = { ...next, effectiveFrom: "2026-10-20" };
    const before = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base, future],
      days: [day("2026-10-15", 60)],
    });
    assert.equal(before.days[0].parameterId, "param-a");
  });

  it("blocks only the affected day and the rollup when a parameter is missing or invalid", () => {
    const invalid = { ...base, parameterId: "param-bad", piecesPerCycle: 1.5, effectiveFrom: "2026-10-15" };
    const result = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base, invalid],
      days: [day("2026-10-14", 60), day("2026-10-15", 60), day("2026-10-16", 0)],
    });
    assert.equal(result.days[0].status, "calculated");
    assert.equal(result.days[1].status, "blocked");
    assert.equal(result.days[2].bestCaseGoodRaw, 0);
    assert.equal(result.calculable, false);
    assert.match(result.reason, /2026-10-15/);
    const stale = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base],
      days: [{ ...day("2026-10-14", 60), stale: true }],
    });
    assert.match(stale.reason, /源窗口已过期/);
  });

  it("deducts a monthly changeover once when the month uses one version", () => {
    const days = Array.from({ length: 28 }, (_, index) => day(`2026-10-${String(index + 1).padStart(2, "0")}`, 60));
    const week = buildPeriodCapacity({ operationId: "op-a-10", stationId: "OP10", parameters: [base], days: days.slice(0, 7) });
    const month = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base], days, extraChangeoverMinutes: 60,
    });
    assert.equal(week.extraChangeoverGoodLossRaw, 0);
    assert.equal(month.extraChangeoverGoodLossRaw, 150);
    assert.equal(month.bestCaseGoodPieces, floorGoodPieces(28 * 150 - 150));
    const wiped = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base],
      days: [day("2026-10-14", 10)], extraChangeoverMinutes: 1000,
    });
    assert.equal(wiped.bestCaseGoodPieces, 0);
    assert.equal(wiped.mostLikelyGoodPieces, 0);
  });

  it("leaves month pieces blank when extra changeover crosses parameter versions", () => {
    const next = { ...base, parameterId: "param-b", effectiveFrom: "2026-10-15", standardCycleSec: 30 };
    const result = buildPeriodCapacity({
      operationId: "op-a-10", stationId: "OP10", parameters: [base, next],
      days: [day("2026-10-14", 60), day("2026-10-15", 60)], extraChangeoverMinutes: 30,
    });
    assert.equal(result.calculable, false);
    assert.equal(result.bestCaseGoodPieces, undefined);
    assert.match(result.reason, /多个参数版本/);
  });

  it("refuses a published CT that is not paired with a recalculated P", () => {
    const suggestion = {
      suggestionId: "s1", target: "standardCycleSec", targetStandardId: base.parameterId,
      productId: "A-Housing", operationId: base.operationId, stationId: base.stationId,
      currentValue: 24, proposedValue: 22, unit: "seconds", evidenceRefs: ["actual-1"],
      approvalStatus: "approved", eligibleForConfirmation: true, effectiveFrom: "2026-10-14",
    };
    assert.throws(() => publishParameterVersion(base, [suggestion], "2026-10-14", "param- unpaired"), /paired/);
  });
});
