import type {
  AreaRoughCalculation,
  Demo2Scenario,
  ExpansionConstraintRisk,
  HandlingUnit,
  Material,
  MaterialRoughCalculation,
  RiskStatus,
  RoughCalculationResult,
  TransportResource,
  TransportRoughCalculation,
  WaterLevelRoughCalculation
} from '../../types/demo2';
import { calculateTransportPlan } from './transportPlan';

const AREA_ALLOWANCE_FACTOR = 1.45;
const DEFAULT_ROUND_TRIP_DISTANCE_M = 52;
const DEFAULT_DISTANCE_IMPROVEMENT_FACTOR_WITH_SUPERMARKET = 0.72;
const DEFAULT_TRIP_BUFFER_FACTOR = 1.15;

export function calculateRoughMetrics(scenario: Demo2Scenario, supermarketEnabled: boolean): RoughCalculationResult {
  const production = calculateProduction(scenario);
  const materials = scenario.materials.map((material) => calculateMaterial(material, scenario.handlingUnits, production.shiftDemandQty));
  const totalTripsPerShift = sum(materials.map((item) => item.replenishmentTripsPerShift));
  const routeDistance = calculateRepresentativeRoundTripDistance(scenario, supermarketEnabled);
  const transport = scenario.transportResources.map((resource) =>
    calculateTransport(resource, routeDistance, totalTripsPerShift, scenario.productionCalendar.effectiveHoursPerShift)
  );
  const areas = calculateAreas(scenario, materials, supermarketEnabled);
  const waterLevels = scenario.waterLevels.map<WaterLevelRoughCalculation>((item) => ({ ...item, leanSuggestedHuQty: Math.min(item.physicalCapacityHuQty, Math.max(item.minHuQty, item.operatingHuQty)) }));
  for (const material of materials) {
    for (const allocation of material.deliveryPointCalculations) {
      if (waterLevels.some((item) => item.locationId.toLowerCase() === allocation.deliveryPointId.toLowerCase() && item.materialId === material.materialId)) continue;
      const point = scenario.deliveryPoints.find((item) => item.id === allocation.deliveryPointId);
      const area = scenario.storageAreas.find((item) => item.id === point?.storageAreaId);
      const hu = scenario.handlingUnits.find((item) => item.materialId === material.materialId);
      const batch = Math.max(1, Math.ceil(allocation.huDemandPerShift / allocation.replenishmentTripsPerShift));
      const capacity = area && hu ? Math.max(1, Math.floor((area.overrideAreaM2 ?? area.calculatedAreaM2) * 0.68 / Math.max(0.01, hu.lengthM * hu.widthM) * (hu.stackable ? hu.maxStackLayers : 1))) : batch + 2;
      waterLevels.push({locationId:allocation.deliveryPointId,materialId:material.materialId,currentHuQty:batch,minHuQty:1,operatingHuQty:batch,leanSuggestedHuQty:Math.min(batch,capacity),maxHuQty:Math.max(batch,Math.ceil(batch*1.5)),physicalCapacityHuQty:capacity,riskStatus:batch>capacity?'warning':'normal'});
    }
  }
  const rawTransportPlan = calculateTransportPlan(scenario, materials);
  const transportPlan = {
    ...rawTransportPlan,
    resourceLoads: rawTransportPlan.resourceLoads.map((load) => {
      const resource = transport.find((item) => scenario.transportResources.find((entry) => entry.id === item.resourceId)?.type === load.resourceType);
      return { ...load, utilizationRate: resource?.utilizationRate ?? 0, requiredResourceQty: resource?.requiredResourceQty ?? 0 };
    })
  };
  const expansionRisks = calculateExpansionRisks(transport, areas, waterLevels, scenario);

  return {
    production,
    materials,
    transport,
    transportPlan,
    areas,
    waterLevels,
    expansionRisks,
    assumptions: [
      '第一版采用 rough calculation：用于售前判断和方案沟通，不作为最终可施工 Layout。',
      '距离优先使用标准样板路径网络；真实客户导入 Layout 后，由比例尺和人工标注路线重新计算。',
      '运输任务动画表达补货任务节奏，不代表高精度交通仿真或多车实时调度。',
      '面积需求基于 HU 占地面积、堆叠层数和通道/操作余量估算，后续需结合消防、通道、设备转弯半径和地坪承载修正。',
      'EffectiveHoursPerShift 后续会展开为 PlannedEffectiveProductionTimePerShift，并结合 with-breaks OEE 计算。'
    ]
  };
}

function calculateProduction(scenario: Demo2Scenario) {
  const { weeklyDemandQty, productionDaysPerWeek, shiftsPerDay, effectiveHoursPerShift } = scenario.productionCalendar;
  const dailyDemandQty = safeDivide(weeklyDemandQty, productionDaysPerWeek);
  const shiftDemandQty = safeDivide(dailyDemandQty, shiftsPerDay);
  const effectiveMinutesPerShift = effectiveHoursPerShift * 60;
  const requiredOutputPerHour = safeDivide(shiftDemandQty, effectiveHoursPerShift);

  return {
    weeklyDemandQty,
    dailyDemandQty,
    shiftDemandQty,
    effectiveMinutesPerShift,
    requiredOutputPerHour
  };
}

