import type { PeriodCapacityResult } from "./week-month-capacity.js";
import { floorGoodPieces } from "./week-month-capacity.js";
import { calculateStationFlow } from "./station-flow.js";
import type { StationFlowPolicy } from "../domain/types.js";

export type WeekPlanBasis = "snapshot" | "currentParameterRecalc";
export type WeekAllocationMode = "fixedShare" | "forecastCalculated" | "manualScenario";

export interface RouteWeekStationInput {
  productId: string;
  routeId: string;
  operationId: string;
  stationId: string;
  weekStartDate: string;
  ledgerPresent: boolean;
  capacity?: PeriodCapacityResult;
  plannedShare?: number;
  allocationMode?: WeekAllocationMode;
  withBreaksSa?: number;
  mostLikelySa?: number;
  planBasis: WeekPlanBasis;
}

export interface RouteWeekQuantityInput {
  operationId: string;
  unitsPerFinishedProduct?: number;
  issue?: string;
}

/** A 48-hour draft is not complete week evidence. Leave this unset unless a full same-week archive exists. */
export interface RouteWeekActualInput {
  completeSameWeek: boolean;
  routeGoodPieces?: number;
  byOperationGoodPieces?: Record<string, number>;
  sa?: number;
  performanceRate?: number;
  qualityRate?: number;
  note?: string;
}

export interface RouteWeekPlanInput {
  productId: string;
  routeId: string;
  weekStartDate: string;
  role: "review" | "outlook";
  demandQty?: number;
  stations: RouteWeekStationInput[];
  operationOrder: string[];
  operationUnits: RouteWeekQuantityInput[];
  stationFlowPolicies?: StationFlowPolicy[];
  actual?: RouteWeekActualInput;
}

export interface RouteWeekStationResult {
  operationId: string;
  stationId: string;
  included: boolean;
  reason?: string;
  shareApplied?: number;
  shareRule: string;
  nativeBestPieces?: number;
  nativeMostLikelyPieces?: number;
  nativeBestRaw?: number;
  nativeMostLikelyRaw?: number;
  parameterIds: string[];
  standardCycleSec?: number;
  piecesPerCycle?: number;
  performanceRate?: number;
  qualityRate?: number;
  mixedParameters: boolean;
  withBreaksSa?: number;
  mostLikelySa?: number;
  planBasis: WeekPlanBasis;
}

export interface RouteWeekOperationResult {
  operationId: string;
  unitsPerFinishedProduct?: number;
  quantityIssue?: string;
  stationCount: number;
  bestFinishedPieces?: number;
  mostLikelyFinishedPieces?: number;
  actualFinishedPieces?: number;
  isPlanBottleneck: boolean;
  isBestBottleneck: boolean;
  isActualBottleneck: boolean;
}

export interface RouteWeekPlanResult {
  productId: string;
  routeId: string;
  weekStartDate: string;
  role: "review" | "outlook";
  calculable: boolean;
  reasons: string[];
  stations: RouteWeekStationResult[];
  operations: RouteWeekOperationResult[];
  bestCasePieces?: number;
  mostLikelyPieces?: number;
  planBottleneckOperationId?: string;
  bestBottleneckOperationId?: string;
  actualBottleneckOperationId?: string;
  demandQty?: number;
  planMargin?: number;
  actualPieces?: number;
  actualDemandGap?: number;
  planBasis: WeekPlanBasis | "missing";
  actualBlankReason: string;
  actualSa?: number;
  actualPerformanceRate?: number;
  actualQualityRate?: number;
  shareNote: string;
  flowLimited?: boolean;
}

const SHARE_NOTE = "周综合排产沿用工站分配上的占用份额。固定份额乘进路线件数。没有固定份额的工站使用本工站周账件数，不套用 48 小时同窗的 100% 上限。单工站周账页本身不乘份额。";

