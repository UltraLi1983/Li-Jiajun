import type { CapacityScenario, Operation, ProductRoute } from "../domain/types.js";

export type RoutingMasterDataIssueCode =
  | "route_missing"
  | "route_not_released"
  | "route_not_effective"
  | "route_has_no_operations"
  | "operation_sequence_invalid"
  | "operation_duplicate"
  | "process_master_missing"
  | "process_master_not_released"
  | "stage_bom_missing"
  | "stage_bom_mismatch"
  | "wip_state_missing"
  | "wip_state_mismatch";

export interface RoutingMasterDataIssue {
  severity: "error" | "warning";
  code: RoutingMasterDataIssueCode;
  routeId?: string;
  operationId?: string;
  message: string;
}

export interface RoutingMasterDataValidationResult {
  valid: boolean;
  formalReady: boolean;
  route?: ProductRoute;
  issues: RoutingMasterDataIssue[];
}

export interface RoutingMasterDataValidationOptions {
  asOfDate?: string;
  requireReleased?: boolean;
}

export function validateProductRoutingMasterData(
  scenario: CapacityScenario,
  productId: string,
  routeId?: string,
  options: RoutingMasterDataValidationOptions = {},
): RoutingMasterDataValidationResult {
  const issues: RoutingMasterDataIssue[] = [];
  const route = scenario.routes.find(item => item.productId === productId && (!routeId || item.routeId === routeId));
  const requireReleased = options.requireReleased ?? true;

  if (!route) {
    return {
      valid: false,
      formalReady: false,
      issues: [{ severity: "error", code: "route_missing", message: `${productId} has no matching product route` }],
    };
  }

  if (requireReleased && route.status !== "released") {
    issues.push({ severity: "error", code: "route_not_released", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} is not released` });
  }
  if (isOutsideEffectivePeriod(route, options.asOfDate)) {
    issues.push({ severity: "error", code: "route_not_effective", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} is not effective on ${options.asOfDate}` });
  }
  if (!route.operations.length) {
    issues.push({ severity: "error", code: "route_has_no_operations", routeId: route.routeId ?? route.productId, message: `${route.routeId ?? productId} has no operations` });
  }

  validateOperationSequence(route, issues);
  for (const operation of route.operations) validateOperationReferences(scenario, route, operation, issues);

  return {
    valid: !issues.some(issue => issue.severity === "error"),
    formalReady: !issues.some(issue => issue.severity === "error"),
    route,
    issues,
  };
}

function validateOperationSequence(route: ProductRoute, issues: RoutingMasterDataIssue[]): void {
  const seenIds = new Set<string>();
  const seenSequences = new Set<number>();
  for (const operation of route.operations) {
    if (seenIds.has(operation.operationId)) {
      issues.push({ severity: "error", code: "operation_duplicate", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} is duplicated in route` });
    }
    if (seenSequences.has(operation.sequence)) {
      issues.push({ severity: "error", code: "operation_sequence_invalid", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `operation sequence ${operation.sequence} is duplicated` });
    }
    if (!Number.isInteger(operation.sequence) || operation.sequence <= 0) {
      issues.push({ severity: "error", code: "operation_sequence_invalid", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} has an invalid operation sequence` });
    }
    seenIds.add(operation.operationId);
    seenSequences.add(operation.sequence);
  }
}

function validateOperationReferences(
  scenario: CapacityScenario,
  route: ProductRoute,
  operation: Operation,
  issues: RoutingMasterDataIssue[],
): void {
  if (!operation.processId) {
    issues.push({ severity: "error", code: "process_master_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} has no ProcessMaster reference` });
  } else {
    const process = scenario.processMasters?.find(item => item.processId === operation.processId);
    if (!process) {
      issues.push({ severity: "error", code: "process_master_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} references missing ProcessMaster ${operation.processId}` });
    } else if (process.status !== "released") {
      issues.push({ severity: "error", code: "process_master_not_released", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} references ProcessMaster ${operation.processId}, which is not released` });
    }
  }

  const predecessorOperationId = route.operations
    .filter(item => item.sequence < operation.sequence)
    .sort((a, b) => b.sequence - a.sequence)[0]?.operationId;
  const stageBomReferences = [
    { stageBomId: operation.inputStageBomId, expectedOperationId: predecessorOperationId },
    { stageBomId: operation.outputStageBomId, expectedOperationId: operation.operationId },
  ];
  for (const { stageBomId, expectedOperationId } of stageBomReferences) {
    if (!stageBomId) continue;
    const stageBom = scenario.stageBoms?.find(item => item.stageBomId === stageBomId);
    if (!stageBom) {
      issues.push({ severity: "error", code: "stage_bom_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `${operation.operationId} references missing Stage BOM ${stageBomId}` });
      continue;
    }
    if (stageBom.productId !== route.productId || stageBom.routeId !== route.routeId || stageBom.operationId !== expectedOperationId) {
      issues.push({ severity: "error", code: "stage_bom_mismatch", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `Stage BOM ${stageBomId} does not belong to the expected ${route.productId}/${route.routeId}/${expectedOperationId ?? "stage"}` });
    }
    const wipState = scenario.wipStates?.find(item => item.wipStateId === stageBom.wipStateId);
    if (!wipState) {
      issues.push({ severity: "error", code: "wip_state_missing", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `Stage BOM ${stageBomId} references missing WIP state ${stageBom.wipStateId}` });
    } else if (wipState.productId !== route.productId || wipState.routeId !== route.routeId || wipState.operationId !== stageBom.operationId) {
      issues.push({ severity: "error", code: "wip_state_mismatch", routeId: route.routeId ?? route.productId, operationId: operation.operationId, message: `WIP state ${wipState.wipStateId} does not belong to Stage BOM ${stageBomId}` });
    }
  }
}

function isOutsideEffectivePeriod(route: ProductRoute, asOfDate?: string): boolean {
  if (!asOfDate || (!route.effectiveFrom && !route.effectiveTo)) return false;
  if (route.effectiveFrom && asOfDate < route.effectiveFrom) return true;
  if (route.effectiveTo && asOfDate > route.effectiveTo) return true;
  return false;
}
