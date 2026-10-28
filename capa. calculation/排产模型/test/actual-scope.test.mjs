import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { intervalCoveredByShifts, standardSaShiftIntervals } from "../dist/engine/standard-sa-day.js";
import { actualScopeKeyForRoute, parseActualScopeKey, planScopeKeyForRoute } from "../dist/ui/actual-scope.js";

describe("R&R actual scope", () => {
  it("resolves the selected station from a route-scoped key", () => {
    assert.deepEqual(parseActualScopeKey("local-route-a-housing-v1-1::A-Housing::OP10::OP10"), {
      productId: "A-Housing", operationId: "OP10", stationId: "OP10",
    });
  });

  it("keeps legacy three-part keys compatible", () => {
    assert.deepEqual(parseActualScopeKey("A-Housing::OP10::OP10"), {
      productId: "A-Housing", operationId: "OP10", stationId: "OP10",
    });
    assert.deepEqual(parseActualScopeKey("invalid"), { productId: "", operationId: "", stationId: "" });
  });

  it("restores OP20 records under the same route-scoped keys used by the route overview", () => {
    const routeId = "local-route-a-housing-v1-1";
    const operationId = `${routeId}--op-a-10`;
    assert.equal(planScopeKeyForRoute("A-Housing", "OP20A", routeId), `${routeId}::A-Housing::OP20A`);
    assert.equal(actualScopeKeyForRoute("A-Housing", operationId, "OP20A", routeId), `${routeId}::A-Housing::${operationId}::OP20A`);
    assert.equal(actualScopeKeyForRoute("A-Housing", operationId, "OP20B", routeId), `${routeId}::A-Housing::${operationId}::OP20B`);
    assert.equal(planScopeKeyForRoute("A-Housing", "OP20A"), "A-Housing::OP20A");
    assert.equal(actualScopeKeyForRoute("A-Housing", "op-a-10", "OP20A"), "A-Housing::op-a-10::OP20A");
  });

  it("accepts a 19:30-20:50 actual interval in the station's two-shift SA window", () => {
    const schedule = { startMinute: 510, shiftMinutes: 720, shiftsPerDay: 2, dayCount: 1 };
    assert.equal(intervalCoveredByShifts(1170, 1250, standardSaShiftIntervals(schedule)), true);
  });
});