function calculateMaterial(material: Material, handlingUnits: HandlingUnit[], shiftDemandQty: number): MaterialRoughCalculation {
  const hu = findHu(material, handlingUnits);
  const demandPerShiftQty = shiftDemandQty * material.qtyPerFinishedGood;
  const dailyDemandQty = demandPerShiftQty * 2;
  const allocations = material.deliveryPointAllocations?.length ? material.deliveryPointAllocations : [{ deliveryPointId: material.assignedDeliveryPointId, share: 1 }];
  const deliveryPointCalculations = allocations.map((allocation) => {
    const pointDemand = demandPerShiftQty * allocation.share;
    const pointHu = Math.ceil(safeDivide(pointDemand, hu.qtyPerHu));
    return { deliveryPointId: allocation.deliveryPointId, demandPerShiftQty: round0(pointDemand), huDemandPerShift: pointHu, replenishmentTripsPerShift: Math.max(1, Math.ceil(pointHu / Math.max(1, material.targetHuPerReplenishment ?? 2))) };
  });
  const huDemandPerShift = sum(deliveryPointCalculations.map((item) => item.huDemandPerShift));
  const replenishmentTripsPerShift = sum(deliveryPointCalculations.map((item) => item.replenishmentTripsPerShift));
  const binQtyRequired = Math.max(1, Math.ceil(huDemandPerShift * 1.25));
  const effectiveStackLayers = hu.stackable ? Math.max(1, hu.maxStackLayers) : 1;
  const storageAreaRequiredM2 = round1((hu.lengthM * hu.widthM * binQtyRequired * AREA_ALLOWANCE_FACTOR) / effectiveStackLayers);

  return {
    materialId: material.id,
    materialName: material.name,
    dailyDemandQty: round0(dailyDemandQty),
    demandPerShiftQty: round0(demandPerShiftQty),
    huDemandPerShift,
    replenishmentTripsPerShift,
    binQtyRequired,
    storageAreaRequiredM2,
    frequencyClass: material.frequencyClass,
    strategyClass: material.strategyClass,
    assignedDeliveryPointId: material.assignedDeliveryPointId,
    deliveryPointCalculations
  };
}

function calculateTransport(
  resource: TransportResource,
  roundTripDistanceM: number,
  totalTripsPerShift: number,
  effectiveHoursPerShift: number
): TransportRoughCalculation {
  const singleTripTimeMin = round1(roundTripDistanceM / 2 / resource.speedMPerMin + resource.loadingTimeMin + resource.unloadingTimeMin);
  const roundTripTimeMin = round1((roundTripDistanceM / resource.speedMPerMin + resource.loadingTimeMin + resource.unloadingTimeMin) * resource.cvFactor);
  const tripsRequiredPerShift = Math.ceil((totalTripsPerShift * DEFAULT_TRIP_BUFFER_FACTOR) / Math.max(1, resource.huPerTrip));
  const availableTripsPerShift = Math.floor(
    safeDivide(effectiveHoursPerShift * 60 * resource.availabilityRate * resource.quantity, roundTripTimeMin)
  );
  const requiredResourceQty = Math.max(
    1,
    Math.ceil(safeDivide(tripsRequiredPerShift * roundTripTimeMin, effectiveHoursPerShift * 60 * resource.availabilityRate))
  );
  const utilizationRate = clamp(safeDivide(tripsRequiredPerShift, Math.max(1, availableTripsPerShift)), 0, 1.5);

  return {
    resourceId: resource.id,
    resourceName: resource.name,
    roundTripDistanceM: round1(roundTripDistanceM),
    singleTripTimeMin,
    roundTripTimeMin,
    tripsRequiredPerShift,
    availableTripsPerShift,
    requiredResourceQty,
    configuredResourceQty: resource.quantity,
    utilizationRate: round2(utilizationRate),
    riskStatus: riskFromUtilization(utilizationRate)
  };
}

function calculateAreas(
  scenario: Demo2Scenario,
  materials: MaterialRoughCalculation[],
  supermarketEnabled: boolean
): AreaRoughCalculation[] {
  const requiredByArea = new Map<string, number>();

  for (const material of materials) {
    const areaId = inferStorageAreaId(scenario, material.materialId, supermarketEnabled);
    requiredByArea.set(areaId, (requiredByArea.get(areaId) ?? 0) + material.storageAreaRequiredM2);
  }

  return scenario.storageAreas.map((area) => {
    const requiredAreaM2 = round1(requiredByArea.get(area.id) ?? area.calculatedAreaM2 * 0.18);
    const effectiveAreaM2 = area.overrideAreaM2 ?? area.calculatedAreaM2;
    const utilizationRate = clamp(safeDivide(requiredAreaM2, effectiveAreaM2), 0, 1.5);

    return {
      storageAreaId: area.id,
      storageAreaName: area.name,
      calculatedAreaM2: area.calculatedAreaM2,
      effectiveAreaM2,
      requiredAreaM2,
      utilizationRate: round2(utilizationRate),
      riskStatus: riskFromUtilization(utilizationRate)
    };
  });
}

