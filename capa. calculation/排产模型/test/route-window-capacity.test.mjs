import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario } from "../dist/domain/sample-data.js";
import { createRnrValidationFixture } from "../dist/engine/rnr-validation-fixture.js";
import { calculateRouteWindowCapacity } from "../dist/engine/route-window-capacity.js";

function station(operationId, stationId, shareCeiling, withActual = true) {
  const fixture = createRnrValidationFixture("A-Housing", stationId);
  return {
    productId: "A-Housing", operationId, stationId, shareCeiling,
    parameter: sampleScenario.operationStationParameters.find(item => item.operationId === operationId && item.stationId === stationId),
    planned: fixture.planned, actual: withActual ? fixture.actual : [],
    speedOptions: { verifiedStandardCycleSec: 24 },
  };
}

const input = {
  startMinute: 480, endMinute: 1920,
  operationIds: ["op-a-10", "op-a-20"],
  operationUnitsPerProduct: { "op-a-10": 1, "op-a-20": 1 },
  stations: [station("op-a-10", "OP10", 0.7), station("op-a-10", "OP10B", 0.3), station("op-a-20", "OP20", 1)],
};

describe("same-window route capacity", () => {
  it("adds parallel stations and takes the serial bottleneck without inventing demand", () => {
    const result = calculateRouteWindowCapacity(input);
    assert.ok(Math.abs(result.stations[0].bestGoodCapacity - 2257.5) < 1e-8);
    assert.ok(Math.abs(result.stations[1].bestGoodCapacity - 928.8) < 1e-8);
    assert.ok(Math.abs(result.operations[0].bestGoodCapacity - 3186.3) < 1e-8);
    assert.equal(result.bestBottleneckOperationId, "op-a-10");
    assert.equal(result.actualGoodOutput, 3035);
    assert.equal(result.actualBottleneckOperationId, "op-a-20");
    assert.equal(result.bestGap, undefined);
    assert.equal(result.actualGap, undefined);
  });

  it("uses only explicitly provided demand for gap calculation", () => {
    const result = calculateRouteWindowCapacity({ ...input, demandQty: 3000 });
    assert.ok(Math.abs(result.bestGap - 186.3) < 1e-8);
    assert.equal(result.actualGap, 35);
  });

  it("does not compare different WIP units without explicit conversion", () => {
    const { operationUnitsPerProduct, ...withoutConversion } = input;
    const result = calculateRouteWindowCapacity({ ...withoutConversion, demandQty: 3000 });
    assert.equal(result.operations[0].bestGoodCapacity > 0, true);
    assert.equal(result.bestGoodCapacity, undefined);
    assert.equal(result.actualGoodOutput, undefined);
    assert.equal(result.bestGap, undefined);
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
