import type { OperationStationParameter } from "../domain/types.js";
import { selectEffectiveParameter } from "./parameter-versioning.js";

export interface CapacityDayInput {
  date: string;
  workingDay: boolean;
  stale: boolean;
  bestCaseProductionMinutes: number;
  mostLikelyProductionMinutes: number;
}

export interface CapacityDayResult {
  date: string;
  workingDay: boolean;
  status: "calculated" | "off" | "blocked";
  reason?: string;
  parameterId?: string;
  effectiveFrom?: string;
  standardCycleSec?: number;
  piecesPerCycle?: number;
  performanceRate?: number;
  qualityRate?: number;
  bestCaseMinutes: number;
  mostLikelyMinutes: number;
  bestCaseGoodRaw: number;
  mostLikelyGoodRaw: number;
}

export interface PeriodCapacityResult {
  days: CapacityDayResult[];
  calculable: boolean;
  reason?: string;
  parameterIds: string[];
  bestCaseMinutes: number;
  mostLikelyMinutes: number;
  bestCaseGoodRaw: number;
  mostLikelyGoodRaw: number;
  bestCaseGoodPieces?: number;
  mostLikelyGoodPieces?: number;
  extraChangeoverMinutes: number;
  extraChangeoverGoodLossRaw: number;
}

export function theoreticalPieces(minutes: number, parameter: Pick<OperationStationParameter, "standardCycleSec" | "piecesPerCycle">): number {
  return Math.max(0, minutes) * 60 / parameter.standardCycleSec * parameter.piecesPerCycle;
}

export function goodPieces(minutes: number, parameter: Pick<OperationStationParameter, "standardCycleSec" | "piecesPerCycle" | "performanceRate" | "qualityRate">): number {
  return theoreticalPieces(minutes, parameter) * parameter.performanceRate * parameter.qualityRate;
}

export function floorGoodPieces(value: number): number {
  const stabilized = Math.round(value * 1_000_000) / 1_000_000;
  return Math.max(0, Math.floor(stabilized));
}

export function buildPeriodCapacity(input: {
  operationId: string;
  stationId: string;
  parameters: OperationStationParameter[];
  days: CapacityDayInput[];
  extraChangeoverMinutes?: number;
}): PeriodCapacityResult {
  const extraChangeoverMinutes = Math.max(0, input.extraChangeoverMinutes ?? 0);
  const days = input.days.map(day => dayResult(day, input.parameters, input.operationId, input.stationId));
  const blocked = days.filter(day => day.status === "blocked");
  const calculated = days.filter(day => day.status === "calculated");
  const parameterIds = [...new Set(calculated.flatMap(day => day.parameterId ? [day.parameterId] : []))];
  const bestCaseMinutes = calculated.reduce((sum, day) => sum + day.bestCaseMinutes, 0);
  const mostLikelyMinutes = calculated.reduce((sum, day) => sum + day.mostLikelyMinutes, 0);
  const bestCaseGoodRaw = calculated.reduce((sum, day) => sum + day.bestCaseGoodRaw, 0);
  const mostLikelyGoodRaw = calculated.reduce((sum, day) => sum + day.mostLikelyGoodRaw, 0);
  const base = {
    days, parameterIds, bestCaseMinutes, mostLikelyMinutes, bestCaseGoodRaw, mostLikelyGoodRaw,
    extraChangeoverMinutes, extraChangeoverGoodLossRaw: 0,
  };
  if (blocked.length) {
    return { ...base, calculable: false, reason: blocked.map(day => day.reason).filter(Boolean).join("；") };
  }
  if (extraChangeoverMinutes > 0 && parameterIds.length !== 1) {
    return {
      ...base, calculable: false,
      reason: "月内换型没有发生日期，且整月存在多个参数版本，月件数无法归属",
    };
  }
  const parameter = parameterIds.length === 1
    ? input.parameters.find(item => item.parameterId === parameterIds[0]) : undefined;
  const loss = extraChangeoverMinutes > 0 && parameter ? goodPieces(extraChangeoverMinutes, parameter) : 0;
  const bestRaw = Math.max(0, bestCaseGoodRaw - loss);
  const mostRaw = Math.max(0, mostLikelyGoodRaw - loss);
  return {
    ...base,
    calculable: true,
    bestCaseGoodRaw: bestRaw,
    mostLikelyGoodRaw: mostRaw,
    bestCaseGoodPieces: floorGoodPieces(bestRaw),
    mostLikelyGoodPieces: floorGoodPieces(mostRaw),
    extraChangeoverGoodLossRaw: loss,
  };
}

function dayResult(day: CapacityDayInput, parameters: OperationStationParameter[], operationId: string, stationId: string): CapacityDayResult {
  const blank = {
    date: day.date, workingDay: day.workingDay, bestCaseMinutes: 0, mostLikelyMinutes: 0,
    bestCaseGoodRaw: 0, mostLikelyGoodRaw: 0,
  };
  if (!day.workingDay) return { ...blank, status: "off" };
  if (day.stale) return { ...blank, status: "blocked", reason: `${day.date}：源窗口已过期` };
  const parameter = selectEffectiveParameter(parameters, operationId, stationId, day.date);
  if (!parameter) return { ...blank, status: "blocked", reason: `${day.date}：没有已发布且在该日生效的参数` };
  if (!parameterValid(parameter)) {
    return { ...blank, status: "blocked", parameterId: parameter.parameterId, reason: `${day.date}：参数 ${parameter.parameterId} 的 CT、每循环件数、P 或 Q 无效` };
  }
  return {
    ...blank,
    status: "calculated",
    parameterId: parameter.parameterId,
    ...(parameter.effectiveFrom ? { effectiveFrom: parameter.effectiveFrom } : {}),
    standardCycleSec: parameter.standardCycleSec,
    piecesPerCycle: parameter.piecesPerCycle,
    performanceRate: parameter.performanceRate,
    qualityRate: parameter.qualityRate,
    bestCaseMinutes: day.bestCaseProductionMinutes,
    mostLikelyMinutes: day.mostLikelyProductionMinutes,
    bestCaseGoodRaw: goodPieces(day.bestCaseProductionMinutes, parameter),
    mostLikelyGoodRaw: goodPieces(day.mostLikelyProductionMinutes, parameter),
  };
}

function parameterValid(parameter: OperationStationParameter): boolean {
  return Number.isFinite(parameter.standardCycleSec) && parameter.standardCycleSec > 0
    && Number.isSafeInteger(parameter.piecesPerCycle) && parameter.piecesPerCycle > 0
    && Number.isFinite(parameter.performanceRate) && parameter.performanceRate > 0 && parameter.performanceRate <= 1
    && Number.isFinite(parameter.qualityRate) && parameter.qualityRate > 0 && parameter.qualityRate <= 1;
}
