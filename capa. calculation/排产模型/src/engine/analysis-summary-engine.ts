import type { CapacityScenario, StationCapacityResult } from "../domain/types.js";
import { checkBatchHUCompliance, type BatchHUCheckResult } from "./batch-hu-engine.js";
import { calculateCapacityScenario } from "./capacity-engine.js";
import {
  calculateRequiredCapacityShare,
  evaluateCapacityShare,
  findCapacityShareProfile,
  type CapacityShareEvaluationInput,
  type CapacityShareEvaluationResult,
  type RequiredShareBasis,
} from "./capacity-share-engine.js";
import { checkProductReadiness, type ProductReadinessResult } from "./readiness-engine.js";
import { selectEffectiveParameter } from "./parameter-versioning.js";

export interface CapacityAnalysisPreflightInput {
  productId: string;
  routeId?: string;
  asOfDate?: string;
  throughDate?: string;
  availableMinutesByStation?: Record<string, number>;
  /** weekLedger is the only basis treated as the current route schedule. Other supplied minutes stay demo sample. */
  availableMinutesBasis?: "weekLedger" | "demoSample";
  plannedQuantityByOperation?: Record<string, number>;
}

export interface CapacityAnalysisPreflightResult {
  productId: string;
  ready: boolean;
  readiness: ProductReadinessResult;
  capacityResults: StationCapacityResult[];
  shareEvaluations: CapacityShareEvaluationResult[];
  batchChecks: BatchHUCheckResult[];
  blockers: string[];
  warnings: string[];
}

export function runCapacityAnalysisPreflight(
  scenario: CapacityScenario,
  input: CapacityAnalysisPreflightInput,
): CapacityAnalysisPreflightResult {
  const readiness = checkProductReadiness(scenario, input.productId, input.routeId, input.asOfDate, input.throughDate);
  const capacityResults = calculateCapacityScenario(scenario);
  const shareEvaluations = evaluatePlanningAllowedShares(scenario, input);
  const batchChecks = checkPlannedBatchQuantities(scenario, input);

  const blockers = [
    ...readiness.issues.filter(issue => issue.severity === "error").map(issue => issue.message),
    ...batchChecks.filter(check => check.status === "invalid").map(check => check.message),
  ];

  const warnings = [
    ...readiness.issues.filter(issue => issue.severity === "warning").map(issue => issue.message),
    ...shareEvaluations.flatMap(evaluation => evaluation.risks
      .filter(risk => risk.code === "required_exceeds_ceiling").map(risk => risk.message)),
    ...batchChecks.filter(check => check.status === "needsApproval").map(check => check.message),
  ];

  return {
    productId: input.productId,
    ready: readiness.ready && blockers.length === 0,
    readiness,
    capacityResults,
    shareEvaluations,
    batchChecks,
    blockers,
    warnings,
  };
}

function evaluatePlanningAllowedShares(
  scenario: CapacityScenario,
  input: CapacityAnalysisPreflightInput,
): CapacityShareEvaluationResult[] {
  const evaluations: CapacityShareEvaluationResult[] = [];
  const evaluatedKeys = new Set<string>();
  const assignments = (scenario.operationStationAssignments ?? []).filter(
    assignment => assignment.productId === input.productId && assignment.planningAllowed
      && (!input.routeId || assignment.routeId === input.routeId),
  );
  const routeKeys = new Set(assignments.map(assignment => buildShareKey(input.productId, assignment.operationId, assignment.stationId)));

  for (const assignment of assignments) {
    const key = buildShareKey(input.productId, assignment.operationId, assignment.stationId);
    const availableMinutes = input.availableMinutesByStation?.[assignment.stationId];
    const profile = findCapacityShareProfile(scenario, input.productId, assignment.operationId, assignment.stationId);

    if (availableMinutes !== undefined && availableMinutes > 0) {
      if (!selectEffectiveParameter(scenario.operationStationParameters ?? [], assignment.operationId, assignment.stationId)) continue;
      const required = calculateRequiredCapacityShare(scenario, {
        productId: input.productId,
        operationId: assignment.operationId,
        stationId: assignment.stationId,
        availableMinutes,
      });
      const evaluationInput: CapacityShareEvaluationInput = {
        productId: input.productId,
        operationId: assignment.operationId,
        stationId: assignment.stationId,
        requiredCapacityShare: required.requiredCapacityShare,
      };
      evaluationInput.requestedCapacityShare = assignment.plannedShare ?? profile?.requestedCapacityShare ?? 1;
      if (profile?.actualCapacityShare !== undefined) {
        evaluationInput.actualCapacityShare = profile.actualCapacityShare;
      }
      evaluations.push(withShareBasis(evaluateCapacityShare(scenario, evaluationInput), input.availableMinutesBasis === "weekLedger" ? "weekLedger" : "demoSample"));
      evaluatedKeys.add(key);
      continue;
    }

    if (profile) {
      const basis: RequiredShareBasis = profile.requiredCapacityShare !== undefined || profile.actualCapacityShare !== undefined
        ? "storedProfile" : "unavailable";
      evaluations.push(withShareBasis(evaluateCapacityShare(scenario, {
        productId: input.productId,
        operationId: assignment.operationId,
        stationId: assignment.stationId,
        requestedCapacityShare: assignment.plannedShare ?? profile.requestedCapacityShare ?? 1,
      }), basis));
      evaluatedKeys.add(key);
    }
  }

  for (const profile of scenario.capacityShareProfiles ?? []) {
    if (profile.productId !== input.productId) continue;
    const key = buildShareKey(profile.productId, profile.operationId, profile.stationId);
    if (input.routeId && !routeKeys.has(key)) continue;
    if (evaluatedKeys.has(key)) continue;
    const basis: RequiredShareBasis = profile.requiredCapacityShare !== undefined || profile.actualCapacityShare !== undefined
      ? "storedProfile" : "unavailable";
    evaluations.push(withShareBasis(evaluateCapacityShare(scenario, {
      productId: profile.productId,
      operationId: profile.operationId,
      stationId: profile.stationId,
    }), basis));
    evaluatedKeys.add(key);
  }

  return evaluations;
}

function checkPlannedBatchQuantities(
  scenario: CapacityScenario,
  input: CapacityAnalysisPreflightInput,
): BatchHUCheckResult[] {
  const checks: BatchHUCheckResult[] = [];
  for (const [operationId, quantity] of Object.entries(input.plannedQuantityByOperation ?? {})) {
    checks.push(checkBatchHUCompliance(scenario, {
      productId: input.productId,
      operationId,
      quantity,
    }));
  }
  return checks;
}

function withShareBasis(result: CapacityShareEvaluationResult, basis: RequiredShareBasis): CapacityShareEvaluationResult {
  return { ...result, requiredShareBasis: basis };
}

function buildShareKey(productId: string, operationId: string, stationId: string): string {
  return `${productId}::${operationId}::${stationId}`;
}
