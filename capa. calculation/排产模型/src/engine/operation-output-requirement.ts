import type { CapacityScenario, Operation, ProductRoute } from "../domain/types.js";
import { isLocalDraftRoute } from "./local-validation-route.js";

export interface OperationOutputRequirement {
  operationId: string;
  outputItem?: string;
  unitsPerFinishedProduct?: number;
  source?: "stageBom" | "localValidation";
  sourceRef?: string;
  version?: string;
  issue?: "stage_bom_missing" | "stage_bom_mismatch" | "source_not_effective" | "quantity_missing" | "quantity_invalid";
}

export function resolveOperationOutputRequirement(
  scenario: CapacityScenario, route: ProductRoute, operation: Operation, asOfDate?: string, throughDate?: string,
): OperationOutputRequirement {
  const result: OperationOutputRequirement = { operationId: operation.operationId };
  const stageBom = scenario.stageBoms?.find(item => item.stageBomId === operation.outputStageBomId);
  if (!stageBom) {
    if (isLocalDraftRoute(route)) return resolveLocalQuantity(result, route, operation);
    result.issue = "stage_bom_missing";
    return result;
  }
  result.outputItem = stageBom.outputItem;
  if (stageBom.productId !== route.productId || stageBom.routeId !== route.routeId
    || stageBom.operationId !== operation.operationId) {
    result.issue = "stage_bom_mismatch";
    return result;
  }
  if (stageBom.requiredOutputUnitsPerFinishedProduct !== undefined) {
    result.source = "stageBom";
    result.sourceRef = stageBom.stageBomId;
    if (stageBom.sourceVersion) result.version = stageBom.sourceVersion;
    if ((asOfDate && stageBom.effectiveFrom && asOfDate < stageBom.effectiveFrom)
      || (throughDate && stageBom.effectiveTo && throughDate > stageBom.effectiveTo)
      || (asOfDate && stageBom.effectiveTo && asOfDate > stageBom.effectiveTo)) {
      result.issue = "source_not_effective";
      return result;
    }
    if (!Number.isSafeInteger(stageBom.requiredOutputUnitsPerFinishedProduct)
      || stageBom.requiredOutputUnitsPerFinishedProduct <= 0) {
      result.issue = "quantity_invalid";
      return result;
    }
    result.unitsPerFinishedProduct = stageBom.requiredOutputUnitsPerFinishedProduct;
    return result;
  }
  return resolveLocalQuantity(result, route, operation);
}

function resolveLocalQuantity(result: OperationOutputRequirement, route: ProductRoute, operation: Operation): OperationOutputRequirement {
  if (operation.requiredOutputUnitsPerFinishedProduct === undefined
    || (isLocalDraftRoute(route) && !operation.quantitySourceVersion?.startsWith("local-"))) {
    result.issue = "quantity_missing";
    return result;
  }
  if (!Number.isSafeInteger(operation.requiredOutputUnitsPerFinishedProduct)
    || operation.requiredOutputUnitsPerFinishedProduct <= 0) {
    result.issue = "quantity_invalid";
    return result;
  }
  result.unitsPerFinishedProduct = operation.requiredOutputUnitsPerFinishedProduct;
  result.source = "localValidation";
  result.sourceRef = `${route.routeId ?? route.productId}:${operation.operationId}`;
  if (operation.quantitySourceVersion) result.version = operation.quantitySourceVersion;
  return result;
}
