import standardDemoScenario from './standard-demo-scenario.json';
import recoveredSpatial from './recovered-spatial-ground-truth.json';
import type { Demo2Scenario, Point, RouteSegment, StorageArea, StorageAreaType } from '../types/demo2';

// 2026-09-05 日志重建的参考图；原图和障碍物边界仍未找回。
const base = standardDemoScenario as Demo2Scenario;
const reference = recoveredSpatial;
const imageWidth = reference.originalImageMapping.pngWidth;
const imageHeight = reference.originalImageMapping.pngHeight;
const viewWidth = 1200;
const resize = viewWidth / imageWidth;
const viewHeight = imageHeight * resize;
const metersPerPixel = reference.originalImageMapping.metersPerPixel / resize;
const toPoint = ([x, y]: number[]): Point => ({
  x: (reference.originalImageMapping.originPx[0] + x / reference.originalImageMapping.metersPerPixel) * resize,
  y: (reference.originalImageMapping.originPx[1] + y / reference.originalImageMapping.metersPerPixel) * resize
});
const areaById = new Map(reference.areas.map((area) => [area.id, area]));
const storageDefinitions: Array<{ sourceId: string; id: string; type: StorageAreaType }> = [
  { sourceId: 'main', id: 'sa-main-warehouse', type: 'main_warehouse' },
  { sourceId: 'hb', id: 'sa-high-bay', type: 'high_bay' },
  { sourceId: 'sm', id: 'sa-supermarket', type: 'supermarket' },
  { sourceId: 'wip', id: 'sa-wip', type: 'wip' },
  ...(['A', 'B'] as const).flatMap((line) => [1, 2, 3, 4].map((index) => ({
    sourceId: `ls-${line}${index}`, id: `sa-ls-${line}${index}`, type: 'line_side' as const
  })))
];
const storageAreas: StorageArea[] = storageDefinitions.map(({ sourceId, id, type }) => {
  const source = areaById.get(sourceId);
  if (!source) throw new Error(`Missing reconstructed area: ${sourceId}`);
  return {
    id, name: source.name, type, boundary: source.boundaryM.map(toPoint),
    calculatedAreaM2: source.grossAreaM2
  };
});
const productionLines = (['A', 'B'] as const).map((line) => {
  const source = areaById.get(`line-${line}`);
  if (!source) throw new Error(`Missing reconstructed line: ${line}`);
  return { id: `pl-${line.toLowerCase()}`, name: source.name, boundary: source.boundaryM.map(toPoint) };
});
const productionStations = reference.stations.map((source) => ({
  id: `ps-${source.id.toLowerCase()}`, name: source.name,
  productionLineId: `pl-${source.lineId.toLowerCase()}`,
  operationStepId: `op-${source.id.toLowerCase()}`,
  position: toPoint(source.positionM), cycleTimeSec: source.lineId === 'A' ? 62 : 64
}));
const deliveryPoints = reference.deliveryPoints.map((source) => ({
  id: source.id, name: `${source.id} 配送点`, position: toPoint(source.positionM),
  servesProductionStationIds: [`ps-${source.stationId.toLowerCase()}`],
  storageAreaId: `sa-ls-${source.stationId}`, routeNodeId: source.id
}));
const nodes = reference.pathNetwork.nodes.map((source) => ({
  id: source.id, name: source.id === 'N0' ? '主仓出库口' : `${source.id} 通道节点`, position: toPoint(source.positionM)
}));
const segments: RouteSegment[] = reference.pathNetwork.segments.map((source) => ({
  id: source.id, fromNodeId: source.fromNodeId, toNodeId: source.toNodeId,
  bidirectional: source.bidirectional, clearWidthM: source.clearWidthM, distanceM: source.distanceM
}));
const allocations: Record<string, string[]> = {
  'mat-a1': ['DP-A1', 'DP-A2'], 'mat-a2': ['DP-A2', 'DP-A3', 'DP-A4'],
  'mat-b': ['DP-B1', 'DP-B2'], 'mat-c': ['DP-B3', 'DP-B4']
};

export const factoryLayoutDemoScenario: Demo2Scenario = {
  ...base, id: 'factory-layout-demo-scenario', name: '汽车座椅骨架工厂重建样板',
  layout: {
    ...base.layout, layoutId: 'layout-seat-frame-reconstructed',
    name: '120×60m 工厂 Layout（日志重建参考）', sourceType: 'sample',
    width: viewWidth, height: viewHeight, scaleMetersPerPixel: metersPerPixel,
    calculationScaleMPerPx: metersPerPixel,
    sourceFileName: '01-source-layout-reconstructed.png',
    backgroundDataUrl: '/demo2-reconstructed-layout.png'
  },
  storageAreas, productionLines, productionStations, deliveryPoints,
  pathNetwork: { nodes, segments },
  materials: base.materials.map((material) => ({
    ...material, assignedDeliveryPointId: material.assignedDeliveryPointId.toUpperCase(),
    deliveryPointAllocations: allocations[material.id]?.map((deliveryPointId) => ({ deliveryPointId, share: 1 }))
  })),
  transportResources: [
    { id: 'tr-agv', name: 'AGV 自动搬运车', type: 'agv', quantity: 2, speedMPerMin: 60, huPerTrip: 2, loadingTimeMin: 2, unloadingTimeMin: 2, availabilityRate: 0.9, cvFactor: 1.15 },
    { id: 'tr-dolly', name: 'Dolly / Tugger', type: 'dolly', quantity: 1, speedMPerMin: 50, huPerTrip: 2, loadingTimeMin: 3, unloadingTimeMin: 3, availabilityRate: 0.9, cvFactor: 1.15 },
    { id: 'tr-forklift', name: '叉车', type: 'forklift', quantity: 1, speedMPerMin: 70, huPerTrip: 1, loadingTimeMin: 4, unloadingTimeMin: 4, availabilityRate: 0.85, cvFactor: 1.25 },
    { id: 'tr-pallet-jack', name: '地牛', type: 'pallet_jack', quantity: 1, speedMPerMin: 45, huPerTrip: 1, loadingTimeMin: 4, unloadingTimeMin: 4, availabilityRate: 0.85, cvFactor: 1.2 }
  ],
  waterLevels: base.waterLevels.map((level) => ({
    ...level, locationId: level.locationId.startsWith('dp-') ? level.locationId.toUpperCase() : level.locationId
  })),
  racks: base.racks.map((rack) => ({
    ...rack,
    levels: rack.levels.map((level) => ({
      ...level,
      lanes: level.lanes.map((lane) => ({
        ...lane,
        skuSlots: lane.skuSlots.map((slot) => ({
          ...slot,
          deliveryPointId: slot.deliveryPointId?.startsWith('dp-') ? slot.deliveryPointId.toUpperCase() : slot.deliveryPointId
        }))
      }))
    }))
  }))
};
