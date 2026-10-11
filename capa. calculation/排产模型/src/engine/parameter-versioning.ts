import type { OperationStationParameter } from "../domain/types.js";
import type { ParameterSuggestion } from "./parameter-calibration.js";

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
