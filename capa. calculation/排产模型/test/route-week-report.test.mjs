import assert from "node:assert/strict";
import { it } from "node:test";
import { buildRouteWeekPlan } from "../dist/engine/route-week-plan.js";
import { buildPeriodCapacity } from "../dist/engine/week-month-capacity.js";
import { renderRouteWeekSheets, renderScopedWeekReport } from "../dist/ui/route-week-report.js";

it("uses readable route labels in the live report without changing source IDs", () => {
  const capacity = buildPeriodCapacity({
    operationId: "local-op-1", stationId: "OP10", days: [{
      date: "2026-10-12", workingDay: true, stale: false,
      bestCaseProductionMinutes: 60, mostLikelyProductionMinutes: 50,
    }],
    parameters: [{
      parameterId: "param-1", operationId: "local-op-1", stationId: "OP10",
      standardCycleSec: 60, piecesPerCycle: 1, performanceRate: 1, qualityRate: 1,
      parameterSource: "manual", approvalStatus: "approved", effectiveFrom: "2026-10-01",
    }],
  });
  const base = {
    productId: "A", routeId: "route-a", weekStartDate: "2026-10-12",
    operationOrder: ["local-op-1"], operationUnits: [{ operationId: "local-op-1", unitsPerFinishedProduct: 1 }],
    stations: [{ productId: "A", routeId: "route-a", operationId: "local-op-1", stationId: "OP10",
      weekStartDate: "2026-10-12", ledgerPresent: true, capacity,
      allocationMode: "fixedShare", plannedShare: 1, planBasis: "currentParameterRecalc", withBreaksSa: 0.8 }],
    demandQty: 40,
  };
  const html = renderRouteWeekSheets({
    zh: true, review: buildRouteWeekPlan({ ...base, role: "review" }),
    outlook: buildRouteWeekPlan({ ...base, role: "outlook" }),
    productName: "产品 A 壳体", productVersion: "V1", routeId: "route-a",
    operationLabels: { "local-op-1": "OP10 压铸" }, stationLabels: { OP10: "压铸01 · OP10" },
    generatedAt: "2026-10-23 12:00", weekEnd: () => "2026-10-19",
  });
  assert.match(html, /OP10 压铸/);
  assert.match(html, /压铸01 · OP10/);
  assert.doesNotMatch(html, />local-op-1</);
  assert.match(html, /Actual 无完整实绩/);
});

it("separates single-operation equivalent capacity from full-route decisions", () => {
  const base = {
    productId: "A", routeId: "route-a", weekStartDate: "2026-10-12", demandQty: 40,
    operationOrder: ["op10"], operationUnits: [{ operationId: "op10", unitsPerFinishedProduct: 2 }],
    stations: [],
  };
  const review = buildRouteWeekPlan({ ...base, role: "review" });
  const outlook = buildRouteWeekPlan({ ...base, role: "outlook" });
  const common = { zh: true, review, outlook, productName: "A-Housing", routeId: "route-a",
    generatedAt: "2026-10-26 08:00", operationLabels: { op10: "OP10 压铸" },
    stationLabels: { s1: "压铸01" }, evidence: [], missingStationIds: ["s1"] };
  const operation = renderScopedWeekReport({ ...common, scope: "operation", operationId: "op10" });
  const route = renderScopedWeekReport({ ...common, scope: "route" });
  assert.match(operation, /工序成品等效能力/);
  assert.match(operation, /不代表整条路线的可交付成品/);
  assert.match(operation, /压铸01/);
  assert.doesNotMatch(operation, /目标周计划瓶颈/);
  assert.match(route, /完整工艺路径/);
  assert.match(route, /目标周计划瓶颈/);
  assert.doesNotMatch(route, /工站参数与能力/);
});

it("shows the seven-day SA allocation from the generated week ledger without filling Actual", () => {
  const base = { productId: "A", routeId: "route-a", weekStartDate: "2026-10-26", demandQty: 40,
    operationOrder: ["op10"], operationUnits: [{ operationId: "op10", unitsPerFinishedProduct: 1 }],
    stations: [{ productId: "A", routeId: "route-a", operationId: "op10", stationId: "s1",
      weekStartDate: "2026-10-26", ledgerPresent: false, planBasis: "currentParameterRecalc" }] };
  const day = (index) => ({ date: new Date(Date.UTC(2026, 9, 26 + index)).toISOString().slice(0, 10), mode: "manual", stale: false,
    scheduledMinutes: 480, productionMinutes: 420, breakMinutes: 30,
    setupMinutes: index === 0 ? 20 : 0, maintenanceMinutes: 10,
    plannedStopMinutes: index === 0 ? 0 : 20, unscheduledMinutes: 960 });
  const html = renderScopedWeekReport({ zh: true, scope: "operation", operationId: "op10",
    review: buildRouteWeekPlan({ ...base, role: "review" }),
    outlook: buildRouteWeekPlan({ ...base, role: "outlook" }),
    productName: "A-Housing", routeId: "route-a", generatedAt: "2026-10-26 08:00",
    operationLabels: { op10: "OP10 压铸" }, stationLabels: { s1: "压铸01" },
    evidence: [], missingStationIds: [], plannedSaWeeks: [{ role: "outlook", operationId: "op10", stationId: "s1",
      perShiftUnplanned: 15, sourceLossRate: 0.1, acceptedLossMinutes: 30, pendingLossMinutes: 0,
      observedShiftCount: 2, shiftCounts: Array(7).fill(1),
      days: Array.from({ length: 7 }, (_, index) => index === 0 ? { ...day(index), mode: "copy" } : day(index)) }] });
  assert.match(html, /目标周 · 计划 SA 排布/);
  assert.match(html, /2026-10-26/);
  assert.match(html, /2026-11-01/);
  assert.match(html, /换型/);
  assert.match(html, /420/);
  assert.match(html, /复制日损失率 10\.0%/);
  assert.match(html, /2,940\/2,808 min/);
  assert.match(html, /Actual 仅接受完整同周实绩/);
  assert.match(html, /<td>—<\/td><\/tr><\/tbody>/);
});
