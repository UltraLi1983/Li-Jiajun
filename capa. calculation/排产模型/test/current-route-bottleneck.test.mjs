import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { calculateCapacityScenario } from "../dist/engine/capacity-engine.js";
import {
  describeCurrentRouteBottleneck,
  listRouteReportGaps,
  presentCurrentRouteBottleneck,
  selectCompleteRouteWeek,
} from "../dist/engine/current-route-bottleneck.js";
import { createLocalRouteCopy } from "../dist/engine/local-validation-route.js";
import { buildRouteWeekPlan } from "../dist/engine/route-week-plan.js";
import { buildPeriodCapacity, theoreticalPieces } from "../dist/engine/week-month-capacity.js";

const week = "2026-10-19";
const routeId = "local-route-a-housing-v1-6";

function parameter(overrides = {}) {
  return {
    parameterId: "param",
    operationId: "op-cast",
    stationId: "DC01",
    standardCycleSec: 300,
    piecesPerCycle: 1,
    performanceRate: 1,
    qualityRate: 1,
    parameterSource: "manual",
    approvalStatus: "approved",
    effectiveFrom: "2026-10-01",
    ...overrides,
  };
}

function day(minutes) {
  return {
    date: week, workingDay: true, stale: false,
    bestCaseProductionMinutes: minutes,
    mostLikelyProductionMinutes: minutes,
  };
}

function capacity(parameterRow, minutes) {
  return buildPeriodCapacity({
    operationId: parameterRow.operationId,
    stationId: parameterRow.stationId,
    parameters: [parameterRow],
    days: [day(minutes)],
  });
}

function station(parameterRow, minutes) {
  return {
    productId: "A-Housing",
    routeId,
    operationId: parameterRow.operationId,
    stationId: parameterRow.stationId,
    weekStartDate: week,
    ledgerPresent: true,
    capacity: capacity(parameterRow, minutes),
    allocationMode: "fixedShare",
    plannedShare: 1,
    planBasis: "currentParameterRecalc",
  };
}

function planFor(piecesPerCycle, units = 1, extra = {}) {
  const casting = parameter({ piecesPerCycle, parameterId: `cast-${piecesPerCycle}` });
  const assembly = parameter({
    parameterId: "asm", operationId: "op-asm", stationId: "AS01", standardCycleSec: 60, piecesPerCycle: 1,
  });
  return buildRouteWeekPlan({
    productId: "A-Housing",
    routeId,
    weekStartDate: week,
    role: "outlook",
    demandQty: 40,
    stations: [station(casting, 100), station(assembly, 50)],
    operationOrder: ["op-cast", "op-asm"],
    operationUnits: [
      { operationId: "op-cast", ...(units ? { unitsPerFinishedProduct: units } : {}), ...extra.castUnits },
      { operationId: "op-asm", unitsPerFinishedProduct: 1 },
    ],
  });
}

const identities = [
  { operationId: "op-cast", name: "压铸", stations: [{ stationId: "DC01", name: "压铸01" }] },
  { operationId: "op-asm", name: "装配", stations: [{ stationId: "AS01", name: "装配01" }] },
];

function cardFor(plan, selection = { ok: true, weekStartDate: week }, route = routeId) {
  return describeCurrentRouteBottleneck({
    routeId: route,
    routeVersion: "local-1",
    selection,
    ...(plan ? { plan } : {}),
    operations: identities,
  });
}