export function buildRouteWeekPlan(input: RouteWeekPlanInput): RouteWeekPlanResult {
  const reasons: string[] = [];
  const stations = input.stations.map(station => stationResult(station, input, reasons));
  const sharedStationAssignments = new Map<string, RouteWeekStationInput[]>();
  for (const station of input.stations) {
    const assignments = sharedStationAssignments.get(station.stationId) ?? [];
    assignments.push(station);
    sharedStationAssignments.set(station.stationId, assignments);
  }
  let sharedBudgetValid = true;
  for (const [stationId, assignments] of sharedStationAssignments) {
    if (new Set(assignments.map(assignment => assignment.operationId)).size < 2) continue;
    const fixed = assignments.every(assignment => assignment.allocationMode === "fixedShare"
      && assignment.plannedShare !== undefined && Number.isFinite(assignment.plannedShare)
      && assignment.plannedShare > 0 && assignment.plannedShare <= 1);
    const total = assignments.reduce((sum, assignment) => sum + (assignment.plannedShare ?? 0), 0);
    if (!fixed || total > 1 + 1e-9) {
      sharedBudgetValid = false;
      reasons.push(`${stationId}：跨工序共用工站须设固定份额，合计不得超过 100%`);
    }
  }
  const operations = input.operationOrder.map(operationId => {
    const units = input.operationUnits.find(item => item.operationId === operationId);
    const members = stations.filter(station => station.operationId === operationId);
    return operationResult(operationId, members, units, input.role === "outlook" ? undefined : input.actual);
  });
  for (const operation of operations) {
    if (operation.quantityIssue) reasons.push(`${operation.operationId}：${operation.quantityIssue}`);
    if (!operation.stationCount) reasons.push(`${operation.operationId}：没有可排产工站`);
  }
  let routeReady = sharedBudgetValid && operations.length > 0 && operations.every(operation =>
    operation.bestFinishedPieces !== undefined && operation.mostLikelyFinishedPieces !== undefined);
  const constrained = (input.stationFlowPolicies?.length ?? 0) > 0;
  const flowFor = (kind: "best" | "most") => calculateStationFlow(input.operationOrder,
    stations.filter(item => item.included).map(item => ({
      operationId: item.operationId, stationId: item.stationId,
      finishedPieces: (kind === "best" ? item.nativeBestRaw! : item.nativeMostLikelyRaw!) * item.shareApplied!
        / input.operationUnits.find(unit => unit.operationId === item.operationId)!.unitsPerFinishedProduct!,
    })), input.stationFlowPolicies ?? []);
  const bestFlow = routeReady && constrained ? flowFor("best") : undefined;
  const mostFlow = routeReady && constrained ? flowFor("most") : undefined;
  if (bestFlow?.issue || mostFlow?.issue) {
    reasons.push(bestFlow?.issue ?? mostFlow!.issue!);
    routeReady = false;
  }
  const aggregatePlanBottleneck = routeReady ? lowest(operations, "mostLikelyFinishedPieces") : undefined;
  const aggregateBestBottleneck = routeReady ? lowest(operations, "bestFinishedPieces") : undefined;
  const flowLimited = routeReady && constrained && mostFlow?.pieces !== undefined
    && floorGoodPieces(mostFlow.pieces) < aggregatePlanBottleneck!.mostLikelyFinishedPieces!;
  const bestFlowLimited = routeReady && constrained && bestFlow?.pieces !== undefined
    && floorGoodPieces(bestFlow.pieces) < aggregateBestBottleneck!.bestFinishedPieces!;
  const planBottleneck = flowLimited ? undefined : aggregatePlanBottleneck;
  const bestBottleneck = bestFlowLimited ? undefined : aggregateBestBottleneck;
  const actualReady = !constrained && input.role === "review" && input.actual?.completeSameWeek === true
    && operations.every(operation => operation.actualFinishedPieces !== undefined);
  const actualBottleneck = actualReady ? lowest(operations, "actualFinishedPieces") : undefined;
  for (const operation of operations) {
    operation.isPlanBottleneck = operation.operationId === planBottleneck?.operationId;
    operation.isBestBottleneck = operation.operationId === bestBottleneck?.operationId;
    operation.isActualBottleneck = operation.operationId === actualBottleneck?.operationId;
  }
  const included = stations.filter(station => station.included);
  const planBasis = !included.length ? "missing"
    : included.some(station => station.planBasis === "currentParameterRecalc") ? "currentParameterRecalc"
    : "snapshot";
  const demandQty = validDemand(input.demandQty) ? input.demandQty : undefined;
  const mostLikelyPieces = routeReady ? (mostFlow?.pieces === undefined
    ? planBottleneck?.mostLikelyFinishedPieces : floorGoodPieces(mostFlow.pieces)) : undefined;
  const bestCasePieces = routeReady ? (bestFlow?.pieces === undefined
    ? bestBottleneck?.bestFinishedPieces : floorGoodPieces(bestFlow.pieces)) : undefined;
  const actualPieces = actualBottleneck?.actualFinishedPieces;
  const actualBlankReason = constrained && input.role === "review"
    ? "定向流转需要同周逐工站实绩及流向记录；仅有工序合计不能推断路线 Actual。" : actualBlank(input);
  return {
    productId: input.productId,
    routeId: input.routeId,
    weekStartDate: input.weekStartDate,
    role: input.role,
    calculable: routeReady,
    reasons: [...new Set(reasons)],
    stations,
    operations,
    ...(bestCasePieces === undefined ? {} : { bestCasePieces }),
    ...(mostLikelyPieces === undefined ? {} : { mostLikelyPieces }),
    ...(planBottleneck ? { planBottleneckOperationId: planBottleneck.operationId } : {}),
    ...(bestBottleneck ? { bestBottleneckOperationId: bestBottleneck.operationId } : {}),
    ...(actualBottleneck ? { actualBottleneckOperationId: actualBottleneck.operationId } : {}),
    ...(demandQty === undefined ? {} : { demandQty }),
    ...(demandQty !== undefined && mostLikelyPieces !== undefined ? { planMargin: mostLikelyPieces - demandQty } : {}),
    ...(actualPieces === undefined ? {} : { actualPieces }),
    ...(demandQty !== undefined && actualPieces !== undefined ? { actualDemandGap: actualPieces - demandQty } : {}),
    planBasis,
    actualBlankReason,
    ...(input.role === "review" && input.actual?.completeSameWeek && input.actual.sa !== undefined ? { actualSa: input.actual.sa } : {}),
    ...(input.role === "review" && input.actual?.completeSameWeek && input.actual.performanceRate !== undefined ? { actualPerformanceRate: input.actual.performanceRate } : {}),
    ...(input.role === "review" && input.actual?.completeSameWeek && input.actual.qualityRate !== undefined ? { actualQualityRate: input.actual.qualityRate } : {}),
    shareNote: SHARE_NOTE,
    ...(flowLimited ? { flowLimited: true } : {}),
  };
}

