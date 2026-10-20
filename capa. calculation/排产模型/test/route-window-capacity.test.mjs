import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { createRnrValidationFixture } from "../dist/engine/rnr-validation-fixture.js";
import { calculateRouteWindowCapacity } from "../dist/engine/route-window-capacity.js";

function station(operationId, stationId, shareCeiling, withActual = true) {
  const parameter = sampleScenario.operationStationParameters.find(item => item.operationId === operationId && item.stationId === stationId);
  const fixture = createRnrValidationFixture("A-Housing", stationId, parameter.standardCycleSec, parameter.piecesPerCycle);
  return {
    productId: "A-Housing", operationId, stationId, shareCeiling,
    parameter,
    planned: fixture.planned, actual: withActual ? fixture.actual : [],
    speedOptions: { verifiedStandardCycleSec: parameter.standardCycleSec },
  };
}

const input = {
  startMinute: 480, endMinute: 1920,
  operationIds: ["op-a-10", "op-a-20"],
  operationUnitsPerProduct: { "op-a-10": 1, "op-a-20": 1 },
  stations: [station("op-a-10", "OP10", 0.7), station("op-a-10", "OP10B", 0.3), station("op-a-20", "OP20", 1)],
};

describe("same-window route capacity", () => {
  it("does not count an unlinked upstream station in route capacity", () => {
    const linked = calculateRouteWindowCapacity({ ...input, stationFlowPolicies: [{
      fromOperationId: "op-a-10", toOperationId: "op-a-20",
      allowedPairs: [{ fromStationId: "OP10B", toStationId: "OP20" }],
    }] });
    assert.equal(linked.bestGoodCapacity, 3096);
    assert.equal(linked.actualGoodOutput, 2912);
    assert.equal(linked.bestBottleneckOperationId, undefined);
    assert.equal(linked.actualBottleneckOperationId, undefined);
  });
  it("adds parallel stations and takes the serial bottleneck without inventing demand", () => {
    const result = calculateRouteWindowCapacity(input);
    assert.ok(Math.abs(result.stations[0].bestGoodCapacity - 3225) < 1e-8);
    assert.ok(Math.abs(result.stations[1].bestGoodCapacity - 3096) < 1e-8);
    assert.ok(Math.abs(result.operations[0].bestGoodCapacity - 6321) < 1e-8);
    assert.equal(result.bestBottleneckOperationId, "op-a-20");
    assert.equal(result.bestGoodCapacity, 5160);
    assert.deepEqual(result.stations.map(item => item.actualGoodOutput), [3035, 2912, 4857]);
    assert.ok(result.stations.every(item => item.blockers.length === 0));
    assert.equal(result.actualGoodOutput, 4857);
    assert.equal(result.actualBottleneckOperationId, "op-a-20");
    assert.equal(result.bestGap, undefined);
    assert.equal(result.actualGap, undefined);
  });

  it("uses only explicitly provided demand for gap calculation", () => {
    const result = calculateRouteWindowCapacity({ ...input, demandQty: 3000 });
    assert.equal(result.bestGap, 2160);
    assert.equal(result.actualGap, 1857);
  });

  it("converts a two-WIP machining operation independently from station cavities", () => {
    const result = calculateRouteWindowCapacity({
      ...input, demandQty: 3000,
      operationUnitsPerProduct: { "op-a-10": 2, "op-a-20": 1 },
    });
    assert.ok(Math.abs(result.bestGoodCapacity - 3160.5) < 1e-8);
    assert.equal(result.actualGoodOutput, 2973);
    assert.equal(result.bestBottleneckOperationId, "op-a-10");
    assert.equal(result.actualBottleneckOperationId, "op-a-10");
    assert.equal(result.actualGap, -27);
    assert.deepEqual(result.stations.map(item => item.actualGoodOutput), [3035, 2912, 4857]);
  });

  it("does not compare different WIP units without explicit conversion", () => {
    const { operationUnitsPerProduct, ...withoutConversion } = input;
    const result = calculateRouteWindowCapacity({ ...withoutConversion, demandQty: 3000 });
    assert.equal(result.operations[0].bestGoodCapacity > 0, true);
    assert.equal(result.bestGoodCapacity, undefined);
    assert.equal(result.actualGoodOutput, undefined);
    assert.equal(result.bestGap, undefined);
    assert.equal(calculateRouteWindowCapacity({
      ...input, operationUnitsPerProduct: { "op-a-10": 1.5, "op-a-20": 1 },
    }).bestGoodCapacity, undefined);
  });

  it("keeps off-shift time out of the planned-gap check", () => {
    const parameter = sampleScenario.operationStationParameters.find(item => item.stationId === "OP10");
    const shared = {
      productId: "A-Housing", operationId: "op-a-10", stationId: "OP10", parameter,
      planned: [{ id: "plan", productId: "A-Housing", stationId: "OP10", kind: "production", startMinute: 510, endMinute: 1230, source: "manual" }],
      actual: [{ id: "actual", productId: "A-Housing", stationId: "OP10", kind: "production", startMinute: 510, endMinute: 1230, source: "runRate", okQty: 1800, nokQty: 0, piecesPerCycle: 1 }],
      speedOptions: { verifiedStandardCycleSec: parameter.standardCycleSec },
    };
    const covered = calculateRouteWindowCapacity({
      startMinute: 510, endMinute: 1950, operationIds: ["op-a-10"], operationUnitsPerProduct: { "op-a-10": 1 },
      stations: [{ ...shared, offShiftIntervals: [{ startMinute: 1230, endMinute: 1950 }] }],
    });
    assert.equal(covered.stations[0].blockers.includes("planned_window_gap"), false);
    assert.equal(covered.stations[0].actualGoodOutput, 1800);
    const uncovered = calculateRouteWindowCapacity({
      startMinute: 510, endMinute: 1950, operationIds: ["op-a-10"], operationUnitsPerProduct: { "op-a-10": 1 },
      stations: [shared],
    });
    assert.equal(uncovered.stations[0].blockers.includes("planned_window_gap"), true);
    assert.equal(uncovered.stations[0].actualGoodOutput, undefined);
  });

  it("leaves route Actual unknown if a planning station has no complete actual track", () => {
    const result = calculateRouteWindowCapacity({
      ...input, stations: [...input.stations.slice(0, 2), station("op-a-20", "OP20", 1, false)],
    });
    assert.equal(result.bestGoodCapacity > 0, true);
    assert.equal(result.actualGoodOutput, undefined);
    assert.ok(result.stations[2].blockers.includes("actual_window_incomplete"));
  });

  it("blocks a planned gap, invalid quantity or duplicate assignment", () => {
    const gap = calculateRouteWindowCapacity({ ...input, operationIds: ["op-a-10"], stations: [{
      ...input.stations[0], planned: input.stations[0].planned.slice(1),
    }] });
    assert.equal(gap.bestGoodCapacity, undefined);
    assert.ok(gap.stations[0].blockers.includes("planned_window_gap"));
    const bad = calculateRouteWindowCapacity({ ...input, operationIds: ["op-a-10"], stations: [{
      ...input.stations[0], actual: input.stations[0].actual.map((item, index) => index === 0 ? { ...item, okQty: -1 } : item),
    }] });
    assert.equal(bad.actualGoodOutput, undefined);
    assert.ok(bad.stations[0].blockers.includes("actual_cycle_or_quantity_invalid"));
    assert.throws(() => calculateRouteWindowCapacity({ ...input, stations: [input.stations[0], input.stations[0]] }), /Duplicate/);
    assert.throws(() => calculateRouteWindowCapacity({ ...input, stations: [{ ...input.stations[0], shareCeiling: 1.2 }] }), /ceiling/);
  });
});