function calculateExpansionRisks(
  transport: TransportRoughCalculation[],
  areas: AreaRoughCalculation[],
  waterLevels: WaterLevelRoughCalculation[],
  scenario: Demo2Scenario
): ExpansionConstraintRisk[] {
  const maxTransportUtilization = Math.max(...transport.map((item) => item.utilizationRate));
  const maxAreaUtilization = Math.max(...areas.map((item) => item.utilizationRate));
  const overCapacityWaterLevels = waterLevels.filter((item) => item.maxHuQty > item.physicalCapacityHuQty);
  const averageCycleTime = safeDivide(sum(scenario.productionStations.map((item) => item.cycleTimeSec ?? 0)), scenario.productionStations.length);
  const taktRisk = averageCycleTime > 65 ? 'warning' : 'normal';

  return [
    {
      id: 'risk-production-takt',
      dimension: 'production',
      title: '生产节拍约束',
      description: `样板场景平均工站节拍约 ${round1(averageCycleTime)} 秒；后续扩产需校验瓶颈工站与有效生产时间。`,
      riskStatus: taktRisk
    },
    {
      id: 'risk-storage-area',
      dimension: 'storage_area',
      title: '物理场地约束',
      description: `最高存储区面积利用率约 ${Math.round(maxAreaUtilization * 100)}%，高于 85% 时需考虑高位货架、超市区重排或线边库存下降。`,
      riskStatus: riskFromUtilization(maxAreaUtilization)
    },
    {
      id: 'risk-transport-capacity',
      dimension: 'transport_capacity',
      title: '运输工具能力约束',
      description: `最高运输工具负荷约 ${Math.round(maxTransportUtilization * 100)}%，高于 85% 时需评估新增运输资源或降低补货频次波动。`,
      riskStatus: riskFromUtilization(maxTransportUtilization)
    },
    {
      id: 'risk-water-level',
      dimension: 'wip',
      title: 'HU 水位 / 物理容量约束',
      description: overCapacityWaterLevels.length
        ? `${overCapacityWaterLevels.length} 个位置的 Max HU 高于 Physical Capacity HU，需要调整 bin 位或存储策略。`
        : '当前 Max HU 未超过 Physical Capacity HU；仍需在真实 Layout 中复核通道和操作空间。',
      riskStatus: overCapacityWaterLevels.length > 0 ? 'warning' : 'normal'
    },
    {
      id: 'risk-traffic-path',
      dimension: 'traffic_path',
      title: '运输路径干涉约束',
      description: '第一版只提示通道风险，不承诺多车避让、会车等待和 WCS 级调度结果。',
      riskStatus: maxTransportUtilization > 0.85 ? 'warning' : 'normal'
    }
  ];
}

function calculateRepresentativeRoundTripDistance(scenario: Demo2Scenario, supermarketEnabled: boolean) {
  const totalNetworkDistance = sum(scenario.pathNetwork.segments.map((segment) => segment.distanceM));
  const averageOneWayDistance = safeDivide(totalNetworkDistance, scenario.pathNetwork.segments.length);
  const roundTrip = averageOneWayDistance * 2 || DEFAULT_ROUND_TRIP_DISTANCE_M;
  return supermarketEnabled ? roundTrip * DEFAULT_DISTANCE_IMPROVEMENT_FACTOR_WITH_SUPERMARKET : roundTrip;
}

function inferStorageAreaId(scenario: Demo2Scenario, materialId: string, supermarketEnabled: boolean) {
  const material = scenario.materials.find((item) => item.id === materialId);
  const mainWarehouse = scenario.storageAreas.find((item) => item.type === 'main_warehouse')?.id ?? scenario.storageAreas[0]?.id;
  const supermarket = scenario.storageAreas.find((item) => item.type === 'supermarket')?.id ?? mainWarehouse;
  const highBay = scenario.storageAreas.find((item) => item.type === 'high_bay')?.id ?? mainWarehouse;
  const lineSide = scenario.storageAreas.find((item) => item.type === 'line_side')?.id ?? mainWarehouse;

  if (!material) return mainWarehouse;
  if (material.strategyClass === 'C_low_frequency_rackable_part') return highBay;
  if (material.strategyClass === 'A2_high_frequency_large_part') return lineSide;
  if (supermarketEnabled && material.strategyClass !== 'D_special_constraint_part') return supermarket;
  return mainWarehouse;
}

function findHu(material: Material, handlingUnits: HandlingUnit[]) {
  const hu = handlingUnits.find((item) => item.materialId === material.id);
  if (!hu) {
    return {
      qtyPerHu: 1,
      lengthM: 1,
      widthM: 1,
      stackable: false,
      maxStackLayers: 1
    } as HandlingUnit;
  }
  return hu;
}

function riskFromUtilization(utilizationRate: number): RiskStatus {
  if (utilizationRate >= 1) return 'critical';
  if (utilizationRate >= 0.85) return 'warning';
  return 'normal';
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round0(value: number) {
  return Math.round(value);
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round2(value: number) {
  return Math.round(value * 100) / 100;
}