function stationResult(station: RouteWeekStationInput, input: RouteWeekPlanInput, reasons: string[]): RouteWeekStationResult {
  const base = {
    operationId: station.operationId,
    stationId: station.stationId,
    parameterIds: station.capacity?.parameterIds ?? [],
    mixedParameters: (station.capacity?.parameterIds.length ?? 0) > 1,
    ...(station.withBreaksSa === undefined ? {} : { withBreaksSa: station.withBreaksSa }),
    ...(station.mostLikelySa === undefined ? {} : { mostLikelySa: station.mostLikelySa }),
    planBasis: station.planBasis,
  };
  const label = `${station.operationId}/${station.stationId}`;
  if (station.productId !== input.productId || station.routeId !== input.routeId) {
    const reason = `${label}：产品或路线与本报告不一致`;
    reasons.push(reason);
    return { ...base, included: false, reason, shareRule: "未纳入" };
  }
  if (station.weekStartDate !== input.weekStartDate) {
    const reason = `${label}：目标周不一致（${station.weekStartDate}）`;
    reasons.push(reason);
    return { ...base, included: false, reason, shareRule: "未纳入" };
  }
  if (!station.ledgerPresent || !station.capacity) {
    const reason = `${label}：缺少这一周的周账`;
    reasons.push(reason);
    return { ...base, included: false, reason, shareRule: "未纳入" };
  }
  if (!station.capacity.calculable
    || station.capacity.bestCaseGoodPieces === undefined
    || station.capacity.mostLikelyGoodPieces === undefined) {
    const reason = `${label}：${station.capacity.reason ?? "周件数不可计算"}`;
    reasons.push(reason);
    return {
      ...base, included: false, reason, shareRule: "未纳入",
      ...nativePieces(station.capacity),
    };
  }
  const share = shareFor(station);
  if (!share.ok) {
    reasons.push(`${label}：${share.reason}`);
    return {
      ...base, included: false, reason: `${label}：${share.reason}`, shareRule: share.rule,
      ...nativePieces(station.capacity),
    };
  }
  const day = station.capacity.days.find(item => item.status === "calculated");
  return {
    ...base,
    included: true,
    shareApplied: share.factor,
    shareRule: share.rule,
    ...nativePieces(station.capacity),
    ...(day?.standardCycleSec === undefined ? {} : { standardCycleSec: day.standardCycleSec }),
    ...(day?.piecesPerCycle === undefined ? {} : { piecesPerCycle: day.piecesPerCycle }),
    ...(day?.performanceRate === undefined ? {} : { performanceRate: day.performanceRate }),
    ...(day?.qualityRate === undefined ? {} : { qualityRate: day.qualityRate }),
  };
}

