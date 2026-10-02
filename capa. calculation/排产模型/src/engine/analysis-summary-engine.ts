import type { CapacityScenario, StationCapacityResult } from "../domain/types.js";
import { checkBatchHUCompliance, type BatchHUCheckResult } from "./batch-hu-engine.js";
import { calculateCapacityScenario } from "./capacity-engine.js";
import {
  calculateRequiredCapacityShare,
  evaluateCapacityShare,
  findCapacityShareProfile,
  type CapacityShareEvaluationInput,
  type CapacityShareEvaluationResult,
} from "./capacity-share-engine.js";
import { checkProductReadiness, type ProductReadinessResult } from "./readiness-engine.js";

export interface CapacityAnalysisPreflightInput {
  productId: string;
  availableMinutesByStation?: Record<string, number>;
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
  const readiness = checkProductReadiness(scenario, input.productId);
  const capacityResults = calculateCapacityScenario(scenario);
  const shareEvaluations = evaluatePlanningAllowedShares(scenario, input);
  const batchChecks = checkPlannedBatchQuantities(scenario, input);

  const blockers = [
    ...readiness.issues.filter(issue => issue.severity === "error").map(issue => issue.message),
    ...batchChecks.filter(check => check.status === "invalid").map(check => check.message),
  ];

  const warnings = [
    ...readiness.issues.filter(issue => issue.severity === "warning").map(issue => issue.message),
    ...shareEvaluations.flatMap(evaluation => evaluation.risks.map(risk => risk.message)),
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
    assignment => assignment.productId === input.productId && assignment.planningAllowed,
  );

  for (const assignment of assignments) {
    const key = buildShareKey(input.productId, assignment.operationId, assignment.stationId);
    const availableMinutes = input.availableMinutesByStation?.[assignment.stationId];
    const profile = findCapacityShareProfile(scenario, input.productId, assignment.operationId, assignment.stationId);

    if (availableMinutes !== undefined && availableMinutes > 0) {
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
      evaluations.push(evaluateCapacityShare(scenario, evaluationInput));
      evaluatedKeys.add(key);
      continue;
    }

    if (profile) {
      evaluations.push(evaluateCapacityShare(scenario, {
        productId: input.productId,
        operationId: assignment.operationId,
        stationId: assignment.stationId,
        requestedCapacityShare: assignment.plannedShare ?? profile.requestedCapacityShare ?? 1,
      }));
      evaluatedKeys.add(key);
    }
  }

  for (const profile of scenario.capacityShareProfiles ?? []) {
    if (profile.productId !== input.productId) continue;
    const key = buildShareKey(profile.productId, profile.operationId, profile.stationId);
    if (evaluatedKeys.has(key)) continue;
    evaluations.push(evaluateCapacityShare(scenario, {
      productId: profile.productId,
      operationId: profile.operationId,
      stationId: profile.stationId,
    }));
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

function buildShareKey(productId: string, operationId: string, stationId: string): string {
  return `${productId}::${operationId}::${stationId}`;
}
