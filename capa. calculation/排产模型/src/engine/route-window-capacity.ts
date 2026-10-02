import type { OperationStationParameter, TimelineEvent } from "../domain/types.js";
import { reconcileRnrSpeedLoss, type RnrSpeedOptions } from "./rnr-reconciliation.js";
import { reconcileRnrTimeline } from "./rnr-timeline-reconciliation.js";

export interface WindowActualEvent extends TimelineEvent {
  okQty?: number;
  nokQty?: number;
  piecesPerCycle?: number;
}

export interface WindowStationInput {
  productId: string;
  operationId: string;
  stationId: string;
  shareCeiling?: number;
  parameter?: OperationStationParameter;
  planned: TimelineEvent[];
  actual: WindowActualEvent[];
  speedOptions?: RnrSpeedOptions;
}

export interface RouteWindowCapacityInput {
  startMinute: number;
  endMinute: number;
  stations: WindowStationInput[];
  operationIds: string[];
  operationUnitsPerProduct?: Record<string, number>;
  demandQty?: number;
}

export interface StationWindowCapacity {
  operationId: string;
  stationId: string;
  shareCeiling: number;
  plannedProductionMinutes?: number;
  actualProductionMinutes?: number;
  actualSa?: number;
  bestGoodCapacity?: number;
  actualGoodOutput?: number;
  blockers: string[];
}

export interface OperationWindowCapacity {
  operationId: string;
  bestGoodCapacity?: number;
  actualGoodOutput?: number;
  stationCount: number;
}

export interface RouteWindowCapacityResult {
  windowMinutes: number;
  stations: StationWindowCapacity[];
  operations: OperationWindowCapacity[];
  bestGoodCapacity?: number;
  actualGoodOutput?: number;
  demandQty?: number;
  bestGap?: number;
  actualGap?: number;
  bestBottleneckOperationId?: string;
  actualBottleneckOperationId?: string;
}

