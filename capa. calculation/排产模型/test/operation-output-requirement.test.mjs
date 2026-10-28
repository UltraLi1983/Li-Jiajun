import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sampleScenario, resolveOperationOutputRequirement } from "../dist/index.js";
import { createLocalRouteCopy } from "../dist/engine/local-validation-route.js";

const scenario = () => structuredClone(sampleScenario);

describe("operation output units per finished product", () => {
  it("requires a confirmed local quantity for a copied route without Stage BOM", () => {
    const data = scenario();
    const route = createLocalRouteCopy(data, "route-a-housing-v1").route;
    const operation = route.operations[0];
    assert.equal(operation.requiredOutputUnitsPerFinishedProduct, undefined);
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "quantity_missing");
    operation.requiredOutputUnitsPerFinishedProduct = 2;
    operation.quantitySourceVersion = "sample-v1";
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "quantity_missing");
    operation.quantitySourceVersion = "local-1";
    const result = resolveOperationOutputRequirement(data, route, operation);
    assert.equal(result.unitsPerFinishedProduct, 2);
    assert.equal(result.source, "localValidation");
  });
  it("reads explicit local validation quantities from the product route", () => {
    const data = scenario();
    const route = data.routes.find(item => item.routeId === "route-a-housing-v1");
    const operation = route.operations.find(item => item.operationId === "op-a-10");
    const result = resolveOperationOutputRequirement(data, route, operation, "2026-10-09");
    assert.equal(result.unitsPerFinishedProduct, 1);
    assert.equal(result.outputItem, "A-machined-wip");
    assert.equal(result.source, "localValidation");
    assert.equal(result.version, "sample-v1");
    assert.equal(data.operationStationParameters.find(item => item.stationId === "OP20B").piecesPerCycle, 1);
  });

  it("uses the effective upstream Stage BOM quantity instead of a local fallback", () => {
    const data = scenario();
    const route = data.routes.find(item => item.routeId === "route-a-housing-v1");
    const operation = route.operations.find(item => item.operationId === "op-a-10");
    const bom = data.stageBoms.find(item => item.stageBomId === operation.outputStageBomId);
    bom.requiredOutputUnitsPerFinishedProduct = 2;
    bom.sourceVersion = "bom-v2";
    bom.effectiveFrom = "2026-10-01";
    assert.deepEqual(resolveOperationOutputRequirement(data, route, operation, "2026-10-09"), {
      operationId: "op-a-10", outputItem: "A-machined-wip", source: "stageBom",
      sourceRef: bom.stageBomId, version: "bom-v2", unitsPerFinishedProduct: 2,
    });
    assert.equal(resolveOperationOutputRequirement(data, route, operation, "2026-09-30").issue, "source_not_effective");
    bom.effectiveTo = "2026-10-09";
    assert.equal(resolveOperationOutputRequirement(data, route, operation, "2026-10-09", "2026-10-10").issue, "source_not_effective");
  });

  it("does not silently assume 1:1 for missing, invalid or mismatched source data", () => {
    const data = scenario();
    const route = data.routes.find(item => item.routeId === "route-a-housing-v1");
    const operation = route.operations.find(item => item.operationId === "op-a-10");
    delete operation.requiredOutputUnitsPerFinishedProduct;
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "quantity_missing");
    operation.requiredOutputUnitsPerFinishedProduct = 1.5;
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "quantity_invalid");
    data.stageBoms.find(item => item.stageBomId === operation.outputStageBomId).operationId = "op-a-20";
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "stage_bom_mismatch");
    operation.outputStageBomId = "missing";
    assert.equal(resolveOperationOutputRequirement(data, route, operation).issue, "stage_bom_missing");
  });
});
