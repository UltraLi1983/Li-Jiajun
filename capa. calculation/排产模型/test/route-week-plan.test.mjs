import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildRouteWeekPlan } from "../dist/engine/route-week-plan.js";
import { buildPeriodCapacity } from "../dist/engine/week-month-capacity.js";

function parameter(overrides = {}) {
  return {
    parameterId: "param-a", operationId: "op-10", stationId: "OP10",
    standardCycleSec: 60, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1,
    parameterSource: "manual", approvalStatus: "approved", effectiveFrom: "2026-10-01",
    ...overrides,
  };
}

function capacity(parameters, stationId, operationId, minutes) {
  const days = ["2026-10-12", "2026-10-13"].map(date => ({
    date, workingDay: true, stale: false,
    bestCaseProductionMinutes: minutes.best,
    mostLikelyProductionMinutes: minutes.most,
  }));
  return buildPeriodCapacity({ operationId, stationId, parameters, days });
}

function station(overrides) {
  const operationId = overrides.operationId ?? "op-10";
  const stationId = overrides.stationId ?? "OP10";
  const parameters = overrides.parameters ?? [parameter({ operationId, stationId })];
  const minutes = overrides.minutes ?? { best: 100, most: 80 };
  return {
    productId: "A", routeId: "route-a", operationId, stationId,
    weekStartDate: "2026-10-12", ledgerPresent: true,
    capacity: capacity(parameters, stationId, operationId, minutes),
    allocationMode: "fixedShare", plannedShare: 1,
    planBasis: "currentParameterRecalc",
    withBreaksSa: 0.8, mostLikelySa: 0.7,
    ...overrides,
    capacity: overrides.capacity ?? capacity(parameters, stationId, operationId, minutes),
  };
}

