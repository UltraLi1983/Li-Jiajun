import { validateProductRoutingMasterData } from "./routing-master-data-engine.js";
import { selectEffectiveParameter } from "./parameter-versioning.js";
import type {
  CapacityScenario,
  Operation,
  OperationStationAssignment,
  OperationStationParameter,
  Product,
} from "../domain/types.js";

export type ReadinessSeverity = "error" | "warning";
export type ReadinessIssueCode =
  | "product_missing"
  | "route_missing"
  | "route_master_invalid"
  | "operation_missing"
  | "assignment_missing"
  | "planning_allowed_assignment_missing"
  | "parameter_missing"
  | "invalid_cycle_time"
  | "invalid_pieces_per_cycle"
  | "batch_hu_policy_missing"
  | "backup_blocked";

export interface ReadinessIssue {
  severity: ReadinessSeverity;
  code: ReadinessIssueCode;
  message: string;
  productId: string;
  operationId?: string;
  stationId?: string;
  assignmentId?: string;
}

export interface ProductReadinessResult {
  productId: string;
  ready: boolean;
  issues: ReadinessIssue[];
  operationsChecked: number;
  planningAllowedAssignments: OperationStationAssignment[];
  blockedBackupAssignments: OperationStationAssignment[];
}

export function checkProductReadiness(scenario: CapacityScenario, productId: string): ProductReadinessResult {
  const issues: ReadinessIssue[] = [];
  const product = scenario.products?.find(item => item.productId === productId);
  const planningAllowedAssignments: OperationStationAssignment[] = [];
  const blockedBackupAssignments: OperationStationAssignment[] = [];

  if (!product) {
    issues.push({ severity: "error", code: "product_missing", productId, message: `${productId} does not exist in products` });
    return buildResult(productId, issues, [], planningAllowedAssignments, blockedBackupAssignments);
  }

  const route = scenario.routes.find(item => routeMatchesProduct(item.routeId, item.productId, product));
  if (!route) {
    issues.push({ severity: "error", code: "route_missing", productId, message: `${productId} does not have a matching route` });
    return buildResult(productId, issues, [], planningAllowedAssignments, blockedBackupAssignments);
  }

  const routeMasterData = validateProductRoutingMasterData(scenario, productId, route.routeId);
  for (const issue of routeMasterData.issues) {
    issues.push({
      severity: issue.severity,
      code: "route_master_invalid",
      productId,
      ...(issue.operationId ? { operationId: issue.operationId } : {}),
      message: issue.message,
    });
  }

  if (!route.operations.length) {
    issues.push({ severity: "error", code: "operation_missing", productId, message: `${productId} route has no operations` });
    return buildResult(productId, issues, [], planningAllowedAssignments, blockedBackupAssignments);
  }

  for (const operation of route.operations) {
    const assignments = (scenario.operationStationAssignments ?? []).filter(
      assignment => assignment.productId === productId && assignment.operationId === operation.operationId,
    );

    if (!assignments.length) {
      issues.push({
        severity: "error",
        code: "assignment_missing",
        productId,
        operationId: operation.operationId,
        message: `${operation.operationId} has no station assignment`,
      });
      continue;
    }

    const allowed = assignments.filter(assignment => assignment.planningAllowed);
    planningAllowedAssignments.push(...allowed);
    blockedBackupAssignments.push(...assignments.filter(isBlockedBackupAssignment));

    for (const assignment of assignments) {
      if (isBlockedBackupAssignment(assignment)) {
        issues.push({
          severity: "warning",
          code: "backup_blocked",
          productId,
          operationId: operation.operationId,
          stationId: assignment.stationId,
          assignmentId: assignment.assignmentId,
          message: `${assignment.assignmentId} is backup but not planning allowed: ${assignment.planningBlockerReason ?? assignment.approvalStatus}`,
        });
      }
    }

    if (!allowed.length) {
      issues.push({
        severity: "error",
        code: "planning_allowed_assignment_missing",
        productId,
        operationId: operation.operationId,
        message: `${operation.operationId} has no planning-allowed station assignment`,
      });
      continue;
    }

    for (const assignment of allowed) {
      const parameter = findOperationStationParameter(scenario.operationStationParameters ?? [], operation, assignment.stationId);
      if (!parameter) {
        issues.push({
          severity: "error",
          code: "parameter_missing",
          productId,
          operationId: operation.operationId,
          stationId: assignment.stationId,
          assignmentId: assignment.assignmentId,
          message: `${operation.operationId} on ${assignment.stationId} has no operation-station parameter`,
        });
        continue;
      }

      if (parameter.standardCycleSec <= 0) {
        issues.push({
          severity: "error",
          code: "invalid_cycle_time",
          productId,
          operationId: operation.operationId,
          stationId: assignment.stationId,
          assignmentId: assignment.assignmentId,
          message: `${parameter.parameterId} standardCycleSec must be greater than 0`,
        });
      }

      if (parameter.piecesPerCycle <= 0) {
        issues.push({
          severity: "error",
          code: "invalid_pieces_per_cycle",
          productId,
          operationId: operation.operationId,
          stationId: assignment.stationId,
          assignmentId: assignment.assignmentId,
          message: `${parameter.parameterId} piecesPerCycle must be greater than 0`,
        });
      }
    }

    const hasHuPolicy = (scenario.batchHUPolicies ?? []).some(
      policy => policy.productId === productId && policy.operationId === operation.operationId,
    );
    if (!hasHuPolicy) {
      issues.push({
        severity: "warning",
        code: "batch_hu_policy_missing",
        productId,
        operationId: operation.operationId,
        message: `${operation.operationId} has no batch HU policy; capacity analysis can continue but planning batch rules are incomplete`,
      });
    }
  }

  return buildResult(productId, issues, route.operations, planningAllowedAssignments, blockedBackupAssignments);
}

function routeMatchesProduct(routeId: string | undefined, productId: string, product: Product): boolean {
  return product.routeId ? routeId === product.routeId : productId === product.productId;
}

function findOperationStationParameter(
  parameters: OperationStationParameter[],
  operation: Operation,
  stationId: string,
): OperationStationParameter | undefined {
  return selectEffectiveParameter(parameters, operation.operationId, stationId);
}

function isBlockedBackupAssignment(assignment: OperationStationAssignment): boolean {
  return assignment.role === "backup" && !assignment.planningAllowed;
}

function buildResult(
  productId: string,
  issues: ReadinessIssue[],
  operations: Operation[],
  planningAllowedAssignments: OperationStationAssignment[],
  blockedBackupAssignments: OperationStationAssignment[],
): ProductReadinessResult {
  return {
    productId,
    ready: !issues.some(issue => issue.severity === "error"),
    issues,
    operationsChecked: operations.length,
    planningAllowedAssignments,
    blockedBackupAssignments,
  };
}
