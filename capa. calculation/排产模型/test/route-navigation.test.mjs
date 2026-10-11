import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { createRnrValidationFixture } from "../dist/engine/rnr-validation-fixture.js";
import {
  buildRouteWindowCapacityView,
  collectRouteWindowCandidates,
  listRouteOperations,
  nextStationId,
  resolveRouteObservationWindow,
  stationActualKey,
  stationPlanKey,
} from "../dist/ui/route-navigation.js";

const sameWindow = { startMinute: 480, endMinute: 1920 };
const otherWindow = { startMinute: 510, endMinute: 1950 };

function station(operationId, stationId, shareCeiling, window = sameWindow, withActual = true) {
  const parameter = sampleScenario.operationStationParameters.find(item => item.operationId === operationId && item.stationId === stationId);
  const fixture = createRnrValidationFixture("A-Housing", stationId, parameter.standardCycleSec, parameter.piecesPerCycle);
  return {
    productId: "A-Housing",
    operationId,
    stationId,
    shareCeiling,
    parameter,
    planned: fixture.planned,
    actual: withActual ? fixture.actual : [],
    speedOptions: { verifiedStandardCycleSec: parameter.standardCycleSec },
    standardWindow: window,
  };
}

function routeInput(stations, units = { "op-a-10": 1, "op-a-20": 1 }, memory) {
  return {
    ...(memory ? { memory } : {}),
    stations,
    operationIds: ["op-a-10", "op-a-20"],
    operationUnitsPerProduct: units,
  };
}

const threeStations = [
  station("op-a-10", "OP10", 0.7),
  station("op-a-10", "OP10B", 0.3),
  station("op-a-20", "OP20", 1),
];

describe("route operation navigation", () => {
  it("lists operations in sequence and keeps a station only when it belongs to the current operation", () => {
    assert.deepEqual(listRouteOperations([
      { operationId: "op-a-20", sequence: 20, name: "装配" },
      { operationId: "op-a-10", sequence: 10, name: "机加工" },
    ]), [
      { operationId: "op-a-10", label: "OP10 机加工" },
      { operationId: "op-a-20", label: "OP20 装配" },
    ]);
    assert.equal(nextStationId("OP10", ["OP10", "OP10B"]), "OP10");
    assert.equal(nextStationId("OP10", ["OP20"]), "OP20");
    assert.equal(nextStationId("", []), "");
  });

  it("keeps saved station records when the focused operation changes", () => {
    const actuals = new Map([[stationActualKey("A-Housing", "op-a-10", "OP10"), threeStations[0].actual]]);
    const plans = new Map([[stationPlanKey("A-Housing", "OP10"), threeStations[0].planned]]);
    const focusedStation = nextStationId("OP10", ["OP20"]);
    assert.equal(focusedStation, "OP20");
    assert.equal(actuals.get(stationActualKey("A-Housing", "op-a-10", "OP10")), threeStations[0].actual);
    assert.equal(plans.get(stationPlanKey("A-Housing", "OP10")), threeStations[0].planned);
    assert.equal(actuals.has(stationActualKey("A-Housing", "op-a-20", "OP20")), false);
  });
});