function shareFor(station: RouteWeekStationInput): { ok: true; factor: number; rule: string } | { ok: false; reason: string; rule: string } {
  if (station.allocationMode === "fixedShare") {
    const share = station.plannedShare;
    if (share === undefined || !Number.isFinite(share) || share <= 0 || share > 1) {
      return { ok: false, reason: "固定占用份额缺失或无效，不能按 48 小时窗口的 100% 代替", rule: "固定份额无效" };
    }
    return { ok: true, factor: share, rule: `固定占用 ${Math.round(share * 1000) / 10}%` };
  }
  if (station.allocationMode === "forecastCalculated" || station.allocationMode === "manualScenario") {
    return { ok: true, factor: 1, rule: "无固定占用份额，使用本工站周账件数，未套用 48 小时窗口上限" };
  }
  return { ok: false, reason: "占用方式未定义，不能按 48 小时窗口的 100% 代替", rule: "占用方式未定义" };
}

function operationResult(
  operationId: string,
  members: RouteWeekStationResult[],
  units: RouteWeekQuantityInput | undefined,
  actual: RouteWeekActualInput | undefined,
): RouteWeekOperationResult {
  const result: RouteWeekOperationResult = {
    operationId,
    stationCount: members.length,
    isPlanBottleneck: false,
    isBestBottleneck: false,
    isActualBottleneck: false,
    ...(units?.unitsPerFinishedProduct === undefined ? {} : { unitsPerFinishedProduct: units.unitsPerFinishedProduct }),
    ...(units?.issue ? { quantityIssue: units.issue } : {}),
  };
  const ready = members.length > 0 && members.every(station => station.included && station.shareApplied !== undefined);
  const factor = units?.unitsPerFinishedProduct;
  const factorOk = factor !== undefined && Number.isSafeInteger(factor) && factor > 0 && !units?.issue;
  if (ready && factorOk && members.every(station => station.nativeBestRaw !== undefined && station.nativeMostLikelyRaw !== undefined)) {
    const bestRaw = members.reduce((sum, station) => sum + station.nativeBestRaw! * station.shareApplied!, 0) / factor;
    const mostRaw = members.reduce((sum, station) => sum + station.nativeMostLikelyRaw! * station.shareApplied!, 0) / factor;
    result.bestFinishedPieces = floorGoodPieces(bestRaw);
    result.mostLikelyFinishedPieces = floorGoodPieces(mostRaw);
  }
  if (actual?.completeSameWeek && actual.byOperationGoodPieces && factorOk) {
    const pieces = actual.byOperationGoodPieces[operationId];
    if (pieces !== undefined && Number.isFinite(pieces) && pieces >= 0) {
      result.actualFinishedPieces = floorGoodPieces(pieces / factor);
    }
  }
  return result;
}

function nativePieces(capacity: PeriodCapacityResult): Pick<RouteWeekStationResult, "nativeBestPieces" | "nativeMostLikelyPieces" | "nativeBestRaw" | "nativeMostLikelyRaw"> {
  return {
    ...(capacity.bestCaseGoodPieces === undefined ? {} : { nativeBestPieces: capacity.bestCaseGoodPieces }),
    ...(capacity.mostLikelyGoodPieces === undefined ? {} : { nativeMostLikelyPieces: capacity.mostLikelyGoodPieces }),
    ...(capacity.calculable ? { nativeBestRaw: capacity.bestCaseGoodRaw, nativeMostLikelyRaw: capacity.mostLikelyGoodRaw } : {}),
  };
}

function lowest(operations: RouteWeekOperationResult[], key: "mostLikelyFinishedPieces" | "bestFinishedPieces" | "actualFinishedPieces"): RouteWeekOperationResult {
  return operations.reduce((selected, item) => item[key]! < selected[key]! ? item : selected);
}

function validDemand(value: number | undefined): value is number {
  return value !== undefined && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(value);
}

function actualBlank(input: RouteWeekPlanInput): string {
  if (input.role === "outlook") return "尚未发生。Actual 留空，Most likely 只出现在计划线，不写成结果或预测。";
  if (!input.actual?.completeSameWeek) {
    return input.actual?.note
      ?? "未提供完整同周实绩。48 小时 R&R 不能按比例扩成整周 Actual。";
  }
  return "";
}
