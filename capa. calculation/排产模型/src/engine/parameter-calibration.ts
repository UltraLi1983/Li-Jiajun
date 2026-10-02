import type { EventKind, OperationStationParameter, TimelineEvent } from "../domain/types.js";
import type { RnrEvidenceResult } from "./rnr-evidence.js";
import type { RnrSpeedResult } from "./rnr-reconciliation.js";

export type CalibrationTarget = "setupMinutes" | "breakMinutes" | "maintenanceMinutes"
  | "plannedStopMinutes" | "standardCycleSec" | "performanceRate" | "qualityRate";
export type CalibrationUnit = "minutes" | "seconds" | "rate";
export type CalibrationStatus = "draft" | "approved" | "effective";

export interface ParameterSuggestion {
  suggestionId: string;
  target: CalibrationTarget;
  targetStandardId: string;
  productId: string;
  operationId: string;
  stationId: string;
  currentValue: number;
  proposedValue: number;
  unit: CalibrationUnit;
  evidenceRefs: string[];
  approvalStatus: CalibrationStatus;
  eligibleForConfirmation: boolean;
  effectiveFrom?: string;
  approvedBy?: string;
}

export interface CalibrationActualEvent extends TimelineEvent {
  okQty?: number;
  nokQty?: number;
}

export interface ParameterSuggestionInput {
  productId: string;
  operationId: string;
  stationId: string;
  planned: TimelineEvent[];
  actual: CalibrationActualEvent[];
  parameter?: OperationStationParameter;
  cycleSamplesSec: number[];
  targetSampleCount: number;
  speed: RnrSpeedResult;
  evidence: RnrEvidenceResult;
}

const plannedKinds: { kind: EventKind; target: CalibrationTarget }[] = [
  { kind: "setup", target: "setupMinutes" },
  { kind: "break", target: "breakMinutes" },
  { kind: "maintenance", target: "maintenanceMinutes" },
  { kind: "plannedStop", target: "plannedStopMinutes" },
];
const publishableTargets: CalibrationTarget[] = ["standardCycleSec", "performanceRate", "qualityRate"];

export function buildParameterSuggestions(input: ParameterSuggestionInput): ParameterSuggestion[] {
  const { productId, operationId, stationId, planned, actual, parameter, speed, evidence } = input;
  const suggestions: ParameterSuggestion[] = [];
  const add = (target: CalibrationTarget, targetStandardId: string, currentValue: number,
    proposedValue: number, unit: CalibrationUnit, evidenceRefs: string[]): void => {
    if (!Number.isFinite(currentValue) || !Number.isFinite(proposedValue) || !evidenceRefs.length) return;
    suggestions.push({
      suggestionId: `${productId}:${operationId}:${stationId}:${target}`,
      target, targetStandardId, productId, operationId, stationId,
      currentValue, proposedValue, unit, evidenceRefs,
      approvalStatus: "draft", eligibleForConfirmation: evidence.readyForCalculation && publishableTargets.includes(target),
    });
  };

  for (const { kind, target } of plannedKinds) {
    const plannedEvents = planned.filter(event => event.kind === kind);
    const actualEvents = actual.filter(event => event.kind === kind);
    if (!plannedEvents.length || !actualEvents.length) continue;
    add(target, `planned-window:${stationId}:${kind}`,
      duration(plannedEvents), duration(actualEvents), "minutes",
      [...plannedEvents, ...actualEvents].map(event => event.id));
  }

  if (!parameter) return suggestions;
  const verifiedCycle = input.targetSampleCount > 0
    && input.cycleSamplesSec.length >= input.targetSampleCount
    && input.cycleSamplesSec.every(value => Number.isFinite(value) && value > 0);
  const production = actual.filter(event => event.kind === "production");
  const productionRefs = production.map(event => event.id);
  if (verifiedCycle) {
    const observedCycle = input.cycleSamplesSec.reduce((sum, value) => sum + value, 0) / input.cycleSamplesSec.length;
    add("standardCycleSec", parameter.parameterId, parameter.standardCycleSec,
      observedCycle, "seconds", [`cycle-check:${productId}:${operationId}:${stationId}`]);
  }

  if (verifiedCycle && speed.readyForCalibration && productionRefs.length) {
    const productionMinutes = duration(production);
    const effectiveMinutes = productionMinutes - speed.inferredSaLossMinutes;
    if (effectiveMinutes > 0) {
      const observedPerformance = Math.max(0, Math.min(1,
        (effectiveMinutes - speed.performanceLossMinutes) / effectiveMinutes));
      add("performanceRate", parameter.parameterId, parameter.performanceRate,
        observedPerformance, "rate", productionRefs);
    }
  }

  const okQty = production.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
  const nokQty = production.reduce((sum, event) => sum + (event.nokQty ?? 0), 0);
  if (okQty + nokQty > 0) {
    add("qualityRate", parameter.parameterId, parameter.qualityRate,
      okQty / (okQty + nokQty), "rate", productionRefs);
  }
  return suggestions;
}

export function confirmParameterSuggestion(
  suggestion: ParameterSuggestion, effectiveFrom: string, asOfDate: string, approvedBy: string,
): ParameterSuggestion {
  if (!publishableTargets.includes(suggestion.target)) {
    throw new Error("Only CT/P/Q suggestions can enter the parameter confirmation flow");
  }
  if (!suggestion.eligibleForConfirmation) throw new Error("Evidence is not ready for parameter confirmation");
  if (!isValidDate(effectiveFrom) || !isValidDate(asOfDate) || !approvedBy.trim()) {
    throw new RangeError("Effective date and approver are required");
  }
  return {
    ...suggestion,
    approvalStatus: effectiveFrom <= asOfDate ? "effective" : "approved",
    effectiveFrom, approvedBy: approvedBy.trim(),
  };
}

export function effectiveParameterSuggestions(suggestions: ParameterSuggestion[], asOfDate: string): ParameterSuggestion[] {
  return suggestions.filter(item => (
    (item.approvalStatus === "approved" || item.approvalStatus === "effective")
    && item.effectiveFrom !== undefined && item.effectiveFrom <= asOfDate
  ));
}

function duration(events: TimelineEvent[]): number {
  return events.reduce((sum, event) => sum + event.endMinute - event.startMinute, 0);
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