describe("route observation window", () => {
  it("dedupes identical station windows and requires an explicit choice when they differ", () => {
    const same = collectRouteWindowCandidates([
      { stationId: "OP10", standardWindow: sameWindow },
      { stationId: "OP10B", standardWindow: sameWindow },
      { stationId: "OP20", standardWindow: sameWindow },
    ]);
    assert.equal(same.length, 1);
    assert.deepEqual(same[0].stationIds, ["OP10", "OP10B", "OP20"]);
    const only = resolveRouteObservationWindow(undefined, same);
    assert.equal(only.selected?.startMinute, 480);
    assert.equal(only.memory?.explicit, false);

    const mixed = collectRouteWindowCandidates([
      { stationId: "OP10", standardWindow: sameWindow },
      { stationId: "OP20", standardWindow: otherWindow },
    ]);
    const pending = resolveRouteObservationWindow(undefined, mixed);
    assert.equal(pending.selected, undefined);
    assert.equal(pending.needsExplicitChoice, true);
    const implicit = resolveRouteObservationWindow({ key: "480:1920", explicit: false }, mixed);
    assert.equal(implicit.selected, undefined);
    const chosen = resolveRouteObservationWindow({ key: "480:1920", explicit: true }, mixed);
    assert.equal(chosen.selected?.endMinute, 1920);
    const stale = resolveRouteObservationWindow({ key: "1:2", explicit: true }, mixed);
    assert.equal(stale.selected, undefined);
    assert.equal(stale.memory?.key, "1:2");
  });

  it("does not silently replace an explicit window after it disappears", () => {
    const resolution = resolveRouteObservationWindow(
      { key: "510:1950", explicit: true },
      collectRouteWindowCandidates([{ stationId: "OP10", standardWindow: sameWindow }]),
    );
    assert.equal(resolution.selected, undefined);
    assert.equal(resolution.needsExplicitChoice, true);
    assert.deepEqual(resolution.memory, { key: "510:1950", explicit: true });
    const view = buildRouteWindowCapacityView(routeInput(threeStations, undefined, resolution.memory));
    assert.equal(view.actualGoodOutput, undefined);
    assert.ok(view.stations.every(item => item.blockers.includes("route_window_unselected")));
    const chosen = resolveRouteObservationWindow({ key: "480:1920", explicit: true }, resolution.candidates);
    assert.equal(chosen.selected?.startMinute, 480);
  });

  it("keeps the validation-sample route Actual independent of which station is being edited", () => {
    const focusedOnOp10 = buildRouteWindowCapacityView(routeInput(threeStations));
    const focusedOnOp20 = buildRouteWindowCapacityView(routeInput(threeStations));
    assert.deepEqual(focusedOnOp10.stations.map(item => item.actualGoodOutput), [3035, 2912, 4857]);
    assert.equal(focusedOnOp10.actualGoodOutput, 4857);
    assert.equal(focusedOnOp10.actualBottleneckOperationId, "op-a-20");
    assert.equal(focusedOnOp20.actualGoodOutput, focusedOnOp10.actualGoodOutput);
    assert.equal(focusedOnOp20.bestBottleneckOperationId, focusedOnOp10.bestBottleneckOperationId);

    const doubled = buildRouteWindowCapacityView(routeInput(threeStations, { "op-a-10": 2, "op-a-20": 1 }));
    assert.equal(doubled.actualGoodOutput, 2973);
    assert.equal(doubled.actualBottleneckOperationId, "op-a-10");
    assert.deepEqual(doubled.stations.map(item => item.actualGoodOutput), [3035, 2912, 4857]);
  });

  it("leaves route Actual blank for a mismatched, missing or incomplete station without borrowing another window", () => {
    const mismatched = buildRouteWindowCapacityView(routeInput([
      threeStations[0],
      threeStations[1],
      station("op-a-20", "OP20", 1, otherWindow),
    ], { "op-a-10": 1, "op-a-20": 1 }, { key: "480:1920", explicit: true }));
    assert.equal(mismatched.actualGoodOutput, undefined);
    assert.equal(mismatched.bestGoodCapacity, undefined);
    assert.deepEqual(mismatched.stations.map(item => item.blockers), [[], [], ["window_mismatch"]]);
    assert.equal(mismatched.stations[0].actualGoodOutput, 3035);
    assert.equal(mismatched.selected?.startMinute, 480);

    const unselected = buildRouteWindowCapacityView({
      stations: [
        station("op-a-10", "OP10", 0.7, sameWindow),
        station("op-a-20", "OP20", 1, otherWindow),
      ],
      operationIds: ["op-a-10", "op-a-20"],
      operationUnitsPerProduct: { "op-a-10": 1, "op-a-20": 1 },
    });
    assert.equal(unselected.selected, undefined);
    assert.equal(unselected.actualGoodOutput, undefined);
    assert.ok(unselected.stations.every(item => item.blockers.includes("route_window_unselected")));

    const incomplete = buildRouteWindowCapacityView(routeInput([
      threeStations[0],
      threeStations[1],
      station("op-a-20", "OP20", 1, sameWindow, false),
    ]));
    assert.equal(incomplete.actualGoodOutput, undefined);
    assert.ok(incomplete.stations[2].blockers.includes("actual_window_incomplete"));

    const restored = buildRouteWindowCapacityView(routeInput(threeStations, { "op-a-10": 1, "op-a-20": 1 }, mismatched.memory));
    assert.equal(restored.actualGoodOutput, 4857);
    assert.equal(threeStations[0].actual.length > 0, true);
  });
});
