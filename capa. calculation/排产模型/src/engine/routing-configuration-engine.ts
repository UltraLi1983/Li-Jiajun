import { validateProductRoutingMasterData, type RoutingMasterDataValidationResult } from "./routing-master-data-engine.js";
import { selectEffectiveParameter } from "./parameter-versioning.js";
import type {
  CapacityScenario,
  Operation,
  OperationStationAssignment,
  OperationStationParameter,
  Product,
  ProductRoute,
  StationGroup,
  StationMaster,
} from "../domain/types.js";

export type AssignmentPlanningStatus = "available" | "blocked" | "missingStation" | "missingParameter";

export interface StationAssignmentView {
  assignment: OperationStationAssignment;
  station?: StationMaster;
  stationGroup?: StationGroup;
  parameter?: OperationStationParameter;
  planningStatus: AssignmentPlanningStatus;
  messages: string[];
}

export interface OperationRoutingView {
  operation: Operation;
  assignments: StationAssignmentView[];
  messages: string[];
}

export interface ProductRoutingConfiguration {
  productId: string;
  product?: Product;
  route?: ProductRoute;
  masterDataValidation: RoutingMasterDataValidationResult;
  operations: OperationRoutingView[];
  messages: string[];
}

export function buildProductRoutingConfiguration(
  scenario: CapacityScenario,
  productId: string,
  routeId?: string,
): ProductRoutingConfiguration {
  const product = scenario.products?.find(item => item.productId === productId);
  const masterDataValidation = validateProductRoutingMasterData(scenario, productId, routeId);
  const messages: string[] = [];

  if (!product) {
    return {
      productId,
      masterDataValidation,
      operations: [],
      messages: [`${productId} does not exist in products`],
    };
  }

  const route = scenario.routes.find(item => routeMatchesProduct(item, product, routeId));
  if (!route) {
    return {
      productId,
      product,
      masterDataValidation,
      operations: [],
      messages: [`${productId} does not have a matching route`],
    };
  }

  const operations = [...route.operations]
    .sort((a, b) => a.sequence - b.sequence)
    .map(operation => buildOperationRoutingView(scenario, product, route, operation));

  if (!operations.length) messages.push(`${productId} route has no operations`);

  const result: ProductRoutingConfiguration = {
    productId,
    product,
    route,
    masterDataValidation,
    operations,
    messages,
  };
  return result;
}

function buildOperationRoutingView(
  scenario: CapacityScenario,
  product: Product,
  route: ProductRoute,
  operation: Operation,
): OperationRoutingView {
  const assignments = (scenario.operationStationAssignments ?? [])
    .filter(assignment => assignment.productId === product.productId
      && assignment.routeId === route.routeId
      && assignment.operationId === operation.operationId)
    .sort(compareAssignments)
    .map(assignment => buildStationAssignmentView(scenario, assignment));

  const messages: string[] = [];
  if (!assignments.length) {
    messages.push(`${operation.operationId} has no station assignment`);
  }
  if (assignments.length && !assignments.some(item => item.assignment.planningAllowed)) {
    messages.push(`${operation.operationId} has no planning-allowed station assignment`);
  }

  return {
    operation,
    assignments,
    messages,
  };
}

function buildStationAssignmentView(
  scenario: CapacityScenario,
  assignment: OperationStationAssignment,
): StationAssignmentView {
  const station = (scenario.stations ?? []).find(item => item.stationId === assignment.stationId);
  const stationGroup = station?.stationGroupId
    ? (scenario.stationGroups ?? []).find(item => item.stationGroupId === station.stationGroupId)
    : undefined;
  const parameter = selectEffectiveParameter(scenario.operationStationParameters ?? [], assignment.operationId, assignment.stationId);
  const messages: string[] = [];

  if (!station) messages.push(`${assignment.stationId} does not exist in station master`);
  if (!parameter && assignment.planningAllowed) {
    messages.push(`${assignment.operationId} on ${assignment.stationId} has no operation-station parameter`);
  }
  if (!assignment.planningAllowed) {
    messages.push(assignment.planningBlockerReason ?? `${assignment.assignmentId} is not planning allowed`);
  }
  if (assignment.customerApprovalRequired && assignment.approvalStatus !== "approved" && assignment.approvalStatus !== "effective") {
    messages.push(`${assignment.assignmentId} requires customer approval before planning`);
  }

  const result: StationAssignmentView = {
    assignment,
    planningStatus: resolvePlanningStatus(assignment, station, parameter),
    messages,
  };
  if (station) result.station = station;
  if (stationGroup) result.stationGroup = stationGroup;
  if (parameter) result.parameter = parameter;
  return result;
}

function resolvePlanningStatus(
  assignment: OperationStationAssignment,
  station: StationMaster | undefined,
  parameter: OperationStationParameter | undefined,
): AssignmentPlanningStatus {
  if (!station) return "missingStation";
  if (assignment.planningAllowed && !parameter) return "missingParameter";
  if (!assignment.planningAllowed) return "blocked";
  return "available";
}

function compareAssignments(a: OperationStationAssignment, b: OperationStationAssignment): number {
  const priorityA = a.priority ?? 999;
  const priorityB = b.priority ?? 999;
  if (priorityA !== priorityB) return priorityA - priorityB;
  return a.assignmentId.localeCompare(b.assignmentId);
}

function routeMatchesProduct(route: ProductRoute, product: Product, routeId?: string): boolean {
  if (routeId) return route.routeId === routeId && route.productId === product.productId;
  return product.routeId ? route.routeId === product.routeId : route.productId === product.productId;
}