export function calculateRouteWindowCapacity(input: RouteWindowCapacityInput): RouteWindowCapacityResult {
  const windowMinutes = input.endMinute - input.startMinute;
  if (!Number.isFinite(windowMinutes) || windowMinutes <= 0 || windowMinutes > 2880) {
    throw new RangeError("Observation window must be between 0 and 48 hours");
  }
  if (input.demandQty !== undefined && (!Number.isFinite(input.demandQty) || input.demandQty < 0)) {
    throw new RangeError("Window demand must be nonnegative");
  }
  const keys = new Set<string>();
  const stations = input.stations.map(station => {
    const key = `${station.operationId}::${station.stationId}`;
    if (keys.has(key)) throw new Error(`Duplicate station assignment ${key}`);
    keys.add(key);
    const shareCeiling = station.shareCeiling ?? 1;
    if (!Number.isFinite(shareCeiling) || shareCeiling <= 0 || shareCeiling > 1) {
      throw new RangeError(`${key} share ceiling must be greater than 0 and at most 100%`);
    }
    const result: StationWindowCapacity = {
      operationId: station.operationId, stationId: station.stationId, shareCeiling, blockers: [],
    };
    const parameter = station.parameter;
    if (!parameter || parameter.operationId !== station.operationId || parameter.stationId !== station.stationId
      || !Number.isFinite(parameter.standardCycleSec) || parameter.standardCycleSec <= 0
      || !Number.isFinite(parameter.piecesPerCycle) || parameter.piecesPerCycle <= 0
      || !Number.isFinite(parameter.performanceRate) || parameter.performanceRate <= 0 || parameter.performanceRate > 1
      || !Number.isFinite(parameter.qualityRate) || parameter.qualityRate <= 0 || parameter.qualityRate > 1) {
      result.blockers.push("missing_or_invalid_parameter");
    }
    if (!station.planned.length) {
      result.blockers.push("planned_window_missing");
      return result;
    }
    let timeline: ReturnType<typeof reconcileRnrTimeline>;
    try {
      timeline = reconcileRnrTimeline({
        stationId: station.stationId, startMinute: input.startMinute, endMinute: input.endMinute,
        planned: station.planned, actual: station.actual,
      });
    } catch {
      result.blockers.push("timeline_invalid");
      return result;
    }
    result.plannedProductionMinutes = timeline.plannedProductionMinutes;
    result.actualProductionMinutes = timeline.actualProductionMinutes;
    if (timeline.plannedGapMinutes > 0) result.blockers.push("planned_window_gap");
    if (parameter && !result.blockers.length) {
      result.bestGoodCapacity = timeline.plannedProductionMinutes * shareCeiling * 60
        / parameter.standardCycleSec * parameter.piecesPerCycle
        * parameter.performanceRate * parameter.qualityRate;
    }
    if (!timeline.complete) {
      result.blockers.push("actual_window_incomplete");
      return result;
    }
    const production = station.actual.filter(event => event.kind === "production");
    if (!production.length) {
      result.blockers.push("actual_production_missing");
      return result;
    }
    const speed = reconcileRnrSpeedLoss(production.map(event => ({
      id: event.id, productId: station.productId, operationId: station.operationId, stationId: station.stationId,
      startMinute: event.startMinute, endMinute: event.endMinute,
      okQty: event.okQty ?? -1, nokQty: event.nokQty ?? -1,
      piecesPerCycle: event.piecesPerCycle ?? -1,
    })), station.speedOptions);
    if (!speed.readyForCalibration) {
      result.blockers.push("actual_cycle_or_quantity_invalid");
      return result;
    }
    result.actualSa = (timeline.actualProductionMinutes - speed.inferredSaLossMinutes) / windowMinutes;
    result.actualGoodOutput = production.reduce((sum, event) => sum + (event.okQty ?? 0), 0);
    return result;
  });
  const operations = input.operationIds.map(operationId => {
    const members = stations.filter(station => station.operationId === operationId);
    const result: OperationWindowCapacity = { operationId, stationCount: members.length };
    if (members.length && members.every(station => station.bestGoodCapacity !== undefined)) {
      result.bestGoodCapacity = members.reduce((sum, station) => sum + station.bestGoodCapacity!, 0);
    }
    if (members.length && members.every(station => station.actualGoodOutput !== undefined)) {
      result.actualGoodOutput = members.reduce((sum, station) => sum + station.actualGoodOutput!, 0);
    }
    return result;
  });
  const comparable = operations.length > 0 && operations.every(operation => {
    const factor = input.operationUnitsPerProduct?.[operation.operationId];
    return factor !== undefined && Number.isFinite(factor) && factor > 0;
  });
  const bestReady = comparable && operations.every(operation => operation.bestGoodCapacity !== undefined);
  const actualReady = comparable && operations.every(operation => operation.actualGoodOutput !== undefined);
  const bestBottleneck = bestReady ? operations.reduce((a, b) =>
    a.bestGoodCapacity! / input.operationUnitsPerProduct![a.operationId]!
      <= b.bestGoodCapacity! / input.operationUnitsPerProduct![b.operationId]! ? a : b) : undefined;
  const actualBottleneck = actualReady ? operations.reduce((a, b) =>
    a.actualGoodOutput! / input.operationUnitsPerProduct![a.operationId]!
      <= b.actualGoodOutput! / input.operationUnitsPerProduct![b.operationId]! ? a : b) : undefined;
  const bestGoodCapacity = bestBottleneck
    ? bestBottleneck.bestGoodCapacity! / input.operationUnitsPerProduct![bestBottleneck.operationId]! : undefined;
  const actualGoodOutput = actualBottleneck
    ? actualBottleneck.actualGoodOutput! / input.operationUnitsPerProduct![actualBottleneck.operationId]! : undefined;
  return {
    windowMinutes, stations, operations,
    ...(bestBottleneck ? { bestGoodCapacity: bestGoodCapacity!, bestBottleneckOperationId: bestBottleneck.operationId } : {}),
    ...(actualBottleneck ? { actualGoodOutput: actualGoodOutput!, actualBottleneckOperationId: actualBottleneck.operationId } : {}),
    ...(input.demandQty !== undefined ? { demandQty: input.demandQty } : {}),
    ...(input.demandQty !== undefined && bestGoodCapacity !== undefined ? { bestGap: bestGoodCapacity - input.demandQty } : {}),
    ...(input.demandQty !== undefined && actualGoodOutput !== undefined ? { actualGap: actualGoodOutput - input.demandQty } : {}),
  };
}
