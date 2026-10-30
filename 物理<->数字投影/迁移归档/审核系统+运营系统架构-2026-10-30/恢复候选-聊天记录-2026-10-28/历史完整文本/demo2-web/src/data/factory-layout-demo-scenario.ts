import standardDemoScenario from './standard-demo-scenario.json';
import groundTruth from '../../../output/demo2-factory-layout/03-spatial-ground-truth.json';
import layoutImageUrl from '../../../output/demo2-factory-layout/01-source-layout.png';
import type {
  DeliveryPoint,
  Demo2Scenario,
  PathNetwork,
  Point,
  ProductionLine,
  ProductionStation,
  RouteNode,
  RouteSegment,
  StorageArea,
  StorageAreaType
} from '../types/demo2';

type GroundTruthArea = {
  id: string;
  name: string;
  type: StorageAreaType;
  boundaryM: Array<[number, number]>;
  grossAreaM2: number;
};

type GroundTruthStation = {
  id: string;
  name: string;
  lineId: string;
  positionM: [number, number];
};

type GroundTruthDeliveryPoint = {
  id: string;
  stationId: string;
  positionM: [number, number];
};

type GroundTruthRouteNode = {
  id: string;
  positionM: [number, number];
};

type GroundTruthRouteSegment = {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  distanceM: number;
  bidirectional: boolean;
  clearWidthM?: number;
};

const baseScenario = standardDemoScenario as Demo2Scenario;
const gt = groundTruth as {
  imageMapping: {
    demo2CanvasWidth: number;
    demo2CanvasHeight: number;
    demo2OriginPx: [number, number];
    demo2MetersPerPixel: number;
  };
  building: {
    widthM: number;
    heightM: number;
  };
  areas: GroundTruthArea[];
  stations: GroundTruthStation[];
  deliveryPoints: GroundTruthDeliveryPoint[];
  pathNetwork: {
    nodes: GroundTruthRouteNode[];
    segments: GroundTruthRouteSegment[];
  };
};

const metersPerPixel = gt.imageMapping.demo2MetersPerPixel;
const origin = gt.imageMapping.demo2OriginPx;

export const factoryLayoutDemoScenario: Demo2Scenario = {
  ...baseScenario,
  id: 'factory-layout-demo-scenario',
  name: '汽车座椅骨架工厂样板场景',
  layout: {
    ...baseScenario.layout,
    layoutId: 'layout-seat-frame-factory',
    name: '120m x 60m seat frame assembly factory',
    sourceType: 'sample',
    sourceFileName: '01-source-layout.png',
    backgroundDataUrl: layoutImageUrl,
    width: gt.imageMapping.demo2CanvasWidth,
    height: gt.imageMapping.demo2CanvasHeight,
    scaleMetersPerPixel: metersPerPixel,
    calculationScaleMPerPx: metersPerPixel,
    viewScale: 1,
    viewOffsetX: 0,
    viewOffsetY: 0,
    scaleReferencePoints: [toCanvasPoint([0, 0]), toCanvasPoint([10, 0])],
    scaleReferenceDistanceM: 10
  },
  storageAreas: gt.areas.map(toStorageArea),
  productionLines: gt.areas
    .filter((area) => area.type === 'production')
    .map<ProductionLine>((area) => ({
      id: `pl-${area.id}`,
      name: area.name,
      boundary: area.boundaryM.map(toCanvasPoint)
    })),
  productionStations: gt.stations.map(toProductionStation),
  deliveryPoints: gt.deliveryPoints.map(toDeliveryPoint),
  pathNetwork: toPathNetwork()
};

function toCanvasPoint(pointM: [number, number]): Point {
  return {
    x: round1(origin[0] + pointM[0] / metersPerPixel),
    y: round1(origin[1] + pointM[1] / metersPerPixel)
  };
}

function toStorageArea(area: GroundTruthArea): StorageArea {
  return {
    id: `sa-${area.id}`,
    name: area.name,
    type: area.type,
    boundary: area.boundaryM.map(toCanvasPoint),
    calculatedAreaM2: area.grossAreaM2
  };
}

function toProductionStation(station: GroundTruthStation): ProductionStation {
  const lineId = `pl-line-${station.lineId}`;
  const originalStation = baseScenario.productionStations.find((item) => item.id.endsWith(station.id.toLowerCase()));

  return {
    id: `ps-${station.id}`,
    name: `${station.id} ${station.name}`,
    productionLineId: lineId,
    operationStepId: `op-${station.id}`,
    position: toCanvasPoint(station.positionM),
    cycleTimeSec: originalStation?.cycleTimeSec ?? (station.lineId === 'A' ? 62 : 64)
  };
}

function toDeliveryPoint(deliveryPoint: GroundTruthDeliveryPoint): DeliveryPoint {
  return {
    id: deliveryPoint.id,
    name: `${deliveryPoint.id} 配送点`,
    position: toCanvasPoint(deliveryPoint.positionM),
    servesProductionStationIds: [`ps-${deliveryPoint.stationId}`],
    storageAreaId: `sa-ls-${deliveryPoint.stationId}`
  };
}

function toPathNetwork(): PathNetwork {
  const nodes = gt.pathNetwork.nodes.map<RouteNode>((node) => ({
    id: node.id,
    name: routeNodeName(node.id),
    position: toCanvasPoint(node.positionM)
  }));

  const segments = gt.pathNetwork.segments.map<RouteSegment>((segment) => ({
    id: segment.id,
    fromNodeId: segment.fromNodeId,
    toNodeId: segment.toNodeId,
    distanceM: segment.distanceM,
    bidirectional: segment.bidirectional,
    enabled: true,
    clearWidthM: segment.clearWidthM
  }));

  return { nodes, segments };
}

function routeNodeName(nodeId: string) {
  if (nodeId.startsWith('DP-')) return `${nodeId} 交接点`;
  if (nodeId.startsWith('S')) return `线边支路 ${nodeId}`;
  return `主通道 ${nodeId}`;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}