describe("current route bottleneck", () => {
  it("names station-flow constraints without inventing a single bottleneck station", () => {
    const plan = { ...planFor(1), flowLimited: true, planBottleneckOperationId: undefined };
    const card = cardFor(plan);
    assert.equal(card.status, "calculated");
    assert.equal(card.operationId, "route-flow");
    assert.deepEqual(card.stations, []);
    assert.match(presentCurrentRouteBottleneck(card, "zh").value, /工站流转约束/);
  });
  it("traces OP10 -4910 to the old global minute ledger, not die-cast pieces per cycle", () => {
    const scenario = structuredClone(sampleScenario);
    let current = scenario;
    for (let index = 0; index < 6; index += 1) {
      const created = createLocalRouteCopy(current, "route-a-housing-v1");
      assert.equal("issues" in created, false);
      current = created.scenario;
    }
    assert.equal(current.routes.some(route => route.routeId === routeId), true);
    const before = calculateCapacityScenario(current).find(item => item.stationId === "OP10");
    current.operationStationParameters = [...(current.operationStationParameters ?? []), parameter({
      parameterId: "die-cast-v6",
      operationId: `${routeId}--op-a-10`,
      stationId: "OP10",
      piecesPerCycle: 4,
    })];
    const after = calculateCapacityScenario(current).find(item => item.stationId === "OP10");
    assert.ok(before && after);
    assert.equal(Math.round(before.gapMinutes), Math.round(after.gapMinutes));
    assert.equal(Math.round(before.gapMinutes), -4910);
    assert.equal(before.stationId, "OP10");
    assert.equal("operationId" in before, false);

    const unavailable = presentCurrentRouteBottleneck(cardFor(undefined, {
      ok: false, code: "incomplete_week", missingStationIds: ["DC01"], weekStartDates: [],
    }), "zh");
    assert.equal(unavailable.value, "无法计算");
    assert.equal(unavailable.detail.includes("4910"), false);
    assert.equal(unavailable.detail.includes("分钟"), false);
  });

  it("scales die-cast native pieces with cavities and can leave the route bottleneck downstream", () => {
    const one = parameter({ piecesPerCycle: 1 });
    const four = parameter({ piecesPerCycle: 4, parameterId: "cast-4" });
    assert.equal(theoreticalPieces(100, one), 20);
    assert.equal(theoreticalPieces(100, four), 80);

    const single = planFor(1);
    const multi = planFor(4);
    assert.equal(single.stations[0].piecesPerCycle, 1);
    assert.equal(single.stations[0].nativeMostLikelyPieces, 20);
    assert.equal(multi.stations[0].piecesPerCycle, 4);
    assert.equal(multi.stations[0].nativeMostLikelyPieces, 80);
    assert.equal(single.planBottleneckOperationId, "op-cast");
    assert.equal(single.mostLikelyPieces, 20);
    assert.equal(multi.planBottleneckOperationId, "op-asm");
    assert.equal(multi.mostLikelyPieces, 50);
    assert.notEqual(multi.mostLikelyPieces, single.mostLikelyPieces * 4);

    const castCard = presentCurrentRouteBottleneck(cardFor(single), "zh");
    const downstream = presentCurrentRouteBottleneck(cardFor(multi), "zh");
    assert.match(castCard.value, /压铸 · op-cast \/ 压铸01 · DC01/);
    assert.match(castCard.detail, new RegExp(routeId));
    assert.match(castCard.detail, /少 20 件/);
    assert.equal(castCard.detail.includes("分钟"), false);
    assert.match(downstream.value, /装配 · op-asm \/ 装配01 · AS01/);
    assert.match(downstream.detail, /Most likely 50 件/);
    assert.equal(downstream.detail.includes("OP10"), false);
    assert.equal(downstream.detail.includes("4910"), false);
  });

  it("keeps pieces per cycle independent from units per finished product", () => {
    const doubled = planFor(4, 2);
    assert.equal(doubled.stations[0].nativeMostLikelyPieces, 80);
    assert.equal(doubled.operations.find(item => item.operationId === "op-cast").mostLikelyFinishedPieces, 40);
    assert.equal(doubled.planBottleneckOperationId, "op-cast");
    assert.equal(doubled.mostLikelyPieces, 40);
  });

  it("leaves the card blank when quantity, ledger, parameter or route version is missing", () => {
    const casting = parameter({ piecesPerCycle: 4, parameterId: "cast-4" });
    const assembly = parameter({
      parameterId: "asm", operationId: "op-asm", stationId: "AS01", standardCycleSec: 60, piecesPerCycle: 1,
    });
    const missingQuantity = buildRouteWeekPlan({
      productId: "A-Housing", routeId, weekStartDate: week, role: "outlook", demandQty: 40,
      stations: [station(casting, 100), station(assembly, 50)],
      operationOrder: ["op-cast", "op-asm"],
      operationUnits: [
        { operationId: "op-cast", issue: "缺少工序用量" },
        { operationId: "op-asm", unitsPerFinishedProduct: 1 },
      ],
    });
    const quantityCard = cardFor(missingQuantity);
    assert.equal(quantityCard.status, "unavailable");
    assert.equal(quantityCard.mostLikelyPieces, undefined);
    assert.equal(quantityCard.pieceGap, undefined);
    assert.match(presentCurrentRouteBottleneck(quantityCard, "zh").value, /无法计算/);

    const unpublished = parameter({ approvalStatus: "proposed", parameterId: "draft-cast" });
    const blocked = buildRouteWeekPlan({
      productId: "A-Housing", routeId, weekStartDate: week, role: "outlook", demandQty: 40,
      stations: [station(unpublished, 100), station(parameter({
        parameterId: "asm", operationId: "op-asm", stationId: "AS01", standardCycleSec: 60,
      }), 50)],
      operationOrder: ["op-cast", "op-asm"],
      operationUnits: [
        { operationId: "op-cast", unitsPerFinishedProduct: 1 },
        { operationId: "op-asm", unitsPerFinishedProduct: 1 },
      ],
    });
    const parameterCard = cardFor(blocked);
    assert.equal(parameterCard.status, "unavailable");
    assert.equal(parameterCard.pieceGap, undefined);
    assert.match(parameterCard.reasons.join(" "), /没有已发布且在该日生效的参数/);
    assert.equal(presentCurrentRouteBottleneck(parameterCard, "zh").value, "无法计算");

    const missingLedger = selectCompleteRouteWeek(["DC01", "AS01"], { DC01: [week], AS01: [] });
    assert.equal(missingLedger.ok, false);
    const ledgerCard = cardFor(planFor(4), missingLedger);
    assert.equal(ledgerCard.mostLikelyPieces, undefined);
    assert.match(presentCurrentRouteBottleneck(ledgerCard, "zh").detail, /AS01/);
    assert.equal(presentCurrentRouteBottleneck(ledgerCard, "zh").detail.includes("0 件"), false);

    const otherRoute = cardFor(planFor(4), { ok: true, weekStartDate: week }, "route-a-housing-v1");
    assert.equal(otherRoute.status, "unavailable");
    assert.match(presentCurrentRouteBottleneck(otherRoute, "zh").detail, /route-a-housing-v1/);
    assert.equal(presentCurrentRouteBottleneck(otherRoute, "zh").detail.includes("少"), false);

    const ambiguous = selectCompleteRouteWeek(["DC01", "AS01"], {
      DC01: [week, "2026-10-26"], AS01: [week, "2026-10-26"],
    });
    assert.deepEqual(ambiguous, {
      ok: false, code: "ambiguous_week", missingStationIds: [], weekStartDates: [week, "2026-10-26"],
    });
    const ambiguousCard = presentCurrentRouteBottleneck(cardFor(undefined, ambiguous), "zh");
    assert.match(ambiguousCard.detail, /不选定其中一周/);
    assert.equal(ambiguousCard.value, "无法计算");
  });

  it("marks a station whose date matches but whose ledger was never generated", () => {
    const gaps = listRouteReportGaps([
      { operationId: "op-cast", operationName: "压铸", stationId: "DC01", stationName: "压铸01", weeks: ["2026-10-19"], draftWeekStart: "2026-10-19", generated: true },
      { operationId: "op-asm", operationName: "装配", stationId: "OP20", stationName: "装配01", weeks: [], draftWeekStart: "2026-10-19", generated: false },
    ], "zh");
    assert.equal(gaps.length, 1);
    assert.equal(gaps[0].stationId, "OP20");
    assert.equal(gaps[0].code, "ledger_not_generated");
    assert.match(gaps[0].detail, /整周起始日期是 2026-10-19/);
    assert.match(gaps[0].detail, /还没有生成周账/);
    assert.equal(gaps[0].detail.includes("4910"), false);
  });

  it("marks every station when the generated weeks do not overlap or an operation has no planning station", () => {
    const mismatch = listRouteReportGaps([
      { operationId: "op-cast", operationName: "压铸", stationId: "DC01", stationName: "压铸01", weeks: ["2026-10-19"], draftWeekStart: "2026-10-19", generated: true },
      { operationId: "op-asm", operationName: "装配", stationId: "OP20", stationName: "装配01", weeks: ["2026-10-26"], draftWeekStart: "2026-10-26", generated: true },
    ], "zh");
    assert.deepEqual(mismatch.map(item => item.code), ["week_mismatch", "week_mismatch"]);
    const unassigned = listRouteReportGaps([
      { operationId: "op-cast", operationName: "压铸", stationId: "DC01", stationName: "压铸01", weeks: ["2026-10-19"], draftWeekStart: "2026-10-19", generated: true },
      { operationId: "op-asm", operationName: "装配", stationId: "", stationName: "", weeks: [], draftWeekStart: "", generated: false },
    ], "zh");
    assert.equal(unassigned.length, 1);
    assert.equal(unassigned[0].code, "no_planning_station");
    assert.equal(unassigned[0].operationId, "op-asm");
  });

  it("does not render the global minute gap in the summary card", () => {
    const source = readFileSync(new URL("../src/ui/formal-app.ts", import.meta.url), "utf8");
    const body = source.slice(source.indexOf("function renderSummary("), source.indexOf("function renderProduct(routingConfig"));
    assert.equal(body.includes("gapMinutes"), false);
    assert.match(body, /bottleneckCard/);
    assert.match(body, /selectCompleteRouteWeek/);
    assert.match(source, /data-current-route-bottleneck/);
    assert.match(source, /data-report-gap-host/);
    assert.match(source, /还不能输出路线报告的位置/);
    const visual = source.slice(source.indexOf("function renderVisualRoute("), source.indexOf("function renderRouting("));
    assert.equal(visual.split("paintRouteReportGaps").length - 1, 2);
  });
});