describe("route week plan", () => {
  it("keeps two weeks independent when CT, P and Q match but the ledgers differ", () => {
    const shared = {
      productId: "A", routeId: "route-a", role: "outlook",
      operationOrder: ["op-10"],
      operationUnits: [{ operationId: "op-10", unitsPerFinishedProduct: 1 }],
      demandQty: 50,
    };
    const first = buildRouteWeekPlan({ ...shared, weekStartDate: "2026-10-12", stations: [station({ minutes: { best: 100, most: 80 } })] });
    const second = buildRouteWeekPlan({ ...shared, weekStartDate: "2026-10-19", stations: [station({ weekStartDate: "2026-10-19", minutes: { best: 200, most: 40 } })] });
    assert.notEqual(first.mostLikelyPieces, second.mostLikelyPieces);
    assert.notEqual(first.bestCasePieces, second.bestCasePieces);
    assert.equal(first.planMargin, first.mostLikelyPieces - 50);
    assert.equal(first.actualPieces, undefined);
    assert.match(first.actualBlankReason, /尚未发生/);
    assert.equal(first.planBasis, "currentParameterRecalc");
  });

  it("uses the parameter effective on each day and multiplies P and Q only on Most likely", () => {
    const early = parameter({ parameterId: "early", performanceRate: 0.5, qualityRate: 0.8, effectiveFrom: "2026-10-01" });
    const later = parameter({ parameterId: "later", standardCycleSec: 30, performanceRate: 0.5, qualityRate: 0.8, effectiveFrom: "2026-10-13" });
    const days = [
      { date: "2026-10-12", workingDay: true, stale: false, bestCaseProductionMinutes: 100, mostLikelyProductionMinutes: 100 },
      { date: "2026-10-13", workingDay: true, stale: false, bestCaseProductionMinutes: 100, mostLikelyProductionMinutes: 100 },
    ];
    const period = buildPeriodCapacity({ operationId: "op-10", stationId: "OP10", parameters: [early, later], days });
    const plan = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", role: "review",
      operationOrder: ["op-10"], operationUnits: [{ operationId: "op-10", unitsPerFinishedProduct: 1 }],
      stations: [station({ capacity: period, parameters: [early, later] })],
    });
    assert.equal(period.parameterIds.length, 2);
    assert.equal(plan.bestCasePieces, period.bestCaseGoodPieces);
    assert.equal(plan.mostLikelyPieces, period.mostLikelyGoodPieces);
    assert.ok(plan.bestCasePieces > plan.mostLikelyPieces);
    assert.equal(plan.stations[0].mixedParameters, true);
  });

  it("merges parallel shares, converts units, and leaves the route blank when one station plan is missing", () => {
    const machining = [
      station({ stationId: "OP10", plannedShare: 0.7, minutes: { best: 100, most: 100 } }),
      station({ stationId: "OP10B", plannedShare: 0.3, minutes: { best: 100, most: 100 } }),
    ];
    const assembly = station({
      operationId: "op-20", stationId: "OP20", allocationMode: "forecastCalculated", plannedShare: undefined,
      minutes: { best: 50, most: 40 },
    });
    const units = [
      { operationId: "op-10", unitsPerFinishedProduct: 1 },
      { operationId: "op-20", unitsPerFinishedProduct: 2 },
    ];
    const complete = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", role: "review", demandQty: 10,
      operationOrder: ["op-10", "op-20"], operationUnits: units,
      stations: [...machining, assembly],
    });
    const op10 = complete.operations.find(item => item.operationId === "op-10");
    const op20 = complete.operations.find(item => item.operationId === "op-20");
    assert.equal(op10.mostLikelyFinishedPieces, 200);
    assert.equal(op20.mostLikelyFinishedPieces, 40);
    assert.equal(complete.planBottleneckOperationId, "op-20");
    assert.equal(complete.mostLikelyPieces, 40);
    assert.equal(complete.planMargin, 30);
    assert.match(complete.shareNote, /48 小时/);
    assert.match(assembly && complete.stations.find(item => item.stationId === "OP20").shareRule, /未套用 48 小时/);

    const missing = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", role: "review",
      operationOrder: ["op-10", "op-20"], operationUnits: units,
      stations: [...machining, { ...assembly, ledgerPresent: false, capacity: undefined }],
    });
    assert.equal(missing.calculable, false);
    assert.equal(missing.mostLikelyPieces, undefined);
    assert.equal(missing.stations.find(item => item.stationId === "OP10").nativeMostLikelyPieces, 200);
    assert.match(missing.reasons.join(" "), /缺少这一周的周账/);
  });

  it("does not treat a 48-hour draft as week actual, and does not copy Most likely onto next week actual", () => {
    const stations = [station({})];
    const base = {
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12",
      operationOrder: ["op-10"], operationUnits: [{ operationId: "op-10", unitsPerFinishedProduct: 1 }],
      stations,
    };
    const draft = buildRouteWeekPlan({
      ...base, role: "review",
      actual: { completeSameWeek: false, note: "仅有 48 小时 R&R", routeGoodPieces: 999, byOperationGoodPieces: { "op-10": 999 } },
    });
    assert.equal(draft.actualPieces, undefined);
    assert.match(draft.actualBlankReason, /48 小时/);

    const evidenced = buildRouteWeekPlan({
      ...base, role: "review",
      actual: { completeSameWeek: true, byOperationGoodPieces: { "op-10": 70 }, sa: 0.66, performanceRate: 0.9, qualityRate: 0.95 },
    });
    assert.equal(evidenced.actualPieces, 70);
    assert.equal(evidenced.actualSa, 0.66);

    const outlook = buildRouteWeekPlan({
      ...base, role: "outlook",
      actual: { completeSameWeek: true, byOperationGoodPieces: { "op-10": 70 } },
    });
    assert.equal(outlook.actualPieces, undefined);
    assert.match(outlook.actualBlankReason, /尚未发生/);
    assert.notEqual(outlook.mostLikelyPieces, undefined);
  });

  it("rejects a mismatched week, a missing fixed share and a missing quantity without filling sample numbers", () => {
    const wrongWeek = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-19", role: "outlook",
      operationOrder: ["op-10"], operationUnits: [{ operationId: "op-10", unitsPerFinishedProduct: 1 }],
      stations: [station({ weekStartDate: "2026-10-12" })],
    });
    assert.equal(wrongWeek.mostLikelyPieces, undefined);
    assert.match(wrongWeek.reasons.join(" "), /目标周不一致/);

    const noShare = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", role: "outlook",
      operationOrder: ["op-10"], operationUnits: [{ operationId: "op-10", unitsPerFinishedProduct: 1 }],
      stations: [station({ plannedShare: undefined })],
    });
    assert.equal(noShare.calculable, false);
    assert.ok(noShare.stations[0].nativeMostLikelyPieces > 0);
    assert.match(noShare.reasons.join(" "), /100%/);

    const noUnits = buildRouteWeekPlan({
      productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", role: "outlook",
      operationOrder: ["op-10"], operationUnits: [{ operationId: "op-10", issue: "缺少工序用量" }],
      stations: [station({})],
    });
    assert.equal(noUnits.mostLikelyPieces, undefined);
    assert.match(noUnits.reasons.join(" "), /缺少工序用量/);
  });
});
