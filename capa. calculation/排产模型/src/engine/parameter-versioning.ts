import type { OperationStationParameter } from "../domain/types.js";
import type { ParameterSuggestion } from "./parameter-calibration.js";
import { summarizeCycleSamples, type CycleSampleDraft } from "./cycle-samples.js";

export function localDateValue(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function selectEffectiveParameter(
  parameters: OperationStationParameter[], operationId: string, stationId: string,
  asOfDate = localDateValue(),
): OperationStationParameter | undefined {
  return parameters.filter(item => item.operationId === operationId && item.stationId === stationId
    && (item.approvalStatus === "approved" || item.approvalStatus === "effective")
    && (!item.effectiveFrom || item.effectiveFrom <= asOfDate))
    .reduce<OperationStationParameter | undefined>((selected, item) =>
      !selected || (item.effectiveFrom ?? "") >= (selected.effectiveFrom ?? "") ? item : selected, undefined);
}

export function createLocalBaselineParameter(input: {
  base?: OperationStationParameter;
  operationId: string;
  stationId: string;
  standardCycleSec: number;
  piecesPerCycle: number;
  performanceRate?: number;
  qualityRate?: number;
  parameterId: string;
  effectiveFrom: string;
}): OperationStationParameter {
  const { base, operationId, stationId, standardCycleSec, piecesPerCycle, parameterId, effectiveFrom } = input;
  const performanceRate = input.performanceRate ?? base?.performanceRate ?? 1;
  const qualityRate = input.qualityRate ?? base?.qualityRate ?? 1;
  if (!operationId || !stationId || !parameterId || parameterId === base?.parameterId
    || (base && (base.operationId !== operationId || base.stationId !== stationId))) {
    throw new Error("Invalid operation-station baseline identity");
  }
  if (!Number.isFinite(standardCycleSec) || standardCycleSec <= 0
    || !Number.isSafeInteger(piecesPerCycle) || piecesPerCycle <= 0) {
    throw new RangeError("CT and pieces per cycle must be positive");
  }
  if (!Number.isFinite(performanceRate) || performanceRate <= 0 || performanceRate > 1
    || !Number.isFinite(qualityRate) || qualityRate <= 0 || qualityRate > 1) {
    throw new RangeError("P and Q must be greater than 0 and at most 100%");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
    || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))
    || new Date(`${effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom) {
    throw new RangeError("Invalid effective date");
  }
  return {
    ...(base ? {
      setupRuleId: base.setupRuleId, breakRuleId: base.breakRuleId,
      maintenanceRuleId: base.maintenanceRuleId, plannedStopRuleId: base.plannedStopRuleId,
    } : {}), parameterId, operationId, stationId, standardCycleSec, piecesPerCycle,
    ...(base ? { supersedesParameterId: base.parameterId } : {}),
    performanceRate, qualityRate, parameterSource: "manual", approvalStatus: "approved", effectiveFrom,
  };
}

export function establishInitialLocalPreset(input: {
  operationId: string;
  stationId: string;
  existingParameters?: OperationStationParameter[];
  asOfDate?: string;
  standardCycleSec: number;
  piecesPerCycle: number;
  performanceRate: number;
  performanceReviewed: boolean;
  /** Required when P is not the 100% default. `performanceReviewed` alone is not enough. */
  performanceOverrideConfirmed?: boolean;
  samples: CycleSampleDraft;
  evidenceRef: string;
  parameterId: string;
  effectiveFrom: string;
}): OperationStationParameter {
  const existing = selectEffectiveParameter(
    input.existingParameters ?? [], input.operationId, input.stationId, input.asOfDate,
  );
  if (existing) throw new Error("An effective planned CT already exists");
  const summary = summarizeCycleSamples(input.samples);
  if (summary.validCount < 1 || summary.observedMeanSec === undefined || summary.legacyUnparsed || summary.legacyIssues.length) {
    throw new Error("Cycle samples are not ready for an initial preset");
  }
  if (!input.performanceReviewed) throw new Error("P must be explicitly reviewed against the confirmed CT");
  if (!input.evidenceRef.trim()) throw new Error("Sample evidence reference is required");
  const manualOverride = Math.abs(input.performanceRate - 1) > 1e-9;
  if (manualOverride && input.performanceOverrideConfirmed !== true) {
    throw new Error("A non-default P requires a separate override confirmation");
  }
  const created = createLocalBaselineParameter({
    operationId: input.operationId,
    stationId: input.stationId,
    standardCycleSec: input.standardCycleSec,
    piecesPerCycle: input.piecesPerCycle,
    performanceRate: input.performanceRate,
    parameterId: input.parameterId,
    effectiveFrom: input.effectiveFrom,
  });
  return {
    ...created,
    performanceInputSource: manualOverride ? "manualJudgement" : "defaultHundred",
    calibrationRefs: manualOverride
      ? [input.evidenceRef, "manual-p-override-confirmed:not-derived-from-time-window"]
      : [input.evidenceRef],
  };
}

export interface TimeWindowProduction {
  startMinute: number;
  endMinute: number;
  okQty: number;
  nokQty: number;
  piecesPerCycle: number;
}

export interface LinkedWindowPerformance {
  observedCycleSec: number;
  performanceRate: number;
  fasterThanCorrectedCt: boolean;
}

/** P = corrected CT / observed cycle of the same production intervals, capped at 100%. */
export function performanceAgainstCycle(
  standardCycleSec: number,
  production: TimeWindowProduction[],
): LinkedWindowPerformance | undefined {
  if (!Number.isFinite(standardCycleSec) || standardCycleSec <= 0) return undefined;
  const valid = production.filter(item => Number.isFinite(item.startMinute) && Number.isFinite(item.endMinute)
    && item.endMinute > item.startMinute
    && Number.isInteger(item.okQty) && item.okQty >= 0
    && Number.isInteger(item.nokQty) && item.nokQty >= 0
    && item.okQty + item.nokQty > 0
    && Number.isFinite(item.piecesPerCycle) && item.piecesPerCycle > 0);
  const minutes = valid.reduce((sum, item) => sum + item.endMinute - item.startMinute, 0);
  const cycles = valid.reduce((sum, item) => sum + (item.okQty + item.nokQty) / item.piecesPerCycle, 0);
  if (minutes <= 0 || cycles <= 0) return undefined;
  const observedCycleSec = minutes * 60 / cycles;
  const raw = standardCycleSec / observedCycleSec;
  return {
    observedCycleSec,
    performanceRate: Math.min(1, raw),
    fasterThanCorrectedCt: raw > 1 + 1e-9,
  };
}

export function correctPlannedCycleFromCheck(input: {
  operationId: string;
  stationId: string;
  existingParameters?: OperationStationParameter[];
  asOfDate?: string;
  standardCycleSec: number;
  ctConfirmed: boolean;
  samples: CycleSampleDraft;
  evidenceRef: string;
  parameterId: string;
  effectiveFrom: string;
  timeWindowProduction?: TimeWindowProduction[];
  windowEvidenceRef?: string;
}): OperationStationParameter {
  const existing = selectEffectiveParameter(
    input.existingParameters ?? [], input.operationId, input.stationId, input.asOfDate,
  );
  if (!existing || existing.standardCycleSec <= 0) throw new Error("No planned CT is available to correct");
  const summary = summarizeCycleSamples(input.samples);
  if (summary.validCount < 1 || summary.observedMeanSec === undefined || summary.legacyUnparsed || summary.legacyIssues.length) {
    throw new Error("Cycle samples are not ready to correct CT");
  }
  if (!input.ctConfirmed) throw new Error("CT correction requires explicit confirmation");
  if (!input.evidenceRef.trim()) throw new Error("Sample evidence reference is required");
  if (!Number.isFinite(input.standardCycleSec) || input.standardCycleSec <= 0) {
    throw new RangeError("Corrected CT must be positive");
  }
  if (Math.abs(input.standardCycleSec - existing.standardCycleSec) < 0.005) {
    throw new Error("The confirmed CT matches the current planned CT");
  }
  const linked = performanceAgainstCycle(input.standardCycleSec, input.timeWindowProduction ?? []);
  const created = createLocalBaselineParameter({
    base: existing,
    operationId: input.operationId,
    stationId: input.stationId,
    standardCycleSec: input.standardCycleSec,
    piecesPerCycle: existing.piecesPerCycle,
    performanceRate: linked?.performanceRate ?? existing.performanceRate,
    qualityRate: existing.qualityRate,
    parameterId: input.parameterId,
    effectiveFrom: input.effectiveFrom,
  });
  const calibrationRefs = [input.evidenceRef];
  if (linked && input.windowEvidenceRef?.trim()) calibrationRefs.push(input.windowEvidenceRef.trim());
  return { ...created, calibrationRefs };
}

export function publishParameterVersion(
  base: OperationStationParameter, confirmed: ParameterSuggestion[], effectiveFrom: string,
  parameterId: string,
): OperationStationParameter {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveFrom)
    || Number.isNaN(Date.parse(`${effectiveFrom}T00:00:00Z`))
    || new Date(`${effectiveFrom}T00:00:00Z`).toISOString().slice(0, 10) !== effectiveFrom) {
    throw new RangeError("Invalid effective date");
  }
  if (!parameterId.trim() || parameterId === base.parameterId || confirmed.length === 0) {
    throw new Error("A new version ID and confirmed CT/P/Q suggestions are required");
  }
  const values = new Map<ParameterSuggestion["target"], number>();
  const refs = new Set<string>();
  for (const item of confirmed) {
    if (!["standardCycleSec", "performanceRate", "qualityRate"].includes(item.target)
      || values.has(item.target) || !item.eligibleForConfirmation
      || !["approved", "effective"].includes(item.approvalStatus)
      || item.effectiveFrom !== effectiveFrom
      || item.operationId !== base.operationId || item.stationId !== base.stationId
      || item.targetStandardId !== base.parameterId
      || item.currentValue !== base[item.target as "standardCycleSec" | "performanceRate" | "qualityRate"]
      || !Number.isFinite(item.proposedValue)) {
      throw new Error("Suggestions must be current, locally confirmed, and share one effective date");
    }
    values.set(item.target, item.proposedValue);
    item.evidenceRefs.forEach(ref => refs.add(ref));
  }
  const ct = values.get("standardCycleSec") ?? base.standardCycleSec;
  const p = values.get("performanceRate") ?? base.performanceRate;
  const q = values.get("qualityRate") ?? base.qualityRate;
  if (ct <= 0 || p <= 0 || p > 1 || q <= 0 || q > 1) throw new RangeError("CT/P/Q values are outside valid ranges");
  if (ct !== base.standardCycleSec && !values.has("performanceRate")) {
    throw new Error("Changing CT requires a paired, recalculated P suggestion");
  }
  return {
    ...base, parameterId, supersedesParameterId: base.parameterId,
    calibrationRefs: [...refs], standardCycleSec: ct, performanceRate: p, qualityRate: q,
    parameterSource: "runRate", approvalStatus: effectiveFrom <= localDateValue() ? "effective" : "approved",
    effectiveFrom,
  };
}
